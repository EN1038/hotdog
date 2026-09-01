import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const BRANCH_ID = "cmrt2p7zg005g0v87lowgbv1r";
const PLAIN_BROC = "cmrt2re0800ao0v87w510zjz4";
const DAY_START = new Date("2026-08-31T00:00:00+07:00");
const DAY_END = new Date("2026-09-01T00:00:00+07:00");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: process.env.DATABASE_SCHEMA ?? "public" }),
});

async function main() {
  const baconWrap = await prisma.branchMenuItem.findFirst({
    where: { branchId: BRANCH_ID, name: "บรอกโคลีพันเบคอน" },
    select: { id: true, name: true, stock: true },
  });

  console.log("=== บรอกโคลีพันเบคอน stock history 31/08 ===");
  if (baconWrap) {
    const hist = await prisma.branchMenuItemStockHistory.findMany({
      where: {
        menuItemId: baconWrap.id,
        createdAt: { gte: new Date("2026-08-29T00:00:00+07:00") },
      },
      orderBy: { createdAt: "asc" },
    });
    for (const h of hist) {
      console.log(
        `${h.createdAt.toISOString().slice(0, 16)} ${h.type} ${h.quantity} ${h.note ?? ""}${h.cancelledAt ? " CANCEL" : ""}`,
      );
    }
  }

  console.log("\n=== บล็อคโคลี่ ADJUST/WASTE/ISSUE 31/08 ===");
  const other = await prisma.branchMenuItemStockHistory.findMany({
    where: {
      menuItemId: PLAIN_BROC,
      createdAt: { gte: DAY_START, lt: DAY_END },
      type: { not: "SALE" },
    },
    orderBy: { createdAt: "asc" },
  });
  if (other.length === 0) console.log("  (ไม่มี)");
  for (const h of other) console.log(`  ${h.type} ${h.quantity} ${h.note}`);

  console.log("\n=== ออเดอร์ที่ไม่ใช่โปร แต่มีแค่ 1-2 ไม้ (อาจจ่ายตรง) ===");
  const orders = await prisma.order.findMany({
    where: {
      branchId: BRANCH_ID,
      createdAt: { gte: DAY_START, lt: DAY_END },
      status: { notIn: ["CANCELLED"] },
    },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });

  for (const o of orders) {
    const totalSticks = o.items.reduce((s, i) => {
      const opts = i.optionsText?.split(",").length ?? (i.branchMenuItemId ? 1 : 0);
      return s + Math.max(i.quantity, opts > 0 ? opts : i.quantity);
    }, 0);
    console.log(
      `#${o.orderNumber} ${o.paymentMethod} ${o.items.map((i) => i.itemName).join(" + ")} | items=${o.items.length}`,
    );
    for (const i of o.items) {
      console.log(`   ${i.itemName} x${i.quantity} @${i.unitPrice} opts=${i.optionsText ?? "-"}`);
    }
  }

  console.log("\n=== เทียบ: พนักงานบอกขาย 6 บล็อคโคลี่ ===");
  console.log("ในระบบ (บล็อคโคลี่ ล้วน): 4 ไม้ จาก 3 โปรเคลียร์สต๊อก");
  console.log("ในระบบ (บรอกโคลีพันเบคอน): 8 ไม้ จากโปร+ขายตรง (คนละ SKU)");
  console.log("ถ้านับรวม 'broccoli ทุกแบบ' ในใจ: 4+8=12 (ไม่ใช่ 6)");
  console.log("ถ้านับเฉพาะ plain ที่ staff นับในชีท #26: ขาย 4 ควรเหลือ 6 แต่นับได้ 4");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
