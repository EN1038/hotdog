/**
 * Reset SKEWER menu units and set min qty:
 * - Non-supply (SKEWER_SALE): quantityUnit=null, sticksPerUnit=1, countsAsSticks=true, skewerMinQty=12
 * - Supply (SKEWER_SUPPLY): keep unit fields, skewerMinQty=1
 *
 *   npx tsx scripts/backfill-skewer-reset-to-sticks.ts
 *   npx tsx scripts/backfill-skewer-reset-to-sticks.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });
config({ path: ".env" });

import { BranchOperatingMode } from "@prisma/client";
import { prisma } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

async function main() {
  const candidates = await prisma.branchMenuItem.findMany({
    where: {
      branch: { operatingMode: BranchOperatingMode.SKEWER },
    },
    select: {
      id: true,
      name: true,
      quantityUnit: true,
      sticksPerUnit: true,
      countsAsSticks: true,
      skewerMinQty: true,
      branch: { select: { name: true } },
      category: { select: { name: true, skewerCategoryRole: true } },
    },
    orderBy: [{ branchId: "asc" }, { name: "asc" }],
  });

  const regular = candidates.filter(
    (row) => row.category?.skewerCategoryRole !== "SKEWER_SUPPLY",
  );
  const other = candidates.filter(
    (row) => row.category?.skewerCategoryRole === "SKEWER_SUPPLY",
  );

  const regularToUpdate = regular.filter(
    (row) =>
      row.quantityUnit != null ||
      row.sticksPerUnit !== 1 ||
      row.countsAsSticks !== true ||
      row.skewerMinQty !== 12,
  );

  console.log(
    `SKEWER menu items: ${candidates.length} · รายการขาย: ${regular.length} · ของเพิ่ม/สิ้นเปลือง: ${other.length}`,
  );
  console.log(`Regular items to update → ไม้ + min 12: ${regularToUpdate.length}`);
  for (const row of regularToUpdate.slice(0, 30)) {
    console.log(
      `- [${row.branch.name}] ${row.category?.name} · ${row.name} · unit=${row.quantityUnit ?? "null"} min=${row.skewerMinQty}`,
    );
  }
  if (regularToUpdate.length > 30) {
    console.log(`  …and ${regularToUpdate.length - 30} more`);
  }

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to write.");
    return;
  }

  const result = await prisma.branchMenuItem.updateMany({
    where: { id: { in: regularToUpdate.map((r) => r.id) } },
    data: {
      quantityUnit: null,
      sticksPerUnit: 1,
      countsAsSticks: true,
      skewerMinQty: 12,
    },
  });
  console.log(`Updated ${result.count} regular menu items → ไม้, min 12.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
