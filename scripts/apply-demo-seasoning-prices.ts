/**
 * Demo pricing: free seasonings, paid extra dipping cups.
 * Run: npx tsx scripts/apply-demo-seasoning-prices.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? "public" },
  );
  const prisma = new PrismaClient({ adapter });

  const branch = await prisma.branch.findFirst({
    where: {
      OR: [{ name: "สาขา ทดสอบ" }, { name: { contains: "ทดสอบ" } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!branch) throw new Error("ไม่พบสาขาทดสอบ");

  const free = await prisma.branchMenuItem.updateMany({
    where: {
      branchId: branch.id,
      category: { name: "เครื่องปรุง/เพิ่มเติม" },
    },
    data: { price: 0, pickupPrice: 0, storefrontPrice: 0 },
  });

  const sauce = await prisma.branchMenuItem.updateMany({
    where: {
      branchId: branch.id,
      category: { name: "น้ำจิ้ม" },
    },
    data: { price: 15, pickupPrice: 15, storefrontPrice: 15 },
  });

  console.log(
    JSON.stringify(
      {
        branch: branch.name,
        seasoningsFree: free.count,
        dippingCupsPaid15: sauce.count,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
