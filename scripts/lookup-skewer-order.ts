import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const orderNumber = process.argv[2]?.trim();
if (!orderNumber) {
  console.error("Usage: npx tsx scripts/lookup-skewer-order.ts <orderNumber>");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool, {
  schema: process.env.DATABASE_SCHEMA ?? "public",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const order = await prisma.skewerOrder.findFirst({
    where: { orderNumber },
    include: {
      branch: { select: { name: true } },
      items: {
        orderBy: { itemName: "asc" },
        include: {
          branchMenuItem: {
            select: {
              quantityUnit: true,
              sticksPerUnit: true,
              countsAsSticks: true,
              category: { select: { skewerCategoryRole: true } },
            },
          },
        },
      },
    },
  });

  if (!order) {
    console.log(JSON.stringify({ found: false, orderNumber }, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        found: true,
        orderNumber: order.orderNumber,
        status: order.status,
        branch: order.branch.name,
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        requestedDate: order.requestedDate.toISOString().slice(0, 10),
        confirmedAt: order.confirmedAt?.toISOString() ?? null,
        adminNote: order.adminNote,
        items: order.items.map((i) => ({
          name: i.itemName,
          requested: i.requestedQuantity,
          confirmed: i.confirmedQuantity,
          unit: i.branchMenuItem?.quantityUnit ?? "ไม้",
          role: i.branchMenuItem?.category?.skewerCategoryRole ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
