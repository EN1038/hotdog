import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const BRANCH_ID = "cmrt2p7zg005g0v87lowgbv1r";
const DAY_START = new Date("2026-08-31T00:00:00+07:00");
const DAY_END = new Date("2026-09-01T00:00:00+07:00");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: process.env.DATABASE_SCHEMA ?? "public" }),
});

function bangkokTime(d: Date) {
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function orderTotal(items: Array<{ quantity: number; unitPrice: unknown; optionsPrice: unknown }>) {
  return items.reduce(
    (s, i) => s + Number(i.unitPrice) * i.quantity + Number(i.optionsPrice) * i.quantity,
    0,
  );
}

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      branchId: BRANCH_ID,
      createdAt: { gte: DAY_START, lt: DAY_END },
      status: { notIn: ["CANCELLED"] },
    },
    include: {
      items: { include: { branchMenuItem: { select: { name: true } } } },
      createdByStaff: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let cash = 0;
  let transfer = 0;

  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]!;
    const total = orderTotal(o.items);
    if (o.paymentMethod === "CASH") cash += total;
    else if (o.paymentMethod === "TRANSFER") transfer += total;

    const pay = o.paymentMethod === "CASH" ? "เงินสด" : o.paymentMethod === "TRANSFER" ? "โอน" : o.paymentMethod;
    console.log(`${i + 1}. ${bangkokTime(o.createdAt)}  #${o.orderNumber}  ${pay}  ${total}฿`);
    for (const item of o.items) {
      const opts = item.optionsText ? `\n      → ${item.optionsText}` : "";
      console.log(`   • ${item.itemName} x${item.quantity}${opts}`);
    }
    console.log("");
  }

  console.log(`รวม ${orders.length} บิล | เงินสด ${cash} + โอน ${transfer} = ${cash + transfer} บาท`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
