import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const branchId = "cmrt2p7zg005g0v87lowgbv1r";
const broccoliId = "cmrt2re0800ao0v87w510zjz4";
const dayStart = new Date("2026-08-31T00:00:00+07:00");
const dayEnd = new Date("2026-09-01T00:00:00+07:00");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: process.env.DATABASE_SCHEMA ?? "public" }),
});

async function main() {
  const ordersWithBrocInText = await prisma.orderItem.findMany({
    where: {
      order: { branchId, createdAt: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" } },
      OR: [
        { optionsText: { contains: "บล็อคโคลี่" } },
        { optionsText: { contains: "บล็อกโคลี่" } },
        { itemName: { contains: "บล็" } },
      ],
    },
    include: { order: { select: { orderNumber: true, createdAt: true, stockDeducted: true } } },
    orderBy: { order: { createdAt: "asc" } },
  });

  console.log(`Orders mentioning broccoli in text: ${ordersWithBrocInText.length}`);
  let pickTotal = 0;
  for (const o of ordersWithBrocInText) {
    const text = o.optionsText ?? o.itemName ?? "";
    const picks = (text.match(/บล็[อo]?คโ?[co]?ลี่/g) ?? []).length;
    pickTotal += picks * o.quantity;
    console.log(`  #${o.order.orderNumber} ${o.itemName} qty=${o.quantity} picks~${picks} deducted=${o.order.stockDeducted}`);
    console.log(`    ${text.slice(0, 120)}`);
  }
  console.log(`Approx broccoli picks in order text: ${pickTotal}`);

  const tableLines = await prisma.tableSessionLine.findMany({
    where: {
      branchMenuItemId: broccoliId,
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    include: { session: { select: { tableLabel: true, status: true } } },
  });
  console.log(`\nTable session broccoli lines: ${tableLines.length}`);

  const notDeducted = await prisma.order.count({
    where: {
      branchId,
      createdAt: { gte: dayStart, lt: dayEnd },
      status: "COMPLETED",
      stockDeducted: false,
    },
  });
  console.log(`Completed orders without stock deduction today: ${notDeducted}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
