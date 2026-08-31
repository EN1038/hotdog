/**
 * Demo simulation for branch non-menu stock (สิ้นเปลือง + อุปกรณ์).
 * - CONSUMABLE: รับเข้าทุกวันหรือบางวัน + จ่ายออกตามยอดขาย
 * - EQUIPMENT: รับเข้าครั้งเดียว (ครั้งแรกที่เปิดรอบ)
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { startOfBangkokDayFromKey } from "@/lib/constants";
import { generateStockDocumentNo } from "@/lib/stock-document-no";

const DEMO_AUTO_NOTE = "[demo-auto]";

export type DemoConsumableSimResult = {
  consumableStockIns: number;
  consumableIssues: number;
  equipmentStockIns: number;
};

type NonMenuRow = {
  id: string;
  name: string;
  stockType: string;
  quantity: number;
  unit: string;
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)]!;
}

function randomPickN<T>(items: T[], n: number): T[] {
  const copy = [...items];
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = randomInt(0, copy.length - 1);
    out.push(copy[idx]!);
    copy.splice(idx, 1);
  }
  return out;
}

function hashMod(key: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % mod;
}

type ConsumableCadence = "daily" | "some_days" | "rare";

function consumableCadence(name: string): ConsumableCadence {
  if (/ถุง|แก้วน้ำ|บัตรคิว|น้ำแข็ง|ทิชชู/i.test(name)) return "daily";
  if (/ซอส|ซอย|แก๊ส|น้ำยา|เนย|ผง/i.test(name)) return "some_days";
  return "rare";
}

function shouldRestockConsumableToday(
  dateKey: string,
  branchId: string,
  itemId: string,
  cadence: ConsumableCadence,
): boolean {
  const key = `${dateKey}:${branchId}:${itemId}`;
  if (cadence === "daily") return true;
  if (cadence === "some_days") return hashMod(key, 3) !== 0;
  return hashMod(key, 4) === 0;
}

function consumableStockInQty(name: string): number {
  if (/ถุง/i.test(name)) return randomInt(200, 500);
  if (/แก้ว/i.test(name)) return randomInt(50, 180);
  if (/น้ำแข็ง/i.test(name)) return randomInt(2, 5);
  if (/บัตรคิว/i.test(name)) return randomInt(100, 350);
  if (/ทิชชู/i.test(name)) return randomInt(2, 8);
  if (/ซอย|ซอส/i.test(name)) return randomInt(2_000, 6_000);
  if (/แก๊ส/i.test(name)) return randomInt(1, 2);
  if (/น้ำยา/i.test(name)) return randomInt(1, 4);
  return randomInt(10, 80);
}

function equipmentStockInQty(name: string): number {
  if (/เก้าอี้|ตู้|ถัง/i.test(name)) return 1;
  if (/ตะกร้า|ถาด|กล่อง|แก้วไซส์/i.test(name)) return randomInt(2, 6);
  return randomInt(1, 3);
}

async function demoAutoStockInToday(
  itemId: string,
  dateKey: string,
): Promise<boolean> {
  const count = await prisma.branchNonMenuItemHistory.count({
    where: {
      branchNonMenuItemId: itemId,
      type: "STOCK_IN",
      note: { contains: DEMO_AUTO_NOTE },
      createdAt: { gte: startOfBangkokDayFromKey(dateKey) },
    },
  });
  return count > 0;
}

async function demoAutoEquipmentReceived(itemId: string): Promise<boolean> {
  const count = await prisma.branchNonMenuItemHistory.count({
    where: {
      branchNonMenuItemId: itemId,
      type: "STOCK_IN",
      note: { contains: DEMO_AUTO_NOTE },
    },
  });
  return count > 0;
}

async function applyNonMenuDelta(opts: {
  itemId: string;
  delta: number;
  type: "STOCK_IN" | "ISSUE";
  staffId: string;
  note: string;
  at: Date;
  branchCode: string;
  branchId: string;
  batchId?: string;
  documentNo?: string;
}): Promise<boolean> {
  const item = await prisma.branchNonMenuItem.findFirst({
    where: { id: opts.itemId },
    select: { id: true, quantity: true },
  });
  if (!item) return false;

  const newQty = item.quantity + opts.delta;
  if (newQty < 0) return false;

  const documentNo =
    opts.documentNo ??
    (await generateStockDocumentNo({
      kind: opts.type === "STOCK_IN" ? "IN" : "OUT",
      branchCode: opts.branchCode,
      branchId: opts.branchId,
    }));

  await prisma.$transaction(async (tx) => {
    await tx.branchNonMenuItem.update({
      where: { id: opts.itemId },
      data: { quantity: newQty },
    });
    await tx.branchNonMenuItemHistory.create({
      data: {
        branchNonMenuItemId: opts.itemId,
        quantity: opts.delta,
        type: opts.type,
        note: opts.note,
        batchId: opts.batchId ?? null,
        documentNo,
        createdAt: opts.at,
        createdByStaffId: opts.staffId,
      },
    });
  });
  return true;
}

async function loadNonMenuItems(branchId: string): Promise<NonMenuRow[]> {
  return prisma.branchNonMenuItem.findMany({
    where: { branchId },
    select: {
      id: true,
      name: true,
      stockType: true,
      quantity: true,
      unit: true,
    },
  });
}

async function stockInConsumables(
  consumables: NonMenuRow[],
  opts: {
    branchId: string;
    branchCode: string;
    staffId: string;
    dateKey: string;
    at: Date;
    batchId: string;
    documentNo: string;
    note: string;
    filter?: (item: NonMenuRow) => boolean;
  },
): Promise<number> {
  let count = 0;
  for (const item of consumables) {
    if (opts.filter && !opts.filter(item)) continue;
    const cadence = consumableCadence(item.name);
    if (
      !shouldRestockConsumableToday(
        opts.dateKey,
        opts.branchId,
        item.id,
        cadence,
      )
    ) {
      continue;
    }
    if (await demoAutoStockInToday(item.id, opts.dateKey)) continue;

    const ok = await applyNonMenuDelta({
      itemId: item.id,
      delta: consumableStockInQty(item.name),
      type: "STOCK_IN",
      staffId: opts.staffId,
      note: opts.note,
      at: opts.at,
      branchCode: opts.branchCode,
      branchId: opts.branchId,
      batchId: opts.batchId,
      documentNo: opts.documentNo,
    });
    if (ok) count += 1;
  }
  return count;
}

async function issueConsumablesForOrders(
  consumables: NonMenuRow[],
  ordersCreated: number,
  opts: {
    branchId: string;
    branchCode: string;
    staffId: string;
    at: Date;
  },
): Promise<number> {
  if (ordersCreated <= 0) return 0;

  const bags = consumables.filter((c) => /ถุง/i.test(c.name));
  const cups = consumables.filter((c) => /แก้วน้ำ/i.test(c.name));
  const batchId = randomUUID();
  const documentNo = await generateStockDocumentNo({
    kind: "OUT",
    branchCode: opts.branchCode,
    branchId: opts.branchId,
  });

  let issues = 0;
  for (let i = 0; i < ordersCreated; i++) {
    if (bags.length > 0) {
      const bag = randomPick(bags);
      if (bag.quantity >= 1) {
        const ok = await applyNonMenuDelta({
          itemId: bag.id,
          delta: -randomInt(1, 2),
          type: "ISSUE",
          staffId: opts.staffId,
          note: `${DEMO_AUTO_NOTE} จ่ายออกตามการขาย`,
          at: opts.at,
          branchCode: opts.branchCode,
          branchId: opts.branchId,
          batchId,
          documentNo,
        });
        if (ok) issues += 1;
      }
    }
    if (cups.length > 0 && Math.random() < 0.22) {
      const cup = randomPick(cups);
      if (cup.quantity >= 1) {
        const ok = await applyNonMenuDelta({
          itemId: cup.id,
          delta: -randomInt(1, 3),
          type: "ISSUE",
          staffId: opts.staffId,
          note: `${DEMO_AUTO_NOTE} จ่ายออกตามการขาย`,
          at: opts.at,
          branchCode: opts.branchCode,
          branchId: opts.branchId,
          batchId,
          documentNo,
        });
        if (ok) issues += 1;
      }
    }
  }
  return issues;
}

/** Cron tick — drip consumable / equipment activity. */
export async function simulateDemoConsumablesTick(opts: {
  branchId: string;
  branchCode: string;
  staffId: string;
  dateKey: string;
  now: Date;
  openedThisTick: boolean;
  ordersCreated: number;
  hour: number;
}): Promise<DemoConsumableSimResult> {
  const result: DemoConsumableSimResult = {
    consumableStockIns: 0,
    consumableIssues: 0,
    equipmentStockIns: 0,
  };

  const items = await loadNonMenuItems(opts.branchId);
  if (items.length === 0) return result;

  const consumables = items.filter((i) => i.stockType === "CONSUMABLE");
  const equipment = items.filter((i) => i.stockType === "EQUIPMENT");

  for (const item of equipment) {
    if (await demoAutoEquipmentReceived(item.id)) continue;
    const ok = await applyNonMenuDelta({
      itemId: item.id,
      delta: equipmentStockInQty(item.name),
      type: "STOCK_IN",
      staffId: opts.staffId,
      note: `${DEMO_AUTO_NOTE} รับเข้าอุปกรณ์ (ครั้งแรก)`,
      at: opts.now,
      branchCode: opts.branchCode,
      branchId: opts.branchId,
    });
    if (ok) result.equipmentStockIns += 1;
  }

  if (opts.openedThisTick) {
    const batchId = randomUUID();
    const documentNo = await generateStockDocumentNo({
      kind: "IN",
      branchCode: opts.branchCode,
      branchId: opts.branchId,
    });
    result.consumableStockIns += await stockInConsumables(consumables, {
      branchId: opts.branchId,
      branchCode: opts.branchCode,
      staffId: opts.staffId,
      dateKey: opts.dateKey,
      at: opts.now,
      batchId,
      documentNo,
      note: `${DEMO_AUTO_NOTE} รับเข้าสิ้นเปลือง`,
    });
  }

  if (
    !opts.openedThisTick &&
    opts.hour >= 14 &&
    opts.hour <= 17 &&
    Math.random() < 0.14
  ) {
    const batchId = randomUUID();
    const documentNo = await generateStockDocumentNo({
      kind: "IN",
      branchCode: opts.branchCode,
      branchId: opts.branchId,
    });
    result.consumableStockIns += await stockInConsumables(consumables, {
      branchId: opts.branchId,
      branchCode: opts.branchCode,
      staffId: opts.staffId,
      dateKey: opts.dateKey,
      at: opts.now,
      batchId,
      documentNo,
      note: `${DEMO_AUTO_NOTE} รับเข้าเติมสิ้นเปลือง`,
      filter: (item) =>
        consumableCadence(item.name) === "daily" && item.quantity < 120,
    });
  }

  result.consumableIssues += await issueConsumablesForOrders(
    consumables,
    opts.ordersCreated,
    {
      branchId: opts.branchId,
      branchCode: opts.branchCode,
      staffId: opts.staffId,
      at: opts.now,
    },
  );

  return result;
}

