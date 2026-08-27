/**
 * Backfill skewer pack unit on non-"อื่นๆ" categories:
 * quantityUnit = ชุด, sticksPerUnit = 12, countsAsSticks = true
 * Only BranchOperatingMode.SKEWER branches.
 *
 *   npx tsx scripts/backfill-skewer-pack-units.ts
 *   npx tsx scripts/backfill-skewer-pack-units.ts --apply
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
      category: {
        is: {
          NOT: { name: { equals: "อื่นๆ" } },
        },
      },
    },
    select: {
      id: true,
      name: true,
      quantityUnit: true,
      sticksPerUnit: true,
      countsAsSticks: true,
      branch: { select: { id: true, name: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ branchId: "asc" }, { name: "asc" }],
  });

  const toUpdate = candidates.filter(
    (row) =>
      row.quantityUnit?.trim() !== "ชุด" ||
      row.sticksPerUnit !== 12 ||
      row.countsAsSticks !== true,
  );

  console.log(
    `SKEWER items not in อื่นๆ: ${candidates.length} · need update: ${toUpdate.length}`,
  );
  for (const row of toUpdate.slice(0, 40)) {
    console.log(
      `- [${row.branch.name}] ${row.category?.name} · ${row.name} · unit=${row.quantityUnit ?? "null"} sticks=${row.sticksPerUnit} counts=${row.countsAsSticks}`,
    );
  }
  if (toUpdate.length > 40) {
    console.log(`  …and ${toUpdate.length - 40} more`);
  }

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to write.");
    return;
  }

  const result = await prisma.branchMenuItem.updateMany({
    where: {
      id: { in: toUpdate.map((r) => r.id) },
    },
    data: {
      quantityUnit: "ชุด",
      sticksPerUnit: 12,
      countsAsSticks: true,
    },
  });
  console.log(`Updated ${result.count} menu items.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
