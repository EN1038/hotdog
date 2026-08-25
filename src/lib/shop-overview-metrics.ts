import { prisma } from "@/lib/db";
import {
  bangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { addDaysToDateKey } from "@/lib/operating-day";
import {
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";

export const SHOP_TOP_SELLERS_N = 10;

export type ShopTopSeller = {
  name: string;
  quantity: number;
  revenueBaht: number;
};

export type ShopTopSellerBranchSlice = {
  branchId: string;
  branchName: string;
  quantity: number;
  revenueBaht: number;
};

/** เมนูขายดีพร้อมแยกสาขา — สำหรับหน้าวิเคราะห์ */
export type ShopTopSellerDetail = {
  key: string;
  name: string;
  quantity: number;
  revenueBaht: number;
  branchCount: number;
  byBranch: ShopTopSellerBranchSlice[];
};

export type ShopDailyPoint = {
  date: string;
  label: string;
  revenueBaht: number;
  orderCount: number;
};

function dayLabelTh(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00+07:00`);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function buildEmptyDays(fromYmd: string, toYmd: string): ShopDailyPoint[] {
  const days: ShopDailyPoint[] = [];
  let cur = fromYmd;
  for (let i = 0; i < 93; i += 1) {
    days.push({
      date: cur,
      label: dayLabelTh(cur),
      revenueBaht: 0,
      orderCount: 0,
    });
    if (cur >= toYmd) break;
    cur = addDaysToDateKey(cur, 1);
  }
  return days;
}

export async function loadShopTopSellers(
  branchIds: string[],
  from: string,
  to: string,
  limit = SHOP_TOP_SELLERS_N,
): Promise<ShopTopSeller[]> {
  if (branchIds.length === 0) return [];

  const orders = await prisma.order.findMany({
    where: {
      branchId: { in: branchIds },
      queueBusinessDate: {
        gte: queueBusinessDateFromKey(from),
        lte: queueBusinessDateFromKey(to),
      },
    },
    select: {
      status: true,
      awaitingPhotoKey: true,
      items: {
        select: {
          itemName: true,
          quantity: true,
          giftQuantity: true,
          unitPrice: true,
          optionsPrice: true,
          branchMenuItemId: true,
        },
      },
    },
    take: 8000,
  });

  const byKey = new Map<
    string,
    { name: string; quantity: number; revenueBaht: number }
  >();

  for (const order of orders) {
    if (!isOrderCountableRevenue(order)) continue;
    for (const it of order.items) {
      const sold = Math.max(0, it.quantity - (it.giftQuantity ?? 0));
      if (sold <= 0) continue;
      const unit = Number(it.unitPrice) + Number(it.optionsPrice);
      const revenue = sold * unit;
      const key = it.branchMenuItemId ?? `name:${it.itemName}`;
      const cur = byKey.get(key) ?? {
        name: it.itemName,
        quantity: 0,
        revenueBaht: 0,
      };
      cur.quantity += sold;
      cur.revenueBaht += revenue;
      if (!cur.name && it.itemName) cur.name = it.itemName;
      byKey.set(key, cur);
    }
  }

  return [...byKey.values()]
    .map((row) => ({
      name: row.name,
      quantity: row.quantity,
      revenueBaht: Math.round(row.revenueBaht * 100) / 100,
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenueBaht - a.revenueBaht)
    .slice(0, limit);
}

function normalizeSellerName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Top sellers with per-branch breakdown (compare across branches).
 * Groups by menu item display name so the same dish at different branches aligns.
 */
export async function loadShopTopSellersDetailed(
  branchIds: string[],
  branchNames: Map<string, string>,
  from: string,
  to: string,
  opts?: { limit?: number; q?: string },
): Promise<ShopTopSellerDetail[]> {
  if (branchIds.length === 0) return [];
  const limit = opts?.limit ?? 50;
  const q = opts?.q?.trim().toLowerCase() ?? "";

  const orders = await prisma.order.findMany({
    where: {
      branchId: { in: branchIds },
      queueBusinessDate: {
        gte: queueBusinessDateFromKey(from),
        lte: queueBusinessDateFromKey(to),
      },
    },
    select: {
      status: true,
      awaitingPhotoKey: true,
      branchId: true,
      items: {
        select: {
          itemName: true,
          quantity: true,
          giftQuantity: true,
          unitPrice: true,
          optionsPrice: true,
        },
      },
    },
    take: 12000,
  });

  const byName = new Map<
    string,
    {
      name: string;
      quantity: number;
      revenueBaht: number;
      byBranch: Map<
        string,
        { branchId: string; branchName: string; quantity: number; revenueBaht: number }
      >;
    }
  >();

  for (const order of orders) {
    if (!isOrderCountableRevenue(order)) continue;
    const branchName =
      branchNames.get(order.branchId) ?? order.branchId;
    for (const it of order.items) {
      const sold = Math.max(0, it.quantity - (it.giftQuantity ?? 0));
      if (sold <= 0) continue;
      const name = normalizeSellerName(it.itemName || "ไม่ระบุชื่อ");
      if (!name) continue;
      if (q && !name.toLowerCase().includes(q)) continue;
      const unit = Number(it.unitPrice) + Number(it.optionsPrice);
      const revenue = sold * unit;
      const key = name.toLowerCase();
      let row = byName.get(key);
      if (!row) {
        row = {
          name,
          quantity: 0,
          revenueBaht: 0,
          byBranch: new Map(),
        };
        byName.set(key, row);
      }
      row.quantity += sold;
      row.revenueBaht += revenue;
      const branchRow = row.byBranch.get(order.branchId) ?? {
        branchId: order.branchId,
        branchName,
        quantity: 0,
        revenueBaht: 0,
      };
      branchRow.quantity += sold;
      branchRow.revenueBaht += revenue;
      row.byBranch.set(order.branchId, branchRow);
    }
  }

  return [...byName.entries()]
    .map(([key, row]) => ({
      key,
      name: row.name,
      quantity: row.quantity,
      revenueBaht: Math.round(row.revenueBaht * 100) / 100,
      branchCount: row.byBranch.size,
      byBranch: [...row.byBranch.values()]
        .map((b) => ({
          ...b,
          revenueBaht: Math.round(b.revenueBaht * 100) / 100,
        }))
        .sort(
          (a, b) =>
            b.quantity - a.quantity || b.revenueBaht - a.revenueBaht,
        ),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenueBaht - a.revenueBaht)
    .slice(0, limit);
}

export async function loadShopDailySeries(
  branchIds: string[],
  from: string,
  to: string,
): Promise<ShopDailyPoint[]> {
  const days = buildEmptyDays(from, to);
  if (branchIds.length === 0) return days;

  const byDate = new Map(days.map((d) => [d.date, d]));

  const orders = await prisma.order.findMany({
    where: {
      branchId: { in: branchIds },
      queueBusinessDate: {
        gte: queueBusinessDateFromKey(from),
        lte: queueBusinessDateFromKey(to),
      },
    },
    select: {
      status: true,
      awaitingPhotoKey: true,
      queueBusinessDate: true,
      deliveryFee: true,
      discountAmount: true,
      items: {
        select: { quantity: true, unitPrice: true, optionsPrice: true },
      },
    },
    take: 8000,
  });

  for (const order of orders) {
    if (!isOrderCountableRevenue(order)) continue;
    const key = bangkokDateKey(order.queueBusinessDate);
    const bucket = byDate.get(key);
    if (!bucket) continue;
    bucket.orderCount += 1;
    bucket.revenueBaht += orderGrandTotal(
      order.items.map((it) => ({
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        optionsPrice: Number(it.optionsPrice),
      })),
      Number(order.deliveryFee),
      Number(order.discountAmount),
    );
  }

  for (const d of days) {
    d.revenueBaht = Math.round(d.revenueBaht * 100) / 100;
  }
  return days;
}

export type ShopHourlyPoint = {
  hour: number;
  label: string;
  revenueBaht: number;
  orderCount: number;
};

function bangkokHour(isoOrDate: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(isoOrDate);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return Number.isFinite(hour) ? hour : 0;
}

/** ยอดขายแยกชั่วโมง 00–23 (เขตเวลาไทย) จากเวลาสร้างออเดอร์ */
export async function loadShopHourlySeries(
  branchIds: string[],
  from: string,
  to: string,
): Promise<ShopHourlyPoint[]> {
  const hours: ShopHourlyPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}`,
    revenueBaht: 0,
    orderCount: 0,
  }));
  if (branchIds.length === 0) return hours;

  const orders = await prisma.order.findMany({
    where: {
      branchId: { in: branchIds },
      queueBusinessDate: {
        gte: queueBusinessDateFromKey(from),
        lte: queueBusinessDateFromKey(to),
      },
    },
    select: {
      status: true,
      awaitingPhotoKey: true,
      createdAt: true,
      deliveryFee: true,
      discountAmount: true,
      items: {
        select: { quantity: true, unitPrice: true, optionsPrice: true },
      },
    },
    take: 8000,
  });

  for (const order of orders) {
    if (!isOrderCountableRevenue(order)) continue;
    const hour = bangkokHour(order.createdAt);
    const bucket = hours[hour];
    if (!bucket) continue;
    bucket.orderCount += 1;
    bucket.revenueBaht += orderGrandTotal(
      order.items.map((it) => ({
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        optionsPrice: Number(it.optionsPrice),
      })),
      Number(order.deliveryFee),
      Number(order.discountAmount),
    );
  }

  for (const h of hours) {
    h.revenueBaht = Math.round(h.revenueBaht * 100) / 100;
  }
  return hours;
}

export type ShopWeekdayPoint = {
  /** 0 = อาทิตย์ … 6 = เสาร์ (เขตเวลาไทย) */
  weekday: number;
  label: string;
  revenueBaht: number;
  orderCount: number;
};

const WEEKDAY_LABELS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

/** รวมยอดขายตามวันในสัปดาห์ จากชุดรายวันที่มีอยู่แล้ว */
export function aggregateShopWeekdaySeries(
  days: ShopDailyPoint[],
): ShopWeekdayPoint[] {
  const buckets: ShopWeekdayPoint[] = WEEKDAY_LABELS_TH.map((label, weekday) => ({
    weekday,
    label,
    revenueBaht: 0,
    orderCount: 0,
  }));

  for (const d of days) {
    const wd = new Date(`${d.date}T12:00:00+07:00`).getDay();
    const bucket = buckets[wd];
    if (!bucket) continue;
    bucket.revenueBaht += d.revenueBaht;
    bucket.orderCount += d.orderCount;
  }

  return buckets.map((b) => ({
    ...b,
    revenueBaht: Math.round(b.revenueBaht * 100) / 100,
  }));
}
