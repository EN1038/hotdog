/**
 * List visible menus missing sale and/or skewer images (for team sharing).
 * Excludes promotion category by default.
 *
 *   npx tsx scripts/list-menus-missing-images.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function has(u?: string | null) {
  return Boolean(u?.trim());
}

function isPromoCategory(name: string) {
  const n = name.trim().toLocaleLowerCase("th");
  return n.includes("โปรโมชั่น") || n.includes("โปรโมชัน") || n === "promo";
}

function missingLabel(missingSale: boolean, missingSkewer: boolean) {
  if (missingSale && missingSkewer) return "ขาดทั้งขาย+เสียบ";
  if (missingSale) return "ขาดฝั่งขาย";
  if (missingSkewer) return "ขาดฝั่งเสียบ";
  return "";
}

type Gap = {
  brand: string;
  brandCode: string;
  branch: string;
  category: string;
  name: string;
  itemCode: string;
  missingSale: boolean;
  missingSkewer: boolean;
};

function menuKey(g: Gap) {
  return g.itemCode
    ? `code:${g.itemCode}`
    : `name:${g.category}:${g.name.trim().toLocaleLowerCase("th")}`;
}

type Unique = {
  brand: string;
  category: string;
  name: string;
  itemCode: string;
  branches: string[];
  missingSale: boolean;
  missingSkewer: boolean;
};

function collectUnique(rows: Gap[]) {
  const map = new Map<string, Unique>();
  for (const g of rows) {
    const k = `${g.brandCode}|${menuKey(g)}`;
    const cur = map.get(k);
    if (!cur) {
      map.set(k, {
        brand: g.brand,
        category: g.category,
        name: g.name,
        itemCode: g.itemCode,
        branches: [g.branch],
        missingSale: g.missingSale,
        missingSkewer: g.missingSkewer,
      });
    } else {
      if (!cur.branches.includes(g.branch)) cur.branches.push(g.branch);
      // If any branch is missing a side, keep that flag for the menu.
      cur.missingSale = cur.missingSale || g.missingSale;
      cur.missingSkewer = cur.missingSkewer || g.missingSkewer;
    }
  }
  return map;
}

function byBrand(map: Map<string, Unique>) {
  const out = new Map<string, Unique[]>();
  for (const v of map.values()) {
    const list = out.get(v.brand) ?? [];
    list.push(v);
    out.set(v.brand, list);
  }
  for (const [, list] of out) {
    list.sort(
      (a, b) =>
        a.category.localeCompare(b.category, "th") ||
        a.name.localeCompare(b.name, "th"),
    );
  }
  return out;
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

  const items = await prisma.branchMenuItem.findMany({
    where: { isHidden: false },
    select: {
      name: true,
      itemCode: true,
      imageUrl: true,
      skewerImageUrl: true,
      category: { select: { name: true } },
      branch: {
        select: {
          name: true,
          brand: { select: { name: true, code: true } },
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });

  const gaps: Gap[] = [];
  let skippedPromo = 0;
  for (const i of items) {
    if (!i.branch.brand) continue;
    const category = i.category?.name ?? "-";
    if (isPromoCategory(category)) {
      skippedPromo += 1;
      continue;
    }
    const missingSale = !has(i.imageUrl);
    const missingSkewer = !has(i.skewerImageUrl);
    if (!missingSale && !missingSkewer) continue;
    gaps.push({
      brand: i.branch.brand.name,
      brandCode: i.branch.brand.code,
      branch: i.branch.name,
      category,
      name: i.name,
      itemCode: i.itemCode?.trim() || "",
      missingSale,
      missingSkewer,
    });
  }

  const both = gaps.filter((g) => g.missingSale && g.missingSkewer);
  const saleOnly = gaps.filter((g) => g.missingSale && !g.missingSkewer);
  const skewerOnly = gaps.filter((g) => !g.missingSale && g.missingSkewer);

  const allUnique = collectUnique(gaps);
  const byBrandMap = byBrand(allUnique);

  const lines: string[] = [];
  lines.push("📋 เมนูที่ยังขาดรูป (ตัดหมวดโปรโมชั่นแล้ว)");
  lines.push("ระบุ: ขาดฝั่งขาย / ขาดฝั่งเสียบ / ขาดทั้งขาย+เสียบ");
  lines.push("");
  lines.push(
    `สรุป: ${allUnique.size} เมนูไม่ซ้ำ / ${gaps.length} แถวสาขา (ตัดโปรโมชั่น ${skippedPromo} แถว)`,
  );
  lines.push(`  ขาดทั้งขาย+เสียบ: ${both.length} แถว`);
  lines.push(`  ขาดฝั่งขายอย่างเดียว: ${saleOnly.length} แถว`);
  lines.push(`  ขาดฝั่งเสียบอย่างเดียว: ${skewerOnly.length} แถว`);
  lines.push("");

  for (const [brand, list] of [...byBrandMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "th"),
  )) {
    const bothN = list.filter((x) => x.missingSale && x.missingSkewer).length;
    const saleN = list.filter((x) => x.missingSale && !x.missingSkewer).length;
    const skewerN = list.filter(
      (x) => !x.missingSale && x.missingSkewer,
    ).length;
    lines.push(
      `—— ${brand} (${list.length}) · ทั้งคู่ ${bothN} / ขาย ${saleN} / เสียบ ${skewerN} ——`,
    );
    let cat = "";
    for (const item of list) {
      if (item.category !== cat) {
        cat = item.category;
        lines.push("");
        lines.push(`▸ ${cat}`);
      }
      const code = item.itemCode ? ` [${item.itemCode}]` : "";
      const miss = missingLabel(item.missingSale, item.missingSkewer);
      lines.push(`• ${item.name}${code} — ${miss}`);
    }
    lines.push("");
  }

  // Shared names across brands (non-Demo)
  const nameMap = new Map<
    string,
    { brands: Set<string>; missingSale: boolean; missingSkewer: boolean }
  >();
  for (const v of allUnique.values()) {
    if (v.brand.includes("Demo")) continue;
    const n = v.name.trim();
    const cur = nameMap.get(n);
    if (!cur) {
      nameMap.set(n, {
        brands: new Set([v.brand]),
        missingSale: v.missingSale,
        missingSkewer: v.missingSkewer,
      });
    } else {
      cur.brands.add(v.brand);
      cur.missingSale = cur.missingSale || v.missingSale;
      cur.missingSkewer = cur.missingSkewer || v.missingSkewer;
    }
  }
  const shared = [...nameMap.entries()]
    .filter(([, v]) => v.brands.size >= 2)
    .sort((a, b) => a[0].localeCompare(b[0], "th"));
  lines.push(
    "—— ชื่อเมนูที่ขาดรูปเหมือนกันหลายแบรนด์ (ไม่นับ Demo) ——",
  );
  lines.push(`รวม ${shared.length} ชื่อ`);
  for (const [name, v] of shared) {
    const miss = missingLabel(v.missingSale, v.missingSkewer);
    lines.push(
      `• ${name} — ${miss} → ${[...v.brands].sort((a, b) => a.localeCompare(b, "th")).join(" / ")}`,
    );
  }

  const text = lines.join("\n");
  const outPath = "scripts/menus-missing-images-line.txt";
  writeFileSync(outPath, text, "utf8");
  console.log(text);
  console.log(`\nWrote ${outPath}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
