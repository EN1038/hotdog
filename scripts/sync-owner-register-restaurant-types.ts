/**
 * Sync owner-register restaurant types — keep 4 focus types, remove unused legacy rows.
 * Usage: npx tsx scripts/sync-owner-register-restaurant-types.ts
 *        npx tsx scripts/sync-owner-register-restaurant-types.ts --dry-run
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { DEFAULT_RESTAURANT_TYPES } from "../src/lib/restaurant-types";

const DRY_RUN = process.argv.includes("--dry-run");

const FOCUS_CODES = DEFAULT_RESTAURANT_TYPES.map((t) => t.code);

async function branchUsesCode(code: string) {
  const [primary, secondary] = await Promise.all([
    prisma.branch.count({ where: { primaryCategory: code } }),
    prisma.branch.count({ where: { secondaryCategories: { has: code } } }),
  ]);
  return primary + secondary;
}

async function main() {
  for (const t of DEFAULT_RESTAURANT_TYPES) {
    const plan = {
      name: t.name,
      sortOrder: t.sortOrder,
      isActive: true,
      showInOwnerRegister: true,
      ownerRegisterHint: t.ownerRegisterHint,
      ownerRegisterPlan: t.ownerRegisterPlan,
      ownerRegisterOperatingMode: t.ownerRegisterOperatingMode,
      offersMasterImport: t.offersMasterImport,
    };
    if (DRY_RUN) {
      console.log("upsert", t.code, plan);
      continue;
    }
    await prisma.restaurantType.upsert({
      where: { code: t.code },
      update: plan,
      create: { code: t.code, ...plan },
    });
  }

  const all = await prisma.restaurantType.findMany({
    select: { id: true, code: true, name: true, isActive: true },
  });

  for (const row of all) {
    if (FOCUS_CODES.includes(row.code)) continue;

    const used = await branchUsesCode(row.code);
    if (used > 0) {
      if (!DRY_RUN) {
        await prisma.restaurantType.update({
          where: { id: row.id },
          data: { showInOwnerRegister: false, isActive: row.isActive },
        });
      }
      console.log("keep (branch uses)", row.code, used);
      continue;
    }

    if (DRY_RUN) {
      console.log("delete", row.code, row.name);
      continue;
    }
    await prisma.restaurantType.delete({ where: { id: row.id } });
    console.log("deleted", row.code);
  }

  const after = await prisma.restaurantType.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      code: true,
      name: true,
      isActive: true,
      showInOwnerRegister: true,
      sortOrder: true,
    },
  });
  console.log(JSON.stringify({ dryRun: DRY_RUN, after }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
