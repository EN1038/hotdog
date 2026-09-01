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

function countInText(text: string | null | undefined, names: string[]) {
  if (!text) return 0;
  let n = 0;
  for (const part of text.split(",").map((s) => s.trim())) {
    const base = (part.split("·")[0] ?? part).trim();
    if (names.some((name) => base === name || base.includes(name))) n++;
  }
  return n;
}

async function main() {
  const brocItems = await prisma.branchMenuItem.findMany({
    where: {
      branchId: BRANCH_ID,
      OR: [{ name: { contains: "บล็" } }, { name: { contains: "บรอก" } }, { name: { contains: "broccoli" } }],
    },
    select: { id: true, name: true, stock: { select: { quantity: true } } },
  });

  console.log("=== เมนูที่เกี่ยวกับ broccoli ทั้งหมด ===");
  for (const m of brocItems) {
    const hist = await prisma.branchMenuItemStockHistory.findMany({
      where: {
        menuItemId: m.id,
        type: "SALE",
        createdAt: { gte: DAY_START, lt: DAY_END },
        cancelledAt: null,
      },
    });
    const sold = hist.reduce((s, h) => s + Math.abs(h.quantity), 0);
    console.log(`  ${m.name}: สต็อก=${m.stock?.quantity ?? 0}, ขายวันนี้=${sold}`);
  }

  const orders = await prisma.order.findMany({
    where: {
      branchId: BRANCH_ID,
      createdAt: { gte: DAY_START, lt: DAY_END },
      status: { notIn: ["CANCELLED"] },
    },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });

  console.log("\n=== ทุกออเดอร์ที่มีคำว่า บล็/บรอก ใน optionsText ===");
  let totalPlain = 0;
  let totalBacon = 0;
  for (const o of orders) {
    for (const item of o.items) {
      const plain = countInText(item.optionsText, ["บล็อคโคลี่"]);
      const bacon = countInText(item.optionsText, ["บรอกโคลี", "บล็อคโคลี่พัน"]);
      if (plain || bacon || item.itemName.includes("บล็") || item.itemName.includes("บรอก")) {
        totalPlain += plain * item.quantity;
        totalBacon += bacon * item.quantity;
        console.log(`  #${o.orderNumber} "${item.itemName}" x${item.quantity}`);
        console.log(`    ${item.optionsText ?? "(direct)"}`);
        console.log(`    → บล็อคโคลี่ ${plain}, พันเบคอน ${bacon}`);
      }
    }
  }
  console.log(`\nรวมจากข้อความ: บล็อคโคลี่ ${totalPlain}, พันเบคอน ${totalBacon}, รวม ${totalPlain + totalBacon}`);

  const greenBeanId = await prisma.branchMenuItem.findFirst({
    where: { branchId: BRANCH_ID, name: "กระเจี๊ยบเขียว" },
    select: { id: true, stock: true },
  });
  if (greenBeanId) {
    const gbHist = await prisma.branchMenuItemStockHistory.findMany({
      where: {
        menuItemId: greenBeanId.id,
        type: "SALE",
        createdAt: { gte: DAY_START, lt: DAY_END },
        cancelledAt: null,
      },
    });
    console.log(`\nกระเจี๊ยบเขียว: ขายวันนี้ ${gbHist.reduce((s, h) => s + Math.abs(h.quantity), 0)}, สต็อก ${greenBeanId.stock?.quantity}`);
  }

  const yesterday = await prisma.stockCount.findFirst({
    where: {
      branchId: BRANCH_ID,
      AND: [{ name: { contains: "30/08/2569" } }, { name: { contains: "หลังปิด" } }],
    },
    orderBy: { createdAt: "desc" },
  });
  const yNote = yesterday?.note ? JSON.parse(yesterday.note) : {};
  const baconWrap = brocItems.find((m) => m.name.includes("พันเบค"));
  const plainBroc = brocItems.find((m) => m.name === "บล็อคโคลี่");

  console.log("\n=== เมื่อวานปิดรอบ (30/08) ===");
  for (const line of yNote.lines ?? []) {
    if (line.name?.includes("บล็") || line.name?.includes("บรอก") || line.name?.includes("กระเจี")) {
      console.log(`  ${line.name}: นับได้ ${line.countedQty}`);
    }
  }

  console.log("\n=== สมมติฐาน: นับรวมพันเบคอนเป็น broccoli ===");
  if (plainBroc && baconWrap) {
    const plainSold = (
      await prisma.branchMenuItemStockHistory.findMany({
        where: { menuItemId: plainBroc.id, type: "SALE", createdAt: { gte: DAY_START, lt: DAY_END }, cancelledAt: null },
      })
    ).reduce((s, h) => s + Math.abs(h.quantity), 0);
    const baconSold = (
      await prisma.branchMenuItemStockHistory.findMany({
        where: { menuItemId: baconWrap.id, type: "SALE", createdAt: { gte: DAY_START, lt: DAY_END }, cancelledAt: null },
      })
    ).reduce((s, h) => s + Math.abs(h.quantity), 0);
    const yPlain = (yNote.lines ?? []).find((l: { name?: string }) => l.name === "บล็อคโคลี่");
    const yBacon = (yNote.lines ?? []).find((l: { name?: string }) => l.name?.includes("พันเบค"));
    console.log(`  บล็อคโคลี่: เมื่อวาน ${yPlain?.countedQty ?? "?"} - ขาย ${plainSold} = ควรเหลือ ${(yPlain?.countedQty ?? 0) - plainSold}`);
    console.log(`  พันเบคอน: เมื่อวาน ${yBacon?.countedQty ?? "?"} - ขาย ${baconSold} = ควรเหลือ ${(yBacon?.countedQty ?? 0) - baconSold}`);
    console.log(`  ถ้ารวมนับเป็น broccoli ทั้งหมด: ขายรวม ${plainSold + baconSold} ไม้`);
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
