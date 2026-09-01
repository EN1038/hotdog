import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  bangkokDateKey,
  isBangkokDateKey,
} from "@/lib/constants";
import { isTestBranch } from "@/lib/branch-test";
import { getCalendarDayState } from "@/lib/operating-day";
import { loadShopDailySeries } from "@/lib/shop-overview-metrics";
import { addBangkokDays } from "@/lib/inventory/inventory-date";
import {
  MONTH_PATTERN_DEFAULT_PERIOD_DAYS,
  MONTH_PATTERN_PERIOD_OPTIONS,
  type MonthPatternPeriodDays,
} from "@/lib/sales-month-pattern-config";
import {
  buildMonthBucketInsights,
  mergeProductDailySales,
} from "@/lib/sales-month-pattern";
import { loadBranchProductDailySalesForMonthPattern } from "@/lib/sales-month-pattern-loader";

function resolvePeriodDays(raw: string | null): MonthPatternPeriodDays {
  const n = Number(raw);
  if (
    MONTH_PATTERN_PERIOD_OPTIONS.includes(n as MonthPatternPeriodDays)
  ) {
    return n as MonthPatternPeriodDays;
  }
  return MONTH_PATTERN_DEFAULT_PERIOD_DAYS;
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
    const brandIdParam = searchParams.get("brandId")?.trim();
    const brandId =
      brandIdParam && brandIds.includes(brandIdParam)
        ? brandIdParam
        : brandIds[0]!;

    const dayState = getCalendarDayState();
    const today = dayState.operatingDay || bangkokDateKey();
    const periodDays = resolvePeriodDays(searchParams.get("periodDays"));

    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    let rangeTo = toParam && isBangkokDateKey(toParam) ? toParam : today;
    if (rangeTo > today) rangeTo = today;

    let rangeFrom =
      fromParam && isBangkokDateKey(fromParam)
        ? fromParam
        : addBangkokDays(rangeTo, -(periodDays - 1));
    if (rangeFrom > rangeTo) {
      const tmp = rangeFrom;
      rangeFrom = rangeTo;
      rangeTo = tmp;
    }

    const branchIdParam = searchParams.get("branchId")?.trim() || null;

    const branches = await prisma.branch.findMany({
      where: { brandId },
      select: {
        id: true,
        name: true,
        code: true,
        isOpen: true,
        isTest: true,
        isHidden: true,
        kind: true,
        operatingMode: true,
      },
      orderBy: { name: "asc" },
    });

    const scopedBranches = branches
      .filter((b) => !b.isTest)
      .filter((b) => b.kind !== "WAREHOUSE" && !b.isHidden);

    const selected =
      branchIdParam != null
        ? scopedBranches.find((b) => b.id === branchIdParam) ?? null
        : null;

    if (branchIdParam && !selected) {
      return jsonError("ไม่พบสาขาที่เลือก", 404);
    }

    const reportBranches = selected ? [selected] : scopedBranches;
    const branchIds = reportBranches.map((b) => b.id);

    const days = await loadShopDailySeries(branchIds, rangeFrom, rangeTo);

    let productRows: ReturnType<typeof mergeProductDailySales> = [];
    let productInsightsAvailable = false;
    let productInsightHint: string | null = null;

    if (selected) {
      const loaded = await loadBranchProductDailySalesForMonthPattern({
        branchId: selected.id,
        from: rangeFrom,
        to: rangeTo,
        operatingMode: selected.operatingMode,
      });
      productRows = mergeProductDailySales({
        menuItems: loaded.menuItems,
        orderByMenuDate: loaded.dailyMaps.orderByMenuDate,
        skewerByMenuDate: loaded.dailyMaps.skewerByMenuDate,
        revenueByMenuDate: loaded.revenueByMenuDate,
        dates: loaded.dates,
      });
      productInsightsAvailable = true;
      if (loaded.dailyMaps.includesSkewer) {
        productInsightHint =
          "รวมยอดไม้จาก skewer ในปริมาณ แต่ revenue มาจาก POS order เท่านั้น";
      }
    } else if (scopedBranches.length > 1) {
      productInsightHint =
        "เลือกสาขาเพื่อดูสินค้าขายดี/ขายช้าในแต่ละช่วงของเดือน";
    } else if (scopedBranches.length === 1) {
      const only = scopedBranches[0]!;
      const loaded = await loadBranchProductDailySalesForMonthPattern({
        branchId: only.id,
        from: rangeFrom,
        to: rangeTo,
        operatingMode: only.operatingMode,
      });
      productRows = mergeProductDailySales({
        menuItems: loaded.menuItems,
        orderByMenuDate: loaded.dailyMaps.orderByMenuDate,
        skewerByMenuDate: loaded.dailyMaps.skewerByMenuDate,
        revenueByMenuDate: loaded.revenueByMenuDate,
        dates: loaded.dates,
      });
      productInsightsAvailable = true;
    }

    const pattern = buildMonthBucketInsights(days, productRows);

    return jsonOk({
      from: rangeFrom,
      to: rangeTo,
      periodDays,
      filterBranchId: selected?.id ?? (scopedBranches.length === 1 ? scopedBranches[0]!.id : null),
      branches: scopedBranches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        isOpen: b.isOpen,
        isHidden: b.isHidden,
        kind: b.kind,
        isTest: isTestBranch(b),
      })),
      productInsightsAvailable,
      productInsightHint,
      ...pattern,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
