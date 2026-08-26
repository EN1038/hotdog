import "dotenv/config";
import { OrderStatus, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { restoreStockForOrder } from "../src/lib/stock";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA ?? "public" },
);
const prisma = new PrismaClient({ adapter });

const orderId = process.argv[2];
const reason =
  process.argv[3] ?? "คีย์ซ้ำ (ยกเลิกโดยผู้ดูแลระบบ)";
const doCancel = process.argv.includes("--cancel");

async function main() {
  if (!orderId) {
    console.error("usage: npx tsx scripts/cancel-order.ts <orderId> [reason] [--cancel]");
    process.exitCode = 1;
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      branch: { select: { name: true, code: true } },
      items: { select: { itemName: true, quantity: true, optionsText: true } },
    },
  });
  if (!order) {
    console.error("ไม่พบออเดอร์", orderId);
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        id: order.id,
        orderNumber: order.orderNumber,
        queueNumber: order.queueNumber,
        status: order.status,
        branch: order.branch.name,
        customerName: order.customerName,
        stockDeducted: order.stockDeducted,
        items: order.items,
      },
      null,
      2,
    ),
  );

  if (!doCancel) {
    console.log("\n(dry-run) ใส่ --cancel เพื่อยกเลิกจริง");
    return;
  }

  if (order.status === OrderStatus.CANCELLED) {
    console.log("ออเดอร์ถูกยกเลิกแล้ว");
    return;
  }

  const moved = await prisma.order.updateMany({
    where: { id: orderId, status: order.status },
    data: {
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason,
      awaitingPhotoKey: false,
    },
  });
  if (moved.count === 0) {
    console.error("ไม่สามารถยกเลิกได้ — สถานะเปลี่ยนไปแล้ว");
    process.exitCode = 1;
    return;
  }

  const stockRestored = await restoreStockForOrder(orderId);
  console.log("cancelled=1 stockRestored=", stockRestored);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
