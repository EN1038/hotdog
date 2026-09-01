import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const broccoliId = "cmrt2re0800ao0v87w510zjz4";
const hamId = "cmrt2rds8006y0v87???"; // will lookup
const branchId = "cmrt2p7zg005g0v87lowgbv1r";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: process.env.DATABASE_SCHEMA ?? "public" }),
});

async function main() {
  const ham = await prisma.branchMenuItem.findFirst({
    where: { branchId, name: "แฮมแผ่น" },
    select: { id: true, name: true, stock: true },
  });
  const broccoli = await prisma.branchMenuItem.findFirst({
    where: { branchId, name: "บล็อคโคลี่" },
    select: { id: true, name: true, stock: true },
  });

  const dayStart = new Date("2026-08-31T00:00:00+07:00");
  const dayEnd = new Date("2026-09-01T00:00:00+07:00");

  for (const item of [broccoli, ham].filter(Boolean)) {
    console.log(`\n========== ${item!.name} ==========`);
    console.log(`Current stock: ${item!.stock?.quantity ?? 0}`);

    const histories = await prisma.branchMenuItemStockHistory.findMany({
      where: {
        menuItemId: item!.id,
        createdAt: { gte: dayStart, lt: dayEnd },
        cancelledAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
    console.log(`\nStock history Aug 31 (${histories.length} rows):`);
    let saleTotal = 0;
    for (const h of histories) {
      if (h.type === "SALE") saleTotal += Math.abs(h.quantity);
      console.log(`  ${h.createdAt.toISOString()} ${h.type} ${h.quantity} ${h.note}`);
    }
    console.log(`Sale total from history: ${saleTotal}`);

    const orderItems = await prisma.orderItem.findMany({
      where: {
        branchMenuItemId: item!.id,
        order: {
          branchId,
          createdAt: { gte: dayStart, lt: dayEnd },
          status: { notIn: ["CANCELLED"] },
        },
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            createdAt: true,
            stockDeducted: true,
            paymentMethod: true,
          },
        },
      },
      orderBy: { order: { createdAt: "asc" } },
    });

    console.log(`\nOrder lines Aug 31 (${orderItems.length}):`);
    let orderQty = 0;
    for (const o of orderItems) {
      orderQty += o.quantity + (o.giftQuantity ?? 0);
      console.log(
        `  ${o.order.createdAt.toISOString()} #${o.order.orderNumber} qty=${o.quantity} gift=${o.giftQuantity ?? 0} deducted=${o.order.stockDeducted} status=${o.order.status}`,
      );
    }
    console.log(`Order qty total (incl gift): ${orderQty}`);

    if (orderQty !== saleTotal) {
      console.log(`⚠ MISMATCH: orders=${orderQty} vs stock history sales=${saleTotal}`);
    }
  }

  const yesterdayClose = await prisma.stockCount.findFirst({
    where: {
      branchId,
      AND: [
        { name: { contains: "30/08/2569" } },
        { name: { contains: "หลังปิด" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { note: true, createdAt: true },
  });

  if (yesterdayClose?.note) {
    const note = JSON.parse(yesterdayClose.note);
    const broc = (note.lines ?? []).find((l: { name?: string }) => l.name?.includes("บล็อคโคลี่") && !l.name?.includes("พัน"));
    const hamLine = (note.lines ?? []).find((l: { name?: string }) => l.name === "แฮมแผ่น");
    console.log("\n========== Yesterday close (Aug 30) ==========");
    console.log("Broccoli:", broc);
    console.log("Ham:", hamLine);
  }

  console.log("\n========== Reconciliation ==========");
  const startBroccoli = 10;
  const recordedSales = 4;
  const physicalCount = 4;
  const systemQty = 6;
  console.log(`Broccoli: start ${startBroccoli} - recorded sales ${recordedSales} = system ${systemQty}`);
  console.log(`Physical count: ${physicalCount}`);
  console.log(`Implied actual sales: ${startBroccoli - physicalCount} = ${startBroccoli - physicalCount}`);
  console.log(`Unrecorded sales (implied - recorded): ${(startBroccoli - physicalCount) - recordedSales}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
