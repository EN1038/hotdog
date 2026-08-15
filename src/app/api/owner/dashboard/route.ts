import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  bangkokMonthRangeToToday,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { getCalendarDayState } from "@/lib/operating-day";
import { orderGrandTotal } from "@/lib/order-totals";
import { isTestBranch } from "@/lib/branch-test";
import { buildSalesReport } from "@/lib/sales-report";
import { EMPTY_SALES_REPORT_STATS } from "@/lib/sales-report-shared";
import {
  loadShopDailySeries,
  loadShopTopSellers,
} from "@/lib/shop-overview-metrics";
import type { OwnerPeriod, OwnerTodayOrder } from "@/lib/owner-dashboard";

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
            wasteItems: [],
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
      loadShopTopSellers(branchIds, rangeFrom, rangeTo),
      loadShopDailySeries(branchIds, rangeFrom, rangeTo),
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
      wasteItems: report.wasteItems,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
