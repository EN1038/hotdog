import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  bangkokDateKey,
  bangkokMonthRangeToToday,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { addDaysToDateKey, getCalendarDayState } from "@/lib/operating-day";
import {
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";
import { isTestBranch } from "@/lib/branch-test";
import { buildSalesReport } from "@/lib/sales-report";
import { EMPTY_SALES_REPORT_STATS } from "@/lib/sales-report-shared";
import type {
  OwnerDailyPoint,
  OwnerPeriod,
  OwnerTodayOrder,
  OwnerTopSeller,
} from "@/lib/owner-dashboard";

const TOP_SELLERS_N = 10;

function dayLabelTh(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00+07:00`);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function buildEmptyDays(fromYmd: string, toYmd: string): OwnerDailyPoint[] {
  const days: OwnerDailyPoint[] = [];
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

async function loadBrandSaleStockSnapshot(branchIds: string[]) {
  if (branchIds.length === 0) {
    return { saleStockQty: 0, saleStockValue: 0 };
  }
  const items = await prisma.branchMenuItem.findMany({
    where: {
      branchId: { in: branchIds },
      isHidden: false,
    },
    select: {
      price: true,
      category: { select: { stockExempt: true } },
      stock: { select: { quantity: true } },
      optionGroupLinks: {
        select: { group: { select: { mode: true } } },
      },
    },
  });

  let saleStockQty = 0;
  let saleStockValue = 0;
  for (const item of items) {
    const isPromo = item.optionGroupLinks.some(
      (l) => l.group.mode === "FROM_MENU",
    );
    if (isPromo || item.category?.stockExempt) continue;
    const quantity = Math.max(0, Number(item.stock?.quantity ?? 0));
    const price = Number(item.price ?? 0);
    saleStockQty += quantity;
    saleStockValue += quantity * price;
  }

  return {
    saleStockQty,
    saleStockValue: Math.round(saleStockValue * 100) / 100,
  };
}

async function loadTopSellers(
  branchIds: string[],
  from: string,
  to: string,
): Promise<OwnerTopSeller[]> {
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
    .slice(0, TOP_SELLERS_N);
}

async function loadDailySeries(
  branchIds: string[],
  from: string,
  to: string,
): Promise<OwnerDailyPoint[]> {
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

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    if (session.isPlatformAdmin) {
      return jsonError("หน้านี้สำหรับเจ้าของร้าน", 403, { redirect: "/admin" });
    }

    const accessible = getAccessibleBrandIds(session);
    const brandIds = accessible ?? [];
    if (brandIds.length === 0) {
      return jsonError("บัญชีนี้ยังไม่ได้ผูกกับร้าน", 403);
    }

    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period");
    const period: OwnerPeriod = periodParam === "month" ? "month" : "day";
    const includeOrders = searchParams.get("orders") === "1";
    const requestedBrandId = searchParams.get("brandId")?.trim();
    const brandId =
      requestedBrandId && brandIds.includes(requestedBrandId)
        ? requestedBrandId
        : brandIds[0]!;

    const dayState = getCalendarDayState();
    const monthRange = bangkokMonthRangeToToday();
    const defaultFrom =
      period === "month" ? monthRange.from : dayState.operatingDay;
    const defaultTo = dayState.operatingDay;

    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    let rangeFrom =
      fromParam && isBangkokDateKey(fromParam) ? fromParam : defaultFrom;
    let rangeTo =
      toParam && isBangkokDateKey(toParam) ? toParam : defaultTo;
    if (rangeFrom > rangeTo) {
      const tmp = rangeFrom;
      rangeFrom = rangeTo;
      rangeTo = tmp;
    }
    if (rangeTo > dayState.operatingDay) rangeTo = dayState.operatingDay;
    if (rangeFrom > dayState.operatingDay) rangeFrom = dayState.operatingDay;

    const includeTest = searchParams.get("includeTest") === "1";

    const [brand, branches] = await Promise.all([
      prisma.brand.findUnique({
        where: { id: brandId },
        select: {
          id: true,
          name: true,
          nameTh: true,
          code: true,
          logoUrl: true,
          coverImageUrl: true,
          color: true,
          stockEnabled: true,
        },
      }),
      prisma.branch.findMany({
        where: { brandId },
        select: {
          id: true,
          name: true,
          code: true,
          isOpen: true,
          isTest: true,
          isHidden: true,
          kind: true,
          stockEnabled: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);

    if (!brand) return jsonError("ไม่พบร้าน", 404);

    const hasTestBranch = branches.some((b) => b.isTest);
    const scopedBranches = (includeTest
      ? branches
      : branches.filter((b) => !b.isTest)
    ).filter((b) => b.kind !== "WAREHOUSE");
    const branchIds = scopedBranches.map((b) => b.id);
    const branchNames = new Map(scopedBranches.map((b) => [b.id, b.name]));

    const stockEnabled =
      Boolean(brand.stockEnabled) &&
      scopedBranches.some((b) => b.stockEnabled);

    const report =
      branchIds.length === 0
        ? {
            stats: { ...EMPTY_SALES_REPORT_STATS },
            byChannel: [],
            byPayment: [],
            byBranch: [],
          }
        : await buildSalesReport({
            branchIds,
            branchNames,
            from: rangeFrom,
            to: rangeTo,
          });

    const [stock, topSellers, days] = await Promise.all([
      stockEnabled
        ? loadBrandSaleStockSnapshot(branchIds)
        : Promise.resolve({ saleStockQty: 0, saleStockValue: 0 }),
      loadTopSellers(branchIds, rangeFrom, rangeTo),
      loadDailySeries(branchIds, rangeFrom, rangeTo),
    ]);

    let todayOrders: OwnerTodayOrder[] = [];
    if (includeOrders && period === "day" && branchIds.length > 0) {
      const orders = await prisma.order.findMany({
        where: {
          branchId: { in: branchIds },
          queueBusinessDate: {
            gte: queueBusinessDateFromKey(rangeFrom),
            lte: queueBusinessDateFromKey(rangeTo),
          },
        },
        select: {
          id: true,
          orderNumber: true,
          queueNumber: true,
          status: true,
          fulfillmentType: true,
          salesChannel: true,
          paymentMethod: true,
          customerName: true,
          createdAt: true,
          deliveryFee: true,
          discountAmount: true,
          branch: { select: { name: true } },
          items: {
            select: { quantity: true, unitPrice: true, optionsPrice: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 80,
      });
      todayOrders = orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        queueNumber: order.queueNumber,
        status: order.status,
        fulfillmentType: order.fulfillmentType,
        salesChannel: order.salesChannel,
        paymentMethod: order.paymentMethod,
        customerName: order.customerName,
        createdAt: order.createdAt.toISOString(),
        total: orderGrandTotal(
          order.items.map((it) => ({
            quantity: it.quantity,
            unitPrice: Number(it.unitPrice),
            optionsPrice: Number(it.optionsPrice),
          })),
          Number(order.deliveryFee),
          Number(order.discountAmount),
        ),
        branchName: order.branch.name,
      }));
    }

    return jsonOk({
      brand: {
        id: brand.id,
        name: brand.name,
        nameTh: brand.nameTh,
        code: brand.code,
        logoUrl: brand.logoUrl,
        coverImageUrl: brand.coverImageUrl,
        color: brand.color,
      },
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        isOpen: b.isOpen,
        isHidden: b.isHidden,
        kind: b.kind,
        isTest: isTestBranch(b),
      })),
      hasTestBranch,
      includeTest,
      operatingDay: dayState.operatingDay,
      period,
      from: rangeFrom,
      to: rangeTo,
      stats: report.stats,
      byBranch: report.byBranch,
      byChannel: report.byChannel,
      byPayment: report.byPayment,
      orders: todayOrders,
      stockEnabled,
      saleStockQty: stock.saleStockQty,
      saleStockValue: stock.saleStockValue,
      topSellers,
      days,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
