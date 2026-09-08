import { prisma } from "@/lib/db";
import { bangkokDateKey } from "@/lib/constants";
import { deriveInventoryAlerts } from "@/lib/inventory/inventory-alerts";
import {
  computeSafetyStock,
  computeSuggestedRefill,
  computeTomorrowTarget,
  computeSkewerBranchParTarget,
} from "@/lib/inventory/inventory-calculations";
import { INVENTORY_DEFAULTS } from "@/lib/inventory/inventory-config";
import { tomorrowBangkokDateKey } from "@/lib/inventory/inventory-date";
import { computeTomorrowForecast } from "@/lib/inventory/inventory-forecast";
import { formatReasonLabels } from "@/lib/inventory/inventory-reason-codes";
import { loadBranchSalesMetricsMap } from "@/lib/inventory/inventory-sales-metrics";
import { deriveInventoryStatus } from "@/lib/inventory/inventory-status";
import { mergeTomorrowPlanRounds } from "@/lib/inventory/inventory-tomorrow-plan-merge";
import {
  deriveParComparison,
  type ParComparisonKind,
} from "@/lib/inventory/inventory-tomorrow-plan-shared";
import {
  assignSalesGrades,
  STOCK_RECOMMEND_GRADE_LABELS,
  type StockRecommendGrade,
} from "@/lib/stock-recommendation-shared";
import {
  resolveMenuItemProductCode,
  isManualMenuItemCode,
} from "@/lib/inventory/inventory-menu-code";
import { resolveMenuAvailableStock } from "@/lib/inventory/inventory-stock-quantity";
import {
  getTomorrowPlanHeaderDb,
  getTomorrowPlanLineDb,
} from "@/lib/inventory/inventory-tomorrow-plan-prisma";
import { compareThaiText } from "@/lib/thai-sort";
import { BranchOperatingMode } from "@prisma/client";

/** Plan mode: refill up to saved Par (forecast is informational only). */
export const TOMORROW_PLAN_MODE = "TO_PAR" as const;
export type TomorrowPlanMode = typeof TOMORROW_PLAN_MODE;

export type TomorrowPlanRow = {
  menuItemId: string;
  productCode: string;
  hasManualItemCode: boolean;
  name: string;
  category: string | null;
  imageUrl: string | null;
  totalSold: number;
  sharePct: number;
  salesGrade: StockRecommendGrade;
  salesGradeLabel: string;
  todaySales: number;
  avg7: number;
  sameWeekdayAverage: number;
  sameWeekdaySampleSize: number;
  recentTrendPct: number;
  forecastQty: number;
  forecastSource: string;
  /** Forecast + safety (display only — not the refill target). */
  forecastTarget: number;
  safetyStock: number;
  /** Operational target = saved Par (0 if unset). */
  tomorrowTarget: number;
  availableStock: number;
  stockTracked: boolean;
  suggestedRefill: number;
  confirmedQty: number | null;
  confirmedAt: string | null;
  parStock: number;
  belowParQty: number;
  gapFromPar: number;
  parComparison: ParComparisonKind;
  parComparisonLabel: string;
  dataQuality: string;
  dataSource: string;
  status: ReturnType<typeof deriveInventoryStatus>;
  reasonCodes: string[];
  reasonLabels: string[];
  alerts: ReturnType<typeof deriveInventoryAlerts>;
};

export type TomorrowPlanResult = {
  planMode: TomorrowPlanMode;
  tomorrowDate: string;
  todayDate: string;
  safetyPct: number;
  branchName: string;
  computedAt: string;
  lastConfirmedAt: string | null;
  /** Confirmed rounds already saved for tomorrowDate. */
  existingRoundCount: number;
  /** Next round number if the user confirms again. */
  nextRoundNo: number;
  items: TomorrowPlanRow[];
  summary: {
    refillRequiredCount: number;
    totalSuggestedRefill: number;
    totalConfirmedQty: number;
    confirmedCount: number;
    outOfStockCount: number;
    belowParCount: number;
    noParCount: number;
    gradeA: number;
    gradeB: number;
    gradeC: number;
    totalAvgDailySales: number;
    sumCurrentPar: number;
    sumAvailableStock: number;
    branchParTarget: number | null;
  };
};

