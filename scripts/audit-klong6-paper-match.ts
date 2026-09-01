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

function countPlainBroc(text: string | null | undefined) {
  if (!text) return 0;
  let n = 0;
  for (const part of text.split(",").map((s) => s.trim())) {
    const base = (part.split("·")[0] ?? part).trim();
    if (base === "บล็อคโคลี่") n++;
  }
  return n;
}

function countGreenBean(text: string | null | undefined) {
  if (!text) return 0;
  let n = 0;
  for (const part of text.split(",").map((s) => s.trim())) {
    const base = (part.split("·")[0] ?? part).trim();
    if (base === "กระเจี๊ยบเขียว") n++;
  }
  return n;
}

const paper = [
  { line: 1, sticks: 10, note: "ปลาดอรี่ 1", pay: "TRANSFER", amount: 100 },
  { line: 2, sticks: 10, note: "ปลาดอรี่ 1", pay: "TRANSFER", amount: 100 },
  { line: 3, sticks: 7, note: "บล็อคโคลี่ 2", pay: "TRANSFER", amount: 70 },
  { line: 4, sticks: 10, note: "ปลาดอรี่ 1", pay: "TRANSFER", amount: 100 },
  { line: 5, sticks: 8, note: "-", pay: "CASH", amount: 80 },
  { line: 6, sticks: 4, note: "-", pay: "TRANSFER", amount: 40 },
  { line: 7, sticks: 5, note: "บล็อคโคลี่ 1 กระเจี๊ยบ 1", pay: "TRANSFER", amount: 50 },
  { line: 8, sticks: 5, note: "บล็อคโคลี่ 1", pay: "CASH", amount: 45 },
  { line: 9, sticks: 6, note: "บล็อคโคลี่ 2 กระเจี๊ยบ 2", pay: "TRANSFER", amount: 40 },
  { line: 10, sticks: 5, note: "-", pay: "TRANSFER", amount: 50 },
  { line: 11, sticks: 10, note: "ปลาหมึกหลอด 1", pay: "CASH", amount: 100 },
  { line: 12, sticks: 10, note: "ชิคเก้นแฟรงค์ 1", pay: "CASH", amount: 100 },
  { line: 13, sticks: 7, note: "-", pay: "TRANSFER", amount: 70 },
];

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      branchId: BRANCH_ID,
      createdAt: { gte: DAY_START, lt: DAY_END },
      status: { notIn: ["CANCELLED"] },
    },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });

  const enriched = orders.map((o) => {
    const total = o.items.reduce(
      (s, i) => s + Number(i.unitPrice) * i.quantity + Number(i.optionsPrice) * i.quantity,
      0,
    );
    let broc = 0;
    let gb = 0;
    let stickCount = 0;
    for (const i of o.items) {
      broc += countPlainBroc(i.optionsText) * i.quantity;
      gb += countGreenBean(i.optionsText) * i.quantity;
      if (i.optionsText) stickCount += i.optionsText.split(",").length * i.quantity;
      else stickCount += i.quantity;
    }
    return { ...o, total, broc, gb, stickCount };
  });

  console.log("=== จับคู่สมุด vs ระบบ (ตามยอดเงิน+ช่องทาง) ===\n");
  const used = new Set<string>();

  for (const p of paper) {
    const candidates = enriched.filter(
      (o) =>
        !used.has(o.id) &&
        o.paymentMethod === p.pay &&
        Math.abs(o.total - p.amount) < 0.01,
    );
    if (candidates.length === 1) {
      used.add(candidates[0]!.id);
      const o = candidates[0]!;
      console.log(
        `สมุดบรรทัด ${p.line} (${p.amount}${p.pay === "CASH" ? "สด" : "โอน"}) "${p.note}" → #${o.orderNumber} ระบบบล็อค=${o.broc} กระเจี๊ยบ=${o.gb} ${o.items[0]?.itemName}`,
      );
      if (p.note.includes("บล็อค") && o.broc === 0)
        console.log(`  ⚠ สมุดบันทึกบล็อคโคลี่ แต่ระบบไม่มีบล็อคโคลี่ในออเดอร์`);
      if (o.broc > 0 && !p.note.includes("บล็อค"))
        console.log(`  ⚠ ระบบมีบล็อคโคลี่ ${o.broc} แต่สมุดไม่ได้เขียน`);
    } else {
      console.log(
        `สมุดบรรทัด ${p.line} (${p.amount}) "${p.note}" → ไม่ตรง 1:1 (${candidates.length} candidates: ${candidates.map((c) => "#" + c.orderNumber).join(", ") || "none"})`,
      );
    }
  }

  console.log("\n=== ออเดörที่ยังไม่จับคู่ ===");
  for (const o of enriched.filter((o) => !used.has(o.id))) {
    console.log(
      `#${o.orderNumber} ${o.paymentMethod} ${o.total} บล็อค=${o.broc} ${o.items.map((i) => i.itemName).join("+")}`,
    );
  }

  console.log("\n=== สรุปบล็อคโคลี่ ===");
  const paperBroc = paper.reduce((s, p) => {
    const m = p.note.match(/บล็อคโคลี่\s*(\d+)/);
    return s + (m ? Number(m[1]) : 0);
  }, 0);
  const sysBroc = enriched.reduce((s, o) => s + o.broc, 0);
  console.log(`สมุดมือ (จาก note): ${paperBroc} ไม้`);
  console.log(`ระบบ (จากออเดör): ${sysBroc} ไม้`);
  console.log(`สมุดมือกระเจี๊ยบ: 1+2=3 | ระบบ: ${enriched.reduce((s, o) => s + o.gb, 0)}`);

  console.log("\n=== ทดสอบ: บรรทัด 3 สมุด (70โอน บล็อค2) คือบิลไหน? ===");
  const seventy = enriched.filter((o) => o.paymentMethod === "TRANSFER" && o.total === 70);
  for (const o of seventy) {
    console.log(`#${o.orderNumber}: ${o.items.map((i) => `${i.itemName} ${i.optionsText?.slice(0, 60) ?? ""}`).join(" | ")}`);
  }

  console.log("\n=== ทดสอบ: บรรทัด 8 (45สด บล็อค1) — ใกล้ U8965 5สด? ===");
  const cashSmall = enriched.filter((o) => o.paymentMethod === "CASH" && o.total <= 50);
  for (const o of cashSmall) {
    console.log(`#${o.orderNumber} ${o.total} บล็อค=${o.broc} ${o.items[0]?.optionsText ?? o.items[0]?.itemName}`);
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
