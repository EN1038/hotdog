const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const schema = (process.env.DATABASE_SCHEMA || "order_app").replace(/"/g, "");
const p = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema },
  ),
});
(async () => {
  await p.$queryRawUnsafe("SELECT 1");
  console.log("DB OK");
  for (const t of [
    "BranchMenuItemStockHistory",
    "BranchNonMenuItemHistory",
    "BranchShift",
  ]) {
    await p.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."${t}" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`,
    );
    await p.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."${t}" ADD COLUMN IF NOT EXISTS "cancelNote" TEXT`,
    );
    console.log("migrated", t);
  }
  await p.$disconnect();
  console.log("DONE");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