export async function loadBranchTomorrowPlan(
  branchId: string,
): Promise<TomorrowPlanResult> {
  const todayDate = bangkokDateKey();
  const tomorrowDate = tomorrowBangkokDateKey(todayDate);

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { name: true, operatingMode: true },
  });
  if (!branch) throw new Error("NOT_FOUND");

  const { metricsByMenuId, menuItems } =
    await loadBranchSalesMetricsMap(branchId);

  let confirmByMenuId = new Map<
    string,
    { confirmedQty: number; confirmedAt: Date }
  >();
  let existingRoundCount = 0;
  let nextRoundNo = 1;
  let lastConfirmedAt: string | null = null;
  try {
    const headerDb = getTomorrowPlanHeaderDb();
    const lineDb = getTomorrowPlanLineDb();
    if (headerDb && lineDb) {
      const headers = await headerDb.findMany({
        where: { branchId, planDate: tomorrowDate },
        select: {
          id: true,
          roundNo: true,
          status: true,
          confirmedAt: true,
        },
        orderBy: [{ roundNo: "asc" }, { confirmedAt: "asc" }],
      });
      existingRoundCount = headers.length;
      const maxRound = headers.reduce(
        (max, h) => Math.max(max, h.roundNo ?? 1),
        0,
      );
      nextRoundNo = maxRound + 1;

      const confirmedHeaders = headers.filter((h) => h.status === "CONFIRMED");
      if (confirmedHeaders.length > 0) {
        const lines = await lineDb.findMany({
          where: {
            branchId,
            planDate: tomorrowDate,
            planId: { in: confirmedHeaders.map((h) => h.id) },
          },
          select: {
            planId: true,
            menuItemId: true,
            confirmedQty: true,
            confirmedAt: true,
          },
        });
        const linesByPlan = new Map<string, typeof lines>();
        for (const line of lines) {
          if (!line.planId) continue;
          const list = linesByPlan.get(line.planId) ?? [];
          list.push(line);
          linesByPlan.set(line.planId, list);
        }
        const { effectiveLines } = mergeTomorrowPlanRounds(
          confirmedHeaders.map((h) => ({
            roundNo: h.roundNo ?? 1,
            status: h.status,
            confirmedAt: h.confirmedAt.toISOString(),
            lines: (linesByPlan.get(h.id) ?? []).map((line) => ({
              menuItemId: line.menuItemId,
              confirmedQty: line.confirmedQty,
              suggestedQty: 0,
              parStock: 0,
              availableStock: 0,
              confirmedAt: line.confirmedAt.toISOString(),
            })),
          })),
        );
        confirmByMenuId = new Map(
          effectiveLines.map((line) => [
            line.menuItemId,
            {
              confirmedQty: line.confirmedQty,
              confirmedAt: new Date(line.confirmedAt ?? Date.now()),
            },
          ]),
        );
        lastConfirmedAt = confirmedHeaders
          .reduce(
            (latest, row) =>
              row.confirmedAt > latest ? row.confirmedAt : latest,
            confirmedHeaders[0]!.confirmedAt,
          )
          .toISOString();
      }
    } else if (lineDb) {
      const confirmRecords = await lineDb.findMany({
        where: { branchId, planDate: tomorrowDate },
        select: {
          menuItemId: true,
          confirmedQty: true,
          confirmedAt: true,
        },
      });
      confirmByMenuId = new Map(
        confirmRecords.map((c) => [c.menuItemId, c]),
      );
      if (confirmRecords.length > 0) {
        existingRoundCount = 1;
        nextRoundNo = 2;
        lastConfirmedAt = confirmRecords
          .reduce(
            (latest, row) =>
              row.confirmedAt > latest ? row.confirmedAt : latest,
            confirmRecords[0]!.confirmedAt,
          )
          .toISOString();
      }
    }
  } catch (error) {
    console.error("[tomorrow-plan] load confirms", error);
  }

  const parRecords = await prisma.branchMenuItemParStock.findMany({
    where: { branchId },
    select: {
      menuItemId: true,
      parStock: true,
      safetyPct: true,
    },
  });
  const parByMenuId = new Map(parRecords.map((p) => [p.menuItemId, p]));

  const soldRows = menuItems.map((menu) => {
    const metrics = metricsByMenuId.get(menu.id)!;
    return {
      menuItemId: menu.id,
      totalSold: metrics.orderSoldTotal + metrics.skewerSoldTotal,
    };
  });
  const grades = assignSalesGrades(soldRows);
  const grandTotal = soldRows.reduce((sum, row) => sum + row.totalSold, 0);

  const items: TomorrowPlanRow[] = menuItems.map((menu) => {
    const metrics = metricsByMenuId.get(menu.id)!;
    const totalSold = metrics.orderSoldTotal + metrics.skewerSoldTotal;
    const salesGrade = grades.get(menu.id) ?? "SKIP";
    const sharePct =
      grandTotal > 0 ? Math.round((totalSold / grandTotal) * 1000) / 10 : 0;
    const par = parByMenuId.get(menu.id);
    const parStock = par?.parStock ?? 0;
    const safetyPct = par?.safetyPct ?? INVENTORY_DEFAULTS.safetyPct;
    const { availableStock, stockTracked } = resolveMenuAvailableStock(menu.stock);

    const forecast = computeTomorrowForecast({
      tomorrowDateKey: tomorrowDate,
      sameWeekdayAverage: metrics.sameWeekdayAverage,
      sameWeekdaySampleSize: metrics.sameWeekdaySampleSize,
      avg7: metrics.avg7,
      avg14: metrics.avg14,
      avg30: metrics.avg30,
      recentTrendPct: metrics.recentTrendPct,
      parStock,
      dataQuality: metrics.dataQuality,
      includesPartialStockTracking:
        metrics.includesSkewer && metrics.skewerSoldTotal > 0,
    });

    const safetyStock = computeSafetyStock(forecast.forecastQty, safetyPct);
    const forecastTarget = computeTomorrowTarget(
      forecast.forecastQty,
      safetyPct,
    );
    // Mode A: operational target is saved Par; refill = max(0, Par − stock).
    const tomorrowTarget = parStock > 0 ? parStock : 0;
    const suggestedRefill = computeSuggestedRefill(
      tomorrowTarget,
      availableStock,
    );

    const parCompare = deriveParComparison(availableStock, parStock);

    const status = deriveInventoryStatus({
      availableStock,
      parStock,
      suggestedRefill,
      tomorrowTarget,
      dataQuality: metrics.dataQuality,
    });

    const alerts = deriveInventoryAlerts({
      availableStock,
      parStock,
      tomorrowTarget,
      suggestedRefill,
      recentTrendPct: metrics.recentTrendPct,
      reasonCodes: forecast.reasonCodes,
    });

    return {
      menuItemId: menu.id,
      productCode: resolveMenuItemProductCode({
        id: menu.id,
        itemCode: menu.itemCode,
      }),
      hasManualItemCode: isManualMenuItemCode({ itemCode: menu.itemCode }),
      name: menu.name,
      category: menu.category?.name ?? null,
      imageUrl: menu.imageUrl ?? null,
      totalSold,
      sharePct,
      salesGrade,
      salesGradeLabel: STOCK_RECOMMEND_GRADE_LABELS[salesGrade],
      todaySales: metrics.todaySales,
      avg7: metrics.avg7,
      sameWeekdayAverage: metrics.sameWeekdayAverage,
      sameWeekdaySampleSize: metrics.sameWeekdaySampleSize,
      recentTrendPct: metrics.recentTrendPct,
      forecastQty: forecast.forecastQty,
      forecastSource: forecast.forecastSource,
      forecastTarget,
      safetyStock,
      tomorrowTarget,
      availableStock,
      stockTracked,
      suggestedRefill,
      confirmedQty: confirmByMenuId.get(menu.id)?.confirmedQty ?? null,
      confirmedAt:
        confirmByMenuId.get(menu.id)?.confirmedAt.toISOString() ?? null,
      parStock,
      belowParQty: parCompare.belowParQty,
      gapFromPar: parCompare.gapFromPar,
      parComparison: parCompare.kind,
      parComparisonLabel: parCompare.label,
      dataQuality: metrics.dataQuality,
      dataSource: metrics.dataSource,
      status,
      reasonCodes: forecast.reasonCodes,
      reasonLabels: formatReasonLabels(forecast.reasonCodes),
      alerts,
    };
  });

  items.sort(
    (a, b) =>
      compareThaiText(a.productCode, b.productCode) ||
      compareThaiText(a.name, b.name),
  );

  const totalAvgDailySales = items.reduce((s, i) => s + i.avg7, 0);
  const sumCurrentPar = items.reduce((s, i) => s + i.parStock, 0);
  const sumAvailableStock = items.reduce((s, i) => s + i.availableStock, 0);
  const branchParTarget =
    branch.operatingMode === BranchOperatingMode.SKEWER
      ? computeSkewerBranchParTarget(totalAvgDailySales)
      : null;

  return {
    planMode: TOMORROW_PLAN_MODE,
    tomorrowDate,
    todayDate,
    safetyPct: INVENTORY_DEFAULTS.safetyPct,
    branchName: branch.name,
    computedAt: new Date().toISOString(),
    lastConfirmedAt,
    existingRoundCount,
    nextRoundNo,
    items,
    summary: {
      refillRequiredCount: items.filter((i) => i.suggestedRefill > 0).length,
      totalSuggestedRefill: items.reduce((s, i) => s + i.suggestedRefill, 0),
      totalConfirmedQty: items.reduce((s, i) => s + (i.confirmedQty ?? 0), 0),
      confirmedCount: items.filter((i) => i.confirmedQty != null).length,
      outOfStockCount: items.filter((i) => i.availableStock <= 0).length,
      belowParCount: items.filter((i) => i.parComparison === "BELOW_PAR").length,
      noParCount: items.filter((i) => i.parComparison === "NO_PAR").length,
      gradeA: items.filter((i) => i.salesGrade === "A").length,
      gradeB: items.filter((i) => i.salesGrade === "B").length,
      gradeC: items.filter((i) => i.salesGrade === "C").length,
      totalAvgDailySales: Math.round(totalAvgDailySales * 100) / 100,
      sumCurrentPar,
      sumAvailableStock,
      branchParTarget,
    },
  };
}

