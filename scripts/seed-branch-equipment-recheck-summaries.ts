import "dotenv/config";
import { prisma } from "../src/lib/db";
import { STOCK_COUNT_TIMING_LABEL } from "../src/lib/stock-count-timing";

type EquipmentLine = {
  name: string;
  unit: string;
  qty: number;
};

const BRANCHES: Record<
  string,
  { branchId: string; brandId: string; label: string; items: EquipmentLine[] }
> = {
  muban: {
    branchId: "cmrt2p7zg005g0v87lowgbv1r",
    brandId: "cmrmxregq00020u8s64xg7kii",
    label: "คลอง 6 หน้าหมู่บ้าน",
    items: [
      { name: "ตะกร้า", unit: "ใบ", qty: 12 },
      { name: "ใบตองปลอม", unit: "ใบ", qty: 6 },
      { name: "กรรไกร", unit: "อัน", qty: 2 },
      { name: "ถาดสแตนเลสใหญ่", unit: "ถาด", qty: 3 },
      { name: "เขียง", unit: "อัน", qty: 1 },
      { name: "มีด", unit: "เล่ม", qty: 1 },
      { name: "แปรงทาเนย", unit: "ด้าม", qty: 4 },
      { name: "กระบวย", unit: "ด้าม", qty: 1 },
      { name: "แก๊ส", unit: "ถัง", qty: 1 },
      { name: "ถาดสแตนเลสเล็ก", unit: "ถาด", qty: 4 },
      { name: "น้ำยาล้างจาน", unit: "แกลลอน", qty: 1 },
      { name: "ผ้า", unit: "ผืน", qty: 4 },
      { name: "กระปุกโรยผงหมาล่า", unit: "อัน", qty: 3 },
      { name: "ผ้ากันเปื้อน", unit: "ผืน", qty: 2 },
      { name: "หมวกคลุมผม", unit: "ใบ", qty: 4 },
      { name: "ถุงขยะ", unit: "ม้วนใหญ่", qty: 1 },
      { name: "ทิชชู่", unit: "ห่อ", qty: 3 },
      { name: "พัดลม", unit: "ตัว", qty: 2 },
      { name: "ปลั๊กไฟ", unit: "อัน", qty: 3 },
      { name: "เตาย่าง", unit: "เตา", qty: 1 },
      { name: "กล่องใส่ของ", unit: "กล่อง", qty: 12 },
      { name: "โหลเนย", unit: "โหล", qty: 1 },
      { name: "ถังน้ำแข็ง", unit: "ถัง", qty: 2 },
      { name: "เซ็ตไม้ถูพื้น+ถังน้ำ", unit: "ชุด", qty: 1 },
      { name: "เซ็ตไม้กวาด+ที่โกย", unit: "ชุด", qty: 1 },
      { name: "ตู้ใส่ของหน้าร้าน", unit: "ตู้", qty: 1 },
    ],
  },
  cj: {
    branchId: "cmsr1l7810000pgzeb47enjq9",
    brandId: "cmrmxregq00020u8s64xg7kii",
    label: "CJ นวนคร",
    items: [
      { name: "กล่องใหญ่", unit: "ใบ", qty: 2 },
      { name: "ตะกร้า", unit: "ใบ", qty: 10 },
      { name: "กะละมัง", unit: "ใบ", qty: 3 },
      { name: "ถาด", unit: "ใบ", qty: 2 },
      { name: "ตะแกรง", unit: "อัน", qty: 1 },
      { name: "ที่คีบ", unit: "อัน", qty: 2 },
      { name: "ที่ตีแป้ง", unit: "อัน", qty: 2 },
      { name: "กระชอน", unit: "อัน", qty: 2 },
      { name: "กระชอนกรองรู", unit: "อัน", qty: 1 },
      { name: "ถังใส่น้ำจิ้ม", unit: "ใบ", qty: 1 },
      { name: "กระบวย", unit: "อัน", qty: 1 },
      { name: "แปรงทาน้ำจิ้ม", unit: "อัน", qty: 2 },
      { name: "เก้าอี้", unit: "ตัว", qty: 6 },
      { name: "ถังแก๊ซ", unit: "ถัง", qty: 1 },
      { name: "ปลั๊กไฟ", unit: "อัน", qty: 8 },
      { name: "มีด", unit: "เล่ม", qty: 3 },
      { name: "เขียง", unit: "อัน", qty: 1 },
      { name: "พัดลม", unit: "ตัว", qty: 1 },
      { name: "เซ็ตไม้กวาด+ที่ตักขยะ", unit: "ชุด", qty: 1 },
      { name: "ผ้า", unit: "ผืน", qty: 4 },
      { name: "ถุงขยะ", unit: "แพ็ค", qty: 1 },
      { name: "ตู้แช่", unit: "ตู้", qty: 2 },
      { name: "เตาย่าง", unit: "เตา", qty: 2 },
      { name: "ผ้ากันเปื้อน", unit: "ผืน", qty: 3 },
      { name: "โหลเนย", unit: "โหล", qty: 1 },
      { name: "น้ำยาล้างจาน", unit: "ถัง", qty: 1 },
      { name: "น้ำยาล้างเตา", unit: "ขวด", qty: 1 },
      { name: "ทิชชู", unit: "แพ็ค", qty: 1 },
      { name: "กรรไกร", unit: "อัน", qty: 1 },
      { name: "เตาหม้อทอด", unit: "ตัว", qty: 1 },
    ],
  },
  saphan: {
    branchId: "cmrt2lhb100000v87sdfrjfsk",
    brandId: "cmrmxregq00020u8s64xg7kii",
    label: "คลอง 6 สะพานชมพู",
    items: [
      { name: "ตะกร้า", unit: "ใบ", qty: 10 },
      { name: "ใบตองปลอม", unit: "ใบ", qty: 7 },
      { name: "กรรไกร", unit: "อัน", qty: 2 },
      { name: "ถาดสแตนเลสใหญ่", unit: "ถาด", qty: 2 },
      { name: "เขียง", unit: "อัน", qty: 1 },
      { name: "มีด", unit: "เล่ม", qty: 4 },
      { name: "แปรงทาเนย", unit: "ด้าม", qty: 3 },
      { name: "กระบวย", unit: "ด้าม", qty: 2 },
      { name: "แก๊ส", unit: "ถัง", qty: 1 },
      { name: "ถาดสแตนเลสเล็ก", unit: "ถาด", qty: 5 },
      { name: "น้ำยาล้างจาน", unit: "แกลลอน", qty: 1 },
      { name: "ผ้า", unit: "ผืน", qty: 5 },
      { name: "กระปุกโรยผงหมาล่า", unit: "อัน", qty: 1 },
      { name: "ผ้ากันเปื้อน", unit: "ผืน", qty: 3 },
      { name: "หมวกคลุมผม", unit: "ใบ", qty: 2 },
      { name: "ถุงขยะ", unit: "ม้วนใหญ่", qty: 3 },
      { name: "ทิชชู่", unit: "ห่อ", qty: 1 },
      { name: "พัดลม", unit: "ตัว", qty: 1 },
      { name: "ปลั๊กไฟ", unit: "อัน", qty: 1 },
      { name: "เตาย่าง", unit: "เตา", qty: 1 },
      { name: "กล่องใส่ของ", unit: "กล่อง", qty: 8 },
      { name: "โหลเนย", unit: "โหล", qty: 1 },
      { name: "ถังน้ำแข็ง", unit: "ถัง", qty: 1 },
      { name: "เซ็ตไม้ถูพื้น+ถังน้ำ", unit: "ชุด", qty: 1 },
      { name: "เซ็ตไม้กวาด+ที่โกย", unit: "ชุด", qty: 1 },
      { name: "ตู้ใส่ของหน้าร้าน", unit: "ตู้", qty: 1 },
      { name: "จาน", unit: "ใบ", qty: 6 },
    ],
  },
};

