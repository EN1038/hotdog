/**
 * Sync menu images across branches within each brand.
 *
 * Match key: itemCode if set, else name + category name (Thai-normalized).
 * For each match group:
 *  - pick best sale imageUrl and best skewerImageUrl (prefer most recently updated)
 *  - fill blanks on all rows in the group
 *  - if one side missing on a row, copy from the other side when available
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

function matchKey(item: {
  itemCode: string | null;
  name: string;
  categoryName: string | null;
}): string {
  const code = item.itemCode?.trim();
  if (code) return `code:${code}`;
  return `name:${item.categoryName ?? ""}:${normName(item.name)}`;
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
): { url: string; fromId: string; updatedAt: Date } | null {
  let best: { url: string; fromId: string; updatedAt: Date } | null = null;
  for (const row of rows) {
    const url = row[field]?.trim() || "";
    if (!url) continue;
    if (!best || row.updatedAt > best.updatedAt) {
      best = { url, fromId: row.id, updatedAt: row.updatedAt };
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

  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

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

  // Group by brand + match key
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${row.brandId}::${matchKey(row)}`;
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
  let missingSale = 0;
  let missingSkewer = 0;
  let saleSkewerMismatch = 0;

  for (const [, group] of groups) {
    const bestSale = pickBestUrl(group, "imageUrl");
    const bestSkewer = pickBestUrl(group, "skewerImageUrl");

    // Prefer a shared "canonical" pair from the newest row that has both,
    // else independently best sale + best skewer.
    let canonSale = bestSale?.url ?? null;
    let canonSkewer = bestSkewer?.url ?? null;

    const withBoth = [...group]
      .filter((r) => r.imageUrl?.trim() && r.skewerImageUrl?.trim())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    if (withBoth) {
      canonSale = withBoth.imageUrl!.trim();
      canonSkewer = withBoth.skewerImageUrl!.trim();
    } else {
      // If only one side exists brand-wide, mirror onto the other for fill.
      if (canonSale && !canonSkewer) canonSkewer = canonSale;
      if (canonSkewer && !canonSale) canonSale = canonSkewer;
    }

    for (const row of group) {
      let nextSale = row.imageUrl?.trim() || null;
      let nextSkewer = row.skewerImageUrl?.trim() || null;
      const reasons: string[] = [];

      if (!nextSale && canonSale) {
        nextSale = canonSale;
        reasons.push("fill-sale");
        missingSale += 1;
      }
      if (!nextSkewer && canonSkewer) {
        nextSkewer = canonSkewer;
        reasons.push("fill-skewer");
        missingSkewer += 1;
      }

      // Align within row: if one side empty after fill attempt, copy peer
      if (nextSale && !nextSkewer) {
        nextSkewer = nextSale;
        reasons.push("mirror-sale→skewer");
      }
      if (nextSkewer && !nextSale) {
        nextSale = nextSkewer;
        reasons.push("mirror-skewer→sale");
      }

      // If both exist but differ, upgrade to newest verified pair when available.
      if (
        withBoth &&
        canonSale &&
        canonSkewer &&
        (nextSale !== canonSale || nextSkewer !== canonSkewer)
      ) {
        saleSkewerMismatch += 1;
        nextSale = canonSale;
        nextSkewer = canonSkewer;
        reasons.push("align-to-newest-pair");
      }

      const beforeSale = row.imageUrl?.trim() || null;
      const beforeSkewer = row.skewerImageUrl?.trim() || null;
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

  console.log(`\nVisible menu rows: ${rows.length}`);
  console.log(`Match groups: ${groups.size}`);
  console.log(`Rows to update: ${patches.length}`);
  console.log(`  fill missing sale: ~${missingSale}`);
  console.log(`  fill missing skewer: ~${missingSkewer}`);
  console.log(`  align to newest pair: ~${saleSkewerMismatch}`);

  const byBrand = new Map<string, number>();
  for (const p of patches) {
    byBrand.set(p.brand, (byBrand.get(p.brand) ?? 0) + 1);
  }
  console.log("\nUpdates by brand:");
  for (const [b, n] of [...byBrand.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${b}: ${n}`);
  }

  console.log("\nSample (first 20):");
  for (const p of patches.slice(0, 20)) {
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
  // Batch updates
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