export async function saveConfirmedTomorrowPlan(input: {
  branchId: string;
  adminId?: string;
  items: Array<{ menuItemId: string; confirmedQty: number }>;
}): Promise<{
  saved: number;
  planDate: string;
  planId: string;
  roundNo: number;
}> {
  if (input.items.length === 0) {
    throw new Error("EMPTY");
  }
  for (const item of input.items) {
    if (!Number.isInteger(item.confirmedQty) || item.confirmedQty < 0) {
      throw new Error("INVALID_QTY");
    }
  }

  const plan = await loadBranchTomorrowPlan(input.branchId);
  const byId = new Map(plan.items.map((row) => [row.menuItemId, row]));
  const missing = input.items.filter((item) => !byId.has(item.menuItemId));
  if (missing.length > 0) {
    throw new Error("MENU_NOT_FOUND");
  }

  const lineDb = getTomorrowPlanLineDb();
  const headerDb = getTomorrowPlanHeaderDb();
  if (!lineDb?.createMany || !headerDb?.create) {
    throw new Error("SCHEMA_NOT_READY");
  }

  const existing = await headerDb.findMany({
    where: { branchId: input.branchId, planDate: plan.tomorrowDate },
    select: { roundNo: true },
  });
  const roundNo =
    existing.reduce((max, row) => Math.max(max, row.roundNo ?? 1), 0) + 1;

  const header = await headerDb.create({
    data: {
      branchId: input.branchId,
      planDate: plan.tomorrowDate,
      roundNo,
      status: "CONFIRMED",
      confirmedByAdminId: input.adminId ?? null,
    },
  });

  await lineDb.createMany({
    data: input.items.map((item) => {
      const row = byId.get(item.menuItemId)!;
      return {
        planId: header.id,
        branchId: input.branchId,
        menuItemId: item.menuItemId,
        planDate: plan.tomorrowDate,
        confirmedQty: item.confirmedQty,
        suggestedQty: row.suggestedRefill,
        parStock: row.parStock,
        availableStock: row.availableStock,
        confirmedByAdminId: input.adminId ?? null,
      };
    }),
  });

  return {
    saved: input.items.length,
    planDate: plan.tomorrowDate,
    planId: header.id,
    roundNo,
  };
}
