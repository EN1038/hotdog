import "dotenv/config";
import { PrismaClient, OrderStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA ?? "public" },
);
const prisma = new PrismaClient({ adapter });

const doCancel = process.argv.includes("--cancel");
/** จำกัดสาขา (ชื่อสาขา หรือรหัส) — กันยกเลิกข้ามสาขา */
const branchFilter = (() => {
  const i = process.argv.indexOf("--branch");
  return i >= 0 ? process.argv[i + 1] : null;
})();

async function main() {
  const waiting = await prisma.order.findMany({
    where: {
      status: OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
      ...(branchFilter
        ? {
            branch: {
              OR: [
                { name: { contains: branchFilter } },
                { code: { equals: branchFilter, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      queueNumber: true,
      createdAt: true,
      queueBusinessDate: true,
      customer: { select: { name: true, phone: true } },
      branch: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    JSON.stringify(
      waiting.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        queue: o.queueNumber,
        branch: o.branch?.name,
        customer: o.customer?.name || o.customer?.phone,
        date: o.queueBusinessDate,
      })),
      null,
      2,
    ),
  );
  console.log("count=", waiting.length);
  if (branchFilter) console.log("branchFilter=", branchFilter);

  if (doCancel) {
    if (!branchFilter) {
      console.error("ต้องระบุ --branch ก่อนยกเลิก (กันยกเลิกข้ามสาขา)");
      process.exitCode = 1;
      return;
    }
    const result = await prisma.order.updateMany({
      where: {
        id: { in: waiting.map((o) => o.id) },
        status: OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
      },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: "ยกเลิกออเดอร์รอรับค้าง (เคลียร์โดยผู้ดูแล)",
        awaitingPhotoKey: false,
      },
    });
    console.log("cancelled=", result.count);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