/** Batch backfill — one-shot consumable day alongside menu sales. */
export async function simulateDemoConsumablesBatch(opts: {
  branchId: string;
  branchCode: string;
  staffId: string;
  dateKey: string;
  ordersCreated: number;
  at: Date;
}): Promise<DemoConsumableSimResult> {
  const result: DemoConsumableSimResult = {
    consumableStockIns: 0,
    consumableIssues: 0,
    equipmentStockIns: 0,
  };

  const items = await loadNonMenuItems(opts.branchId);
  if (items.length === 0) return result;

  const consumables = items.filter((i) => i.stockType === "CONSUMABLE");
  const equipment = items.filter((i) => i.stockType === "EQUIPMENT");

  for (const item of equipment) {
    if (await demoAutoEquipmentReceived(item.id)) continue;
    const ok = await applyNonMenuDelta({
      itemId: item.id,
      delta: equipmentStockInQty(item.name),
      type: "STOCK_IN",
      staffId: opts.staffId,
      note: `${DEMO_AUTO_NOTE} รับเข้าอุปกรณ์ (ครั้งแรก)`,
      at: opts.at,
      branchCode: opts.branchCode,
      branchId: opts.branchId,
    });
    if (ok) result.equipmentStockIns += 1;
  }

  const batchId = randomUUID();
  const documentNo = await generateStockDocumentNo({
    kind: "IN",
    branchCode: opts.branchCode,
    branchId: opts.branchId,
  });
  result.consumableStockIns += await stockInConsumables(consumables, {
    branchId: opts.branchId,
    branchCode: opts.branchCode,
    staffId: opts.staffId,
    dateKey: opts.dateKey,
    at: opts.at,
    batchId,
    documentNo,
    note: `${DEMO_AUTO_NOTE} รับเข้าสิ้นเปลือง`,
  });

  result.consumableIssues += await issueConsumablesForOrders(
    consumables,
    opts.ordersCreated,
    {
      branchId: opts.branchId,
      branchCode: opts.branchCode,
      staffId: opts.staffId,
      at: opts.at,
    },
  );

  return result;
}
