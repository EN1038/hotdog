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
import {
  addCookSlice,
  emptyCookBreakdown,
  parseCookMethod,
  roundCookBreakdown,
  type CookBreakdown,
  type CookMethod,
} from "@/lib/cook-method";
import {
  addOptionSlice,
  extractFilterableOptionTokens,
  OPTION_FILTER_NONE,
  optionSummaryFromMap,
  type OptionQtySlice,
} from "@/lib/order-option-tokens";

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
  byCook: CookBreakdown;
};

/** เมนูขายดีพร้อมแยกสาขา — สำหรับหน้าวิเคราะห์ */
export type ShopTopSellerDetail = {
  key: string;
  name: string;
  quantity: number;
  revenueBaht: number;
  branchCount: number;
  byCook: CookBreakdown;
  byBranch: ShopTopSellerBranchSlice[];
};

export type ShopTopSellersDetailedResult = {
  items: ShopTopSellerDetail[];
  cookSummary: CookBreakdown;
  optionSummary: OptionQtySlice[];
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
 * Optionally filter by option token (or legacy cook method) from optionsText.
 */
export async function loadShopTopSellersDetailed(
  branchIds: string[],
  branchNames: Map<string, string>,
  from: string,
  to: string,
  opts?: {
    limit?: number;
    q?: string;
    cook?: CookMethod;
    option?: string | null;
  },
): Promise<ShopTopSellersDetailedResult> {
  if (branchIds.length === 0) {
    return {
      items: [],
      cookSummary: emptyCookBreakdown(),
      optionSummary: [],
    };
  }
  const limit = opts?.limit ?? 50;
  const q = opts?.q?.trim().toLowerCase() ?? "";
  let optionFilter = opts?.option?.trim() || null;
  if (!optionFilter && opts?.cook) {
    if (opts.cook === "grill") optionFilter = "ย่าง";
    else if (opts.cook === "fry") optionFilter = "ทอด";
    else if (opts.cook === "unknown") optionFilter = OPTION_FILTER_NONE;
  }

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
          optionsText: true,
        },
      },
    },
    take: 12000,
  });

  type BranchAgg = {
    branchId: string;
    branchName: string;
    quantity: number;
    revenueBaht: number;
    byCook: CookBreakdown;
  };

  const byName = new Map<
    string,
    {
      name: string;
      quantity: number;
      revenueBaht: number;
      byCook: CookBreakdown;
      byBranch: Map<string, BranchAgg>;
    }
  >();
  const cookSummary = emptyCookBreakdown();
  const optionSummaryMap = new Map<
    string,
    { quantity: number; revenueBaht: number }
  >();
  let noneQty = 0;
  let noneRevenue = 0;

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
      const cook = parseCookMethod(it.optionsText);
      const tokens = extractFilterableOptionTokens(it.optionsText);
      const unit = Number(it.unitPrice) + Number(it.optionsPrice);
      const revenue = sold * unit;

      addCookSlice(cookSummary, cook, sold, revenue);
      if (tokens.length === 0) {
        noneQty += sold;
        noneRevenue += revenue;
      } else {
        for (const token of tokens) {
          addOptionSlice(optionSummaryMap, token, sold, revenue);
        }
      }

      if (optionFilter === OPTION_FILTER_NONE) {
        if (tokens.length > 0) continue;
      } else if (optionFilter) {
        if (!tokens.includes(optionFilter)) continue;
      }

      const key = name.toLowerCase();
      let row = byName.get(key);
      if (!row) {
        row = {
          name,
          quantity: 0,
          revenueBaht: 0,
          byCook: emptyCookBreakdown(),
          byBranch: new Map(),
        };
        byName.set(key, row);
      }
      row.quantity += sold;
      row.revenueBaht += revenue;
      addCookSlice(row.byCook, cook, sold, revenue);
      const branchRow = row.byBranch.get(order.branchId) ?? {
        branchId: order.branchId,
        branchName,
        quantity: 0,
        revenueBaht: 0,
        byCook: emptyCookBreakdown(),
      };
      branchRow.quantity += sold;
      branchRow.revenueBaht += revenue;
      addCookSlice(branchRow.byCook, cook, sold, revenue);
      row.byBranch.set(order.branchId, branchRow);
    }
  }

  const items = [...byName.entries()]
    .map(([key, row]) => ({
      key,
      name: row.name,
      quantity: row.quantity,
      revenueBaht: Math.round(row.revenueBaht * 100) / 100,
      branchCount: row.byBranch.size,
      byCook: roundCookBreakdown(row.byCook),
      byBranch: [...row.byBranch.values()]
        .map((b) => ({
          branchId: b.branchId,
          branchName: b.branchName,
          quantity: b.quantity,
          revenueBaht: Math.round(b.revenueBaht * 100) / 100,
          byCook: roundCookBreakdown(b.byCook),
        }))
        .sort(
          (a, b) =>
            b.quantity - a.quantity || b.revenueBaht - a.revenueBaht,
        ),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenueBaht - a.revenueBaht)
    .slice(0, limit);

  return {
    items,
    cookSummary: roundCookBreakdown(cookSummary),
    optionSummary: optionSummaryFromMap(
      optionSummaryMap,
      noneQty,
      noneRevenue,
    ),
  };
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
