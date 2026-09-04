/**
 * Sync menu images across ALL brands and branches.
 *
 * Match key: Thai-normalized menu name (codes often differ across brands).
 * Promo categories are skipped.
 *
 * For each match group:
 *  - pick newest row that has both sale+skewer as canonical pair
 *  - else best sale + best skewer by updatedAt; mirror if only one side exists
 *  - write that pair onto every row in the group so all brands/branches match
 *
 * Usage:
 *   npx tsx scripts/sync-menu-images-across-branches.ts
 *   npx tsx scripts/sync-menu-images-across-branches.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");

function normName(s: string) {
  return s.trim().toLocaleLowerCase("th");
}

function isPromoCategory(name: string | null) {
  const n = (name ?? "").trim().toLocaleLowerCase("th");
  return n.includes("โปรโมชั่น") || n.includes("โปรโมชัน") || n === "promo";
}

type Row = {
  id: string;
  branchId: string;
  itemCode: string | null;
  name: string;
  imageUrl: string | null;
  skewerImageUrl: string | null;
  updatedAt: Date;
  categoryName: string | null;
  brandId: string;
  brandCode: string;
  brandName: string;
  branchCode: string | null;
  branchName: string;
};

function pickBestUrl(
  rows: Row[],
  field: "imageUrl" | "skewerImageUrl",
): { url: string; updatedAt: Date } | null {
  let best: { url: string; updatedAt: Date } | null = null;
  for (const row of rows) {
    const url = row[field]?.trim() || "";
    if (!url) continue;
    if (!best || row.updatedAt > best.updatedAt) {
      best = { url, updatedAt: row.updatedAt };
    }
  }
  return best;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool, {
      schema: process.env.DATABASE_SCHEMA ?? "public",
      disposeExternalPool: false,
    }),
  });

  console.log(APPLY ? "MODE: APPLY (all brands)" : "MODE: dry-run (all brands)");

  const items = await prisma.branchMenuItem.findMany({
    where: { isHidden: false },
    select: {
      id: true,
      branchId: true,
      itemCode: true,
      name: true,
      imageUrl: true,
      skewerImageUrl: true,
      updatedAt: true,
      category: { select: { name: true } },
      branch: {
        select: {
          name: true,
          code: true,
          brandId: true,
          brand: { select: { code: true, name: true } },
        },
      },
    },
  });

  const rows: Row[] = items
    .filter((i) => i.branch.brandId && i.branch.brand)
    .filter((i) => !isPromoCategory(i.category?.name ?? null))
    .map((i) => ({
      id: i.id,
      branchId: i.branchId,
      itemCode: i.itemCode,
      name: i.name,
      imageUrl: i.imageUrl,
      skewerImageUrl: i.skewerImageUrl,
      updatedAt: i.updatedAt,
      categoryName: i.category?.name ?? null,
      brandId: i.branch.brandId!,
      brandCode: i.branch.brand!.code,
      brandName: i.branch.brand!.name,
      branchCode: i.branch.code,
      branchName: i.branch.name,
    }));

  // Cross-brand: same menu name shares one image pair everywhere.
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `name:${normName(row.name)}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  type Patch = {
    id: string;
    name: string;
    brand: string;
    branch: string;
    before: { imageUrl: string | null; skewerImageUrl: string | null };
    after: { imageUrl: string | null; skewerImageUrl: string | null };
    reasons: string[];
  };

  const patches: Patch[] = [];
  let fillSale = 0;
  let fillSkewer = 0;
  let mirror = 0;
  let align = 0;

  for (const [, group] of groups) {
    const bestSale = pickBestUrl(group, "imageUrl");
    const bestSkewer = pickBestUrl(group, "skewerImageUrl");

    let canonSale = bestSale?.url ?? null;
    let canonSkewer = bestSkewer?.url ?? null;

    // Newest row that already has both sides = preferred verified pair.
    const withBoth = [...group]
      .filter((r) => r.imageUrl?.trim() && r.skewerImageUrl?.trim())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

    if (withBoth) {
      canonSale = withBoth.imageUrl!.trim();
      canonSkewer = withBoth.skewerImageUrl!.trim();
    } else {
      // Prefer independently newest per side, then mirror so both exist.
      if (canonSale && !canonSkewer) canonSkewer = canonSale;
      if (canonSkewer && !canonSale) canonSale = canonSkewer;
    }

    // Nothing to propagate in this name group.
    if (!canonSale && !canonSkewer) continue;

    for (const row of group) {
      const beforeSale = row.imageUrl?.trim() || null;
      const beforeSkewer = row.skewerImageUrl?.trim() || null;
      let nextSale = beforeSale;
      let nextSkewer = beforeSkewer;
      const reasons: string[] = [];

      if (canonSale && nextSale !== canonSale) {
        if (!nextSale) fillSale += 1;
        else align += 1;
        nextSale = canonSale;
        reasons.push(beforeSale ? "align-sale" : "fill-sale");
      }
      if (canonSkewer && nextSkewer !== canonSkewer) {
        if (!beforeSkewer) fillSkewer += 1;
        else align += 1;
        nextSkewer = canonSkewer;
        reasons.push(beforeSkewer ? "align-skewer" : "fill-skewer");
      }

      // Guarantee both sides when we have at least one.
      if (nextSale && !nextSkewer) {
        nextSkewer = nextSale;
        mirror += 1;
        reasons.push("mirror-sale→skewer");
      }
      if (nextSkewer && !nextSale) {
        nextSale = nextSkewer;
        mirror += 1;
        reasons.push("mirror-skewer→sale");
      }

      if (nextSale === beforeSale && nextSkewer === beforeSkewer) continue;
      if (reasons.length === 0) continue;

      patches.push({
        id: row.id,
        name: row.name,
        brand: `${row.brandName} (${row.brandCode})`,
        branch: `${row.branchName}${row.branchCode ? ` /${row.branchCode}` : ""}`,
        before: { imageUrl: beforeSale, skewerImageUrl: beforeSkewer },
        after: { imageUrl: nextSale, skewerImageUrl: nextSkewer },
        reasons,
      });
    }
  }

  console.log(`\nVisible non-promo menu rows: ${rows.length}`);
  console.log(`Name match groups: ${groups.size}`);
  console.log(`Rows to update: ${patches.length}`);
  console.log(`  fill sale: ~${fillSale}`);
  console.log(`  fill skewer: ~${fillSkewer}`);
  console.log(`  align existing: ~${align}`);
  console.log(`  mirror one-side: ~${mirror}`);

  const byBrand = new Map<string, number>();
  for (const p of patches) {
    byBrand.set(p.brand, (byBrand.get(p.brand) ?? 0) + 1);
  }
  console.log("\nUpdates by brand:");
  for (const [b, n] of [...byBrand.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${b}: ${n}`);
  }

  console.log("\nSample (first 25):");
  for (const p of patches.slice(0, 25)) {
    console.log(
      `• ${p.brand} › ${p.branch} › ${p.name} [${p.reasons.join(", ")}]`,
    );
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to write.");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  let updated = 0;
  for (const p of patches) {
    await prisma.branchMenuItem.update({
      where: { id: p.id },
      data: {
        imageUrl: p.after.imageUrl,
        skewerImageUrl: p.after.skewerImageUrl,
      },
    });
    updated += 1;
    if (updated % 100 === 0) {
      console.log(`  updated ${updated}/${patches.length}…`);
    }
  }

  console.log(`\nDone. Updated ${updated} menu rows.`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
