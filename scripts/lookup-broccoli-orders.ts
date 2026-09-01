import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const orderNumbers = ["H5775", "U8965", "R1604"];
const broccoliId = "cmrt2re0800ao0v87w510zjz4";
const hamId = "cmrt2rdz000a30v874fnsbeit";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: process.env.DATABASE_SCHEMA ?? "public" }),
});

async function main() {
  for (const num of orderNumbers) {
    const order = await prisma.order.findFirst({
      where: { orderNumber: num },
      include: {
        items: {
          include: { branchMenuItem: { select: { id: true, name: true } } },
        },
        branch: { select: { name: true } },
      },
    });
    if (!order) {
      console.log(`#${num}: NOT FOUND`);
      continue;
    }
    console.log(
      `\n#${num} branch=${order.branch.name} status=${order.status} deducted=${order.stockDeducted} at=${order.createdAt.toISOString()}`,
    );
    for (const item of order.items) {
      const mark =
        item.branchMenuItemId === broccoliId
          ? " [BROCCOLI]"
          : item.branchMenuItemId === hamId
            ? " [HAM]"
            : "";
      console.log(`  - ${item.branchMenuItem?.name} qty=${item.quantity} gift=${item.giftQuantity ?? 0}${mark}`);
      console.log(`    optionsText: ${item.optionsText?.slice(0, 300) ?? "(none)"}`);
    }
  }

  const brocHist = await prisma.branchMenuItemStockHistory.findMany({
    where: {
      menuItemId: broccoliId,
      createdAt: { gte: new Date("2026-08-31T00:00:00+07:00") },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n=== All broccoli SALE notes today ===");
  for (const h of brocHist) console.log(h.note);

  const allBrocOrders = await prisma.orderItem.findMany({
    where: {
      branchMenuItemId: broccoliId,
      order: {
        createdAt: { gte: new Date("2026-08-31T00:00:00+07:00") },
        status: { not: "CANCELLED" },
      },
    },
    include: {
      order: { select: { orderNumber: true, branchId: true, branch: { select: { name: true } } } },
    },
  });
  console.log(`\nAll broccoli order items today (any branch): ${allBrocOrders.length}`);
  for (const o of allBrocOrders) {
    console.log(`  #${o.order.orderNumber} ${o.order.branch.name} qty=${o.quantity}`);
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
