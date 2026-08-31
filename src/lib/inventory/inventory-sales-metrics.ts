import { BranchOperatingMode, OrderStatus, SkewerOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { bangkokDateKey, queueBusinessDateFromKey } from "@/lib/constants";
import {
  computeRecentTradingAverage,
  computeSameWeekdayAverage,
  computeTrendPct,
} from "@/lib/inventory/inventory-calculations";
import { INVENTORY_DEFAULTS } from "@/lib/inventory/inventory-config";
import {
  addBangkokDays,
  bangkokWeekdayIndex,
  dateKeyRange,
  tomorrowBangkokDateKey,
} from "@/lib/inventory/inventory-date";
import { deriveDataQuality } from "@/lib/inventory/inventory-data-quality";
import {
  resolveSalesDataSource,
  type InventorySalesDataSource,
} from "@/lib/inventory/inventory-sales-source";
import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";

export type InventoryMenuItem = Awaited<
  ReturnType<typeof loadBranchMenuItemIdsForInventory>
>[number];

export type MenuItemSalesMetrics = {
  menuItemId: string;
  todaySales: number;
  avg7: number;
  avg14: number;
  avg30: number;
  sameWeekdayAverage: number;
  sameWeekdaySampleSize: number;
  recentTrendPct: number;
  daysWithSales: number;
  sampleSize: number;
  dataSource: InventorySalesDataSource;
  dataQuality: ReturnType<typeof deriveDataQuality>;
  orderSoldTotal: number;
  skewerSoldTotal: number;
  includesSkewer: boolean;
  /** Min/max sold on days that had sales in the window */
  minDailySales: number;
  maxDailySales: number;
};

type DailySalesMaps = {
  orderByMenuDate: Map<string, Map<string, number>>;
  skewerByMenuDate: Map<string, Map<string, number>>;
  includesSkewer: boolean;
};

export async function loadBranchMenuItemIdsForInventory(branchId: string) {
  const menuItems = await prisma.branchMenuItem.findMany({
    where: { branchId, isHidden: false },
    include: {
      category: { select: { name: true, stockExempt: true } },
      stock: { select: { quantity: true, updatedAt: true } },
      brandProduct: { select: { sku: true, barcode: true } },
      optionGroupLinks: {
        include: { group: { select: { mode: true } } },
      },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  return menuItems.filter(
    (item) =>
      !item.optionGroupLinks.some((l) => l.group.mode === "FROM_MENU") &&
      !item.category?.stockExempt,
  );
}

export async function loadBranchSalesDailyMaps(input: {
  branchId: string;
  from: string;
  to: string;
  menuItemIds: string[];
  operatingMode: BranchOperatingMode;
}): Promise<DailySalesMaps> {
  const orderByMenuDate = new Map<string, Map<string, number>>();
  const skewerByMenuDate = new Map<string, Map<string, number>>();
  const includesSkewer =
    input.operatingMode === BranchOperatingMode.SKEWER;

  if (input.menuItemIds.length === 0) {
    return { orderByMenuDate, skewerByMenuDate, includesSkewer };
  }

  const dayStart = queueBusinessDateFromKey(input.from);
  const dayEnd = queueBusinessDateFromKey(input.to);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      branchMenuItemId: { in: input.menuItemIds },
      order: {
        branchId: input.branchId,
        status: OrderStatus.COMPLETED,
        queueBusinessDate: { gte: dayStart, lte: dayEnd },
      },
    },
    select: {
      branchMenuItemId: true,
      quantity: true,
      giftQuantity: true,
      order: { select: { queueBusinessDate: true } },
    },
  });

  for (const line of orderItems) {
    if (!line.branchMenuItemId) continue;
    const sold = Math.max(0, line.quantity - (line.giftQuantity ?? 0));
    if (sold <= 0) continue;
    const dateKey = line.order.queueBusinessDate.toISOString().slice(0, 10);
    addToNestedMap(orderByMenuDate, line.branchMenuItemId, dateKey, sold);
  }

  if (includesSkewer) {
    const skewerItems = await prisma.skewerOrderItem.findMany({
      where: {
        branchMenuItemId: { in: input.menuItemIds },
        skewerOrder: {
          branchId: input.branchId,
          status: {
            in: [SkewerOrderStatus.CONFIRMED, SkewerOrderStatus.DELIVERED],
          },
          requestedDate: { gte: dayStart, lte: dayEnd },
        },
      },
      select: {
        branchMenuItemId: true,
        confirmedQuantity: true,
        requestedQuantity: true,
        skewerOrder: { select: { requestedDate: true } },
      },
    });

    for (const line of skewerItems) {
      if (!line.branchMenuItemId) continue;
      const sold = Math.max(0, line.confirmedQuantity ?? line.requestedQuantity);
      if (sold <= 0) continue;
      const dateKey = line.skewerOrder.requestedDate.toISOString().slice(0, 10);
      addToNestedMap(skewerByMenuDate, line.branchMenuItemId, dateKey, sold);
    }
  }

  return { orderByMenuDate, skewerByMenuDate, includesSkewer };
}

function addToNestedMap(
  outer: Map<string, Map<string, number>>,
  menuItemId: string,
  dateKey: string,
  qty: number,
) {
  if (!outer.has(menuItemId)) outer.set(menuItemId, new Map());
  const inner = outer.get(menuItemId)!;
  inner.set(dateKey, (inner.get(dateKey) ?? 0) + qty);
}

export function computeMenuItemSalesMetrics(input: {
  menuItemId: string;
  dailyMaps: DailySalesMaps;
  from: string;
  to: string;
}): MenuItemSalesMetrics {
  const dateKeys = dateKeyRange(input.from, input.to);
  const tomorrow = tomorrowBangkokDateKey(input.to);
  const targetWeekday = bangkokWeekdayIndex(tomorrow);

  const orderDaily = input.dailyMaps.orderByMenuDate.get(input.menuItemId) ?? new Map();
  const skewerDaily =
    input.dailyMaps.skewerByMenuDate.get(input.menuItemId) ?? new Map();

  const combinedDaily = new Map<string, number>();
  let orderSoldTotal = 0;
  let skewerSoldTotal = 0;
  for (const key of dateKeys) {
    const orderQty = orderDaily.get(key) ?? 0;
    const skewerQty = skewerDaily.get(key) ?? 0;
    orderSoldTotal += orderQty;
    skewerSoldTotal += skewerQty;
    const total = orderQty + skewerQty;
    if (total > 0) combinedDaily.set(key, total);
  }

  const sortedKeys = [...combinedDaily.keys()].sort();
  const daysWithSales = sortedKeys.length;
  const totalSold = orderSoldTotal + skewerSoldTotal;
  let minDailySales = 0;
  let maxDailySales = 0;
  if (daysWithSales > 0) {
    minDailySales = Infinity;
    for (const qty of combinedDaily.values()) {
      if (qty < minDailySales) minDailySales = qty;
      if (qty > maxDailySales) maxDailySales = qty;
    }
  }

  const tradingDays = Math.max(daysWithSales, 1);
  const avg30 = totalSold / tradingDays;

  const avg7 = computeRecentTradingAverage(combinedDaily, sortedKeys, 7);
  const avg14 = computeRecentTradingAverage(combinedDaily, sortedKeys, 14);

  const sameWeekday = computeSameWeekdayAverage(
    combinedDaily,
    targetWeekday,
    INVENTORY_DEFAULTS.sameWeekdayLookbackWeeks,
    tomorrow,
  );

  const recentTrendPct = computeTrendPct(avg7, avg14 > 0 ? avg14 : avg30);

  const includesPartial =
    input.dailyMaps.includesSkewer && skewerSoldTotal > 0;

  const dataQuality = deriveDataQuality({
    tradingDaysWithSales: daysWithSales,
    includesPartialStockTracking: includesPartial,
  });

  const dataSource = resolveSalesDataSource({
    includesSkewer: input.dailyMaps.includesSkewer && skewerSoldTotal > 0,
    hasOrderSales: orderSoldTotal > 0,
  });

  return {
    menuItemId: input.menuItemId,
    todaySales: combinedDaily.get(input.to) ?? 0,
    avg7: round2(avg7),
    avg14: round2(avg14),
    avg30: round2(avg30),
    sameWeekdayAverage: round2(sameWeekday.average),
    sameWeekdaySampleSize: sameWeekday.sampleSize,
    recentTrendPct,
    daysWithSales,
    sampleSize: tradingDays,
    dataSource,
    dataQuality,
    orderSoldTotal,
    skewerSoldTotal,
    includesSkewer: input.dailyMaps.includesSkewer,
    minDailySales,
    maxDailySales,
  };
}

export async function loadBranchSalesMetricsMap(
  branchId: string,
  range?: { from: string; to: string },
): Promise<{
  metricsByMenuId: Map<string, MenuItemSalesMetrics>;
  menuItems: Awaited<ReturnType<typeof loadBranchMenuItemIdsForInventory>>;
  analysisFrom: string;
  analysisTo: string;
}> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { operatingMode: true },
  });
  if (!branch) throw new Error("NOT_FOUND");

  const menuItems = await loadBranchMenuItemIdsForInventory(branchId);
  const menuIds = menuItems.map((m) => m.id);
  const analysisTo = range?.to ?? bangkokDateKey();
  const analysisFrom =
    range?.from ??
    addBangkokDays(analysisTo, -(INVENTORY_DEFAULTS.analysisWindowDays - 1));

  const dailyMaps = await loadBranchSalesDailyMaps({
    branchId,
    from: analysisFrom,
    to: analysisTo,
    menuItemIds: menuIds,
    operatingMode: branch.operatingMode,
  });

  const metricsByMenuId = new Map<string, MenuItemSalesMetrics>();
  for (const id of menuIds) {
    metricsByMenuId.set(
      id,
      computeMenuItemSalesMetrics({
        menuItemId: id,
        dailyMaps,
        from: analysisFrom,
        to: analysisTo,
      }),
    );
  }

  return { metricsByMenuId, menuItems, analysisFrom, analysisTo };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
