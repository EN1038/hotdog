import { PrismaClient, StaffRole } from "@prisma/client";

const prisma = new PrismaClient();

async function tableHasColumn(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<
    Array<{ exists: boolean }>
  >`SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) as exists;`;
  return Boolean(rows[0]?.exists);
}

async function main() {
  // This script is intentionally defensive:
  // - It only runs if it detects a legacy schema (Branch.sellerPhone/deliveryPhone + global MenuItem)
  // - Otherwise it exits without changing data
  const hasSeller = await tableHasColumn("Branch", "sellerPhone");
  const hasDelivery = await tableHasColumn("Branch", "deliveryPhone");
  const hasMenuItem = await tableHasColumn("MenuItem", "name");
  const hasLegacyBranchMenu = await tableHasColumn("BranchMenuItem", "menuItemId");

  if (!hasSeller && !hasDelivery && !hasMenuItem && !hasLegacyBranchMenu) {
    console.log(
      "No legacy schema detected. Nothing to backfill. (This is expected after migrate reset.)",
    );
    return;
  }

  throw new Error(
    "Legacy backfill requires running BEFORE the legacy tables are dropped/renamed. Create a fresh plan for legacy migration (name conflicts exist for BranchMenuItem).",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

