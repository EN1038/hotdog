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
