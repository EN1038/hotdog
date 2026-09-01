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
  aggregateShopWeekdaySeries,
  loadShopDailySeries,
  loadShopHourlySeries,
  loadShopTopSellers,
} from "@/lib/shop-overview-metrics";
import { loadShopAgingAttention } from "@/lib/shop-aging-summary";
import type { OwnerPeriod, OwnerTodayOrder } from "@/lib/owner-dashboard";
import {
  BRAND_PLAN_HINTS,
  BRAND_PLAN_LABELS,
  BRAND_PLAN_PRICES,
  BRAND_STATUS_LABELS,
  getBrandSubscriptionState,
} from "@/lib/brand-plan-shared";
import type { BrandPlan, BrandStatus } from "@prisma/client";
import { pendingConvertNotiCreatedAtGte } from "@/lib/stock-count-pending-noti";
import { syncOwnerTrialFullAccess, syncOwnerRegisterTemplateIfEmpty } from "@/lib/owner-register-setup";

async function loadBrandSaleStockSnapshot(branchIds: string[]) {
  if (branchIds.length === 0) {
    return {
      saleStockQty: 0,
      saleStockValue: 0,
      byBranch: new Map<string, { saleStockQty: number; saleStockValue: number }>(),
    };
  }
  const items = await prisma.branchMenuItem.findMany({
    where: {
      branchId: { in: branchIds },
      isHidden: false,
    },
    select: {
      branchId: true,
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
  const byBranch = new Map<
    string,
    { saleStockQty: number; saleStockValue: number }
  >();

  for (const item of items) {
    const isPromo = item.optionGroupLinks.some(
      (l) => l.group.mode === "FROM_MENU",
    );
    if (isPromo || item.category?.stockExempt) continue;
    const quantity = Math.max(0, Number(item.stock?.quantity ?? 0));
    const price = Number(item.price ?? 0);
    const value = quantity * price;
    saleStockQty += quantity;
    saleStockValue += value;
    const prev = byBranch.get(item.branchId) ?? {
      saleStockQty: 0,
      saleStockValue: 0,
    };
    prev.saleStockQty += quantity;
    prev.saleStockValue += value;
    byBranch.set(item.branchId, prev);
  }

  return {
    saleStockQty,
    saleStockValue: Math.round(saleStockValue * 100) / 100,
    byBranch,
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
    const branchIdParam = searchParams.get("branchId")?.trim() || null;

    await syncOwnerTrialFullAccess(brandId);
    await syncOwnerRegisterTemplateIfEmpty(brandId);

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
          kitchenEnabled: true,
          bbqEnabled: true,
          skewerEnabled: true,
          status: true,
          plan: true,
          maxBranches: true,
          maxStaff: true,
          trialEndsAt: true,
          nextDueAt: true,
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
    const selectedBranch =
      branchIdParam != null
        ? scopedBranches.find((b) => b.id === branchIdParam) ?? null
        : null;
    const reportBranches = selectedBranch ? [selectedBranch] : scopedBranches;
    const branchIds = reportBranches.map((b) => b.id);
    const branchNames = new Map(reportBranches.map((b) => [b.id, b.name]));
    const filterBranchId = selectedBranch?.id ?? null;

    const liveBranchIds = branches
      .filter((b) => !b.isTest && b.kind !== "WAREHOUSE")
      .map((b) => b.id);

    const openShiftRows =
      liveBranchIds.length === 0
        ? []
        : await prisma.branchShift.findMany({
            where: {
              branchId: { in: liveBranchIds },
              closedAt: null,
            },
            select: {
              branchId: true,
              roundNumber: true,
              openedAt: true,
              calendarDate: true,
              cancelledAt: true,
            },
            orderBy: { openedAt: "desc" },
          });

    const activeShiftByBranch = new Map<
      string,
      { roundNumber: number; openedAt: string; calendarDate: string }
    >();
    for (const row of openShiftRows) {
      if (row.cancelledAt) continue;
      if (activeShiftByBranch.has(row.branchId)) continue;
      activeShiftByBranch.set(row.branchId, {
        roundNumber: row.roundNumber,
        openedAt: row.openedAt.toISOString(),
        calendarDate: row.calendarDate.toISOString().slice(0, 10),
      });
    }

    const closedShiftRows =
      liveBranchIds.length === 0
        ? []
        : await prisma.branchShift.findMany({
            where: {
              branchId: { in: liveBranchIds },
              closedAt: { not: null },
              cancelledAt: null,
            },
            select: {
              branchId: true,
              roundNumber: true,
              closedAt: true,
            },
            orderBy: { closedAt: "desc" },
          });

    const lastClosedShiftByBranch = new Map<
      string,
      { roundNumber: number; closedAt: string }
    >();
    for (const row of closedShiftRows) {
      if (lastClosedShiftByBranch.has(row.branchId)) continue;
      if (!row.closedAt) continue;
      lastClosedShiftByBranch.set(row.branchId, {
        roundNumber: row.roundNumber,
        closedAt: row.closedAt.toISOString(),
      });
    }

    const staffCount =
      liveBranchIds.length === 0
        ? 0
        : await prisma.staff.count({
            where: {
              branchId: { in: liveBranchIds },
              isActive: true,
            },
          });

    const plan = brand.plan as BrandPlan;
    const status = brand.status as BrandStatus;
    const subscriptionState = getBrandSubscriptionState({
      status,
      trialEndsAt: brand.trialEndsAt,
      nextDueAt: brand.nextDueAt,
    });
    const subscription = {
      status,
      statusLabel: BRAND_STATUS_LABELS[status] ?? status,
      effectiveStatus: subscriptionState.effectiveStatus,
      effectiveStatusLabel:
        BRAND_STATUS_LABELS[subscriptionState.effectiveStatus] ??
        subscriptionState.effectiveStatus,
      plan,
      planLabel: BRAND_PLAN_LABELS[plan] ?? plan,
      planPrice: BRAND_PLAN_PRICES[plan] ?? null,
      planHint: BRAND_PLAN_HINTS[plan] ?? null,
      maxBranches: brand.maxBranches,
      maxStaff: brand.maxStaff,
      branchCount: liveBranchIds.length,
      staffCount,
      stockEnabled: Boolean(brand.stockEnabled),
      kitchenEnabled: Boolean(brand.kitchenEnabled),
      bbqEnabled: Boolean(brand.bbqEnabled),
      skewerEnabled: Boolean(brand.skewerEnabled),
      trialEndsAt: brand.trialEndsAt?.toISOString() ?? null,
      nextDueAt: brand.nextDueAt?.toISOString() ?? null,
      expiresAt: subscriptionState.expiresAt?.toISOString() ?? null,
      nearExpiry: subscriptionState.nearExpiry,
      warningDays: subscriptionState.warningDays,
      daysLeft: subscriptionState.daysLeft,
      writeAllowed: subscriptionState.writeAllowed,
      writeBlockedReason: subscriptionState.writeBlockedReason,
    };

    const stockEnabled =
      Boolean(brand.stockEnabled) &&
      scopedBranches.some((b) => b.stockEnabled);

    const report =
      branchIds.length === 0
        ? {
            stats: { ...EMPTY_SALES_REPORT_STATS },
            byChannel: [],
            byPayment: [],
            byFulfillment: [],
            byBranch: [],
            wasteItems: [],
            cancelReasons: [],
          }
        : await buildSalesReport({
            branchIds,
            branchNames,
            from: rangeFrom,
            to: rangeTo,
          });

    const [stock, topSellers, days, hours, aging, pendingStockConvertCount] =
      await Promise.all([
        stockEnabled
          ? loadBrandSaleStockSnapshot(branchIds)
          : Promise.resolve({
              saleStockQty: 0,
              saleStockValue: 0,
              byBranch: new Map<
                string,
                { saleStockQty: number; saleStockValue: number }
              >(),
            }),
        loadShopTopSellers(branchIds, rangeFrom, rangeTo),
        loadShopDailySeries(branchIds, rangeFrom, rangeTo),
        loadShopHourlySeries(branchIds, rangeFrom, rangeTo),
        stockEnabled
          ? loadShopAgingAttention(branchIds)
          : Promise.resolve(null),
        stockEnabled && branchIds.length > 0
          ? prisma.stockCount.count({
              where: {
                branchId: { in: branchIds },
                status: "IN_PROGRESS",
                createdAt: { gte: pendingConvertNotiCreatedAtGte() },
              },
            })
          : Promise.resolve(0),
      ]);
    const weekdays = aggregateShopWeekdaySeries(days);

    const byBranch = report.byBranch.map((row) => {
      const stockRow = stock.byBranch.get(row.branchId);
      return {
        ...row,
        saleStockQty: stockRow?.saleStockQty ?? 0,
        saleStockValue:
          Math.round((stockRow?.saleStockValue ?? 0) * 100) / 100,
      };
    });

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
      subscription,
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        isOpen: b.isOpen,
        isHidden: b.isHidden,
        kind: b.kind,
        isTest: isTestBranch(b),
        activeShift: activeShiftByBranch.get(b.id) ?? null,
        lastClosedShift: lastClosedShiftByBranch.get(b.id) ?? null,
      })),
      hasTestBranch,
      includeTest,
      filterBranchId,
      operatingDay: dayState.operatingDay,
      period,
      from: rangeFrom,
      to: rangeTo,
      stats: report.stats,
      byBranch,
      byChannel: report.byChannel,
      byPayment: report.byPayment,
      byFulfillment: report.byFulfillment,
      orders: todayOrders,
      stockEnabled,
      saleStockQty: stock.saleStockQty,
      saleStockValue: stock.saleStockValue,
      topSellers,
      days,
      hours,
      weekdays,
      cancelReasons: report.cancelReasons,
      aging,
      wasteItems: report.wasteItems,
      pendingStockConvertCount,
      soleOperator: liveBranchIds.length === 1,
      soleBranchId: liveBranchIds.length === 1 ? liveBranchIds[0]! : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
