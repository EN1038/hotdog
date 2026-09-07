/**
 * Add CONSUMABLE items to every STORE branch of หม่าล่าไวไว:
 *   - แป้งทอดกรอบ (unit: 1000 กรัม)
 *   - น้ำมันพืช (unit: 1000 กรัม)
 *
 * Idempotent by name within stockType=CONSUMABLE. Starting quantity = 0.
 *
 *   npx tsx scripts/add-malawaiwai-consumables-flour-oil.ts
 *   npx tsx scripts/add-malawaiwai-consumables-flour-oil.ts --apply
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BRAND_CODE = "hma-la-hna-pak-sxy-phed-lin-cha";

const ITEMS = [
  { name: "แป้งทอดกรอบ", unit: "1000 กรัม" },
  { name: "น้ำมันพืช", unit: "1000 กรัม" },
] as const;

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA ?? "public" },
);
const prisma = new PrismaClient({ adapter });
const apply = process.argv.includes("--apply");

function normName(name: string) {
  return name.trim().toLocaleLowerCase("th");
}

async function main() {
  const brand = await prisma.brand.findUnique({
    where: { code: BRAND_CODE },
    select: { id: true, name: true, code: true },
  });
  if (!brand) {
    console.error(`ไม่พบแบรนด์ code=${BRAND_CODE}`);
    process.exit(1);
  }

  const branches = await prisma.branch.findMany({
    where: { brandId: brand.id, kind: "STORE" },
    select: { id: true, name: true, code: true, operatingMode: true },
    orderBy: { name: "asc" },
  });

  console.log(
    `Brand: ${brand.name} (${brand.code}) | STORE branches: ${branches.length}`,
  );
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}\n`);

  let wouldCreate = 0;
  let created = 0;
  let skipped = 0;

  for (const branch of branches) {
    const existing = await prisma.branchNonMenuItem.findMany({
      where: { branchId: branch.id, stockType: "CONSUMABLE" },
      select: { id: true, name: true, unit: true, quantity: true },
    });
    const byName = new Map(existing.map((r) => [normName(r.name), r]));

    const toCreate: Array<(typeof ITEMS)[number]> = [];
    const already: string[] = [];

    for (const item of ITEMS) {
      const found = byName.get(normName(item.name));
      if (found) {
        already.push(`${item.name} (unit=${found.unit}, qty=${found.quantity})`);
        skipped += 1;
      } else {
        toCreate.push(item);
        wouldCreate += 1;
      }
    }

    const label = `${branch.name} [${branch.operatingMode}]`;
    if (toCreate.length === 0) {
      console.log(`  = ${label}: already has both`);
      continue;
    }

    console.log(
      `  ${apply ? "+" : "~"} ${label}: create ${toCreate.map((i) => i.name).join(", ")}` +
        (already.length ? ` | skip ${already.join("; ")}` : ""),
    );

    if (!apply) continue;

    for (const item of toCreate) {
      await prisma.branchNonMenuItem.create({
        data: {
          branchId: branch.id,
          name: item.name,
          unit: item.unit,
          stockType: "CONSUMABLE",
          quantity: 0,
          showOnKeyOrder: false,
          keyOrderSortOrder: 0,
        },
      });
      created += 1;
    }
  }

  console.log("\n--- summary ---");
  if (apply) {
    console.log(`created=${created} skipped=${skipped}`);
  } else {
    console.log(
      `wouldCreate=${wouldCreate} alreadyExists=${skipped} (re-run with --apply to write)`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