function bangkokDateLabel() {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

async function seedBranch(
  key: string,
  dryRun: boolean,
): Promise<{ key: string; createdItems: number; summaryId: string | null }> {
  const spec = BRANCHES[key];
  if (!spec) throw new Error(`Unknown branch key: ${key}`);

  const branch = await prisma.branch.findUnique({
    where: { id: spec.branchId },
    select: { id: true, name: true, brandId: true },
  });
  if (!branch?.brandId) {
    throw new Error(`Branch not found or missing brand: ${spec.label}`);
  }

  const existingPending = await prisma.branchStockSummary.findFirst({
    where: {
      branchId: spec.branchId,
      status: "IN_PROGRESS",
      name: { contains: "อุปกรณ์" },
      note: { contains: "RECHECK" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  if (existingPending) {
    console.log(
      `  skip summary — already pending: ${existingPending.name} (${existingPending.id})`,
    );
    return { key, createdItems: 0, summaryId: existingPending.id };
  }

  let createdItems = 0;
  const lines: Array<{
    nonMenuItemId: string;
    name: string;
    systemQty: number;
    countedQty: number;
    unitPrice: number;
    unit: string;
    stockType: "EQUIPMENT";
    seq: number;
  }> = [];

  for (let i = 0; i < spec.items.length; i++) {
    const row = spec.items[i];
    let item = await prisma.branchNonMenuItem.findFirst({
      where: {
        branchId: spec.branchId,
        stockType: "EQUIPMENT",
        name: row.name,
      },
    });
    if (!item) {
      if (dryRun) {
        console.log(`  [dry-run] create equipment: ${row.name} (${row.unit})`);
        lines.push({
          nonMenuItemId: `dry-run-${i}`,
          name: row.name,
          systemQty: 0,
          countedQty: row.qty,
          unitPrice: 0,
          unit: row.unit,
          stockType: "EQUIPMENT",
          seq: i + 1,
        });
        createdItems += 1;
        continue;
      }
      item = await prisma.branchNonMenuItem.create({
        data: {
          branchId: spec.branchId,
          name: row.name,
          unit: row.unit,
          stockType: "EQUIPMENT",
          quantity: 0,
        },
      });
      createdItems += 1;
    } else if (item.unit !== row.unit) {
      if (!dryRun) {
        item = await prisma.branchNonMenuItem.update({
          where: { id: item.id },
          data: { unit: row.unit },
        });
      }
    }

    lines.push({
      nonMenuItemId: item!.id,
      name: item!.name,
      systemQty: item!.quantity,
      countedQty: row.qty,
      unitPrice: 0,
      unit: row.unit,
      stockType: "EQUIPMENT",
      seq: i + 1,
    });
  }

  const timing = "RECHECK" as const;
  const timingLabel = STOCK_COUNT_TIMING_LABEL[timing];
  const dateLabel = bangkokDateLabel();
  const docName = `สรุปยอดสต๊อก · ${timingLabel} · อุปกรณ์ · รอบที่ — (${dateLabel})`;

  if (dryRun) {
    console.log(`  [dry-run] summary: ${docName} · ${lines.length} lines`);
    return { key, createdItems, summaryId: null };
  }

  const summary = await prisma.branchStockSummary.create({
    data: {
      brandId: branch.brandId,
      branchId: spec.branchId,
      name: docName,
      status: "IN_PROGRESS",
      completedAt: null,
      note: JSON.stringify({
        stockType: "EQUIPMENT",
        timing,
        pendingAdminApply: true,
        source: "IMPORT",
        lines,
      }),
    },
  });

  return { key, createdItems, summaryId: summary.id };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const only = process.argv.find((a) => a.startsWith("--branch="))?.slice(9);

  console.log(dryRun ? "[dry-run]" : "[apply]", "seed equipment + recheck summaries");

  for (const key of Object.keys(BRANCHES)) {
    if (only && only !== key) continue;
    const spec = BRANCHES[key];
    console.log(`\n→ ${spec.label} (${key})`);
    const result = await seedBranch(key, dryRun);
    console.log(
      `  items created: ${result.createdItems}, summary: ${result.summaryId ?? "—"}`,
    );
  }

  console.log("\nซอย 2 — ข้าม (รอรายการจากผู้ใช้)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
