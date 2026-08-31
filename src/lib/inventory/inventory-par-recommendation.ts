import { BranchOperatingMode } from "@prisma/client";
import {
  avgDailyForPar,
  computeSkewerBranchParTarget,
  scaleParValuesToTarget,
} from "@/lib/inventory/inventory-calculations";
import {
  DEFAULT_SKEWER_PAR_POLICY,
  isParEligibleGrade,
  type SkewerParPolicy,
} from "@/lib/inventory/inventory-par-policy";
import type { MenuItemSalesMetrics } from "@/lib/inventory/inventory-sales-metrics";
import {
  assignSalesGrades,
  type StockRecommendGrade,
} from "@/lib/stock-recommendation-shared";

export type ParRecommendationInput = {
  menuItemId: string;
  metrics: MenuItemSalesMetrics;
  totalSold?: number;
  salesGrade?: StockRecommendGrade;
};

function buildSkewerParRecommendations(
  items: ParRecommendationInput[],
  policy: SkewerParPolicy = DEFAULT_SKEWER_PAR_POLICY,
): Map<string, number> {
  const soldRows = items.map((item) => ({
    menuItemId: item.menuItemId,
    totalSold:
      item.totalSold ??
      item.metrics.orderSoldTotal + item.metrics.skewerSoldTotal,
  }));
  const grades =
    items[0]?.salesGrade != null
      ? new Map(items.map((item) => [item.menuItemId, item.salesGrade!]))
      : assignSalesGrades(soldRows);

  const avgs = items.map(({ metrics }) => avgDailyForPar(metrics));
  const totalAvgAll = avgs.reduce((s, a) => s + a, 0);
  const branchTarget = computeSkewerBranchParTarget(totalAvgAll, {
    min: policy.branchParMin,
    max: policy.branchParMax,
    factor: policy.branchParFactor,
    maxDaysOnHand: policy.maxDaysOnHand,
  });

  const raw = items.map((item, i) => {
    const grade = grades.get(item.menuItemId) ?? "SKIP";
    if (!isParEligibleGrade(grade, policy)) return 0;
    const max =
      grade === "A" || grade === "B" || grade === "C"
        ? Math.round(policy.gradeMax[grade] * policy.itemParFactor)
        : 0;
    const avg = avgs[i] ?? 0;
    if (max <= 0 || avg <= 0) return 0;
    const holdQty = Math.max(1, Math.ceil(avg * policy.itemParFactor));
    const dayCap = Math.max(1, Math.floor(avg * policy.maxDaysOnHand));
    return Math.min(holdQty, max, dayCap);
  });

  const scaled = scaleParValuesToTarget(raw, branchTarget);

  return new Map(items.map((item, i) => [item.menuItemId, scaled[i] ?? 0]));
}

export function buildParStockRecommendations(input: {
  operatingMode: BranchOperatingMode;
  items: ParRecommendationInput[];
  coverageDays?: number;
  safetyPct?: number;
  skewerPolicy?: SkewerParPolicy;
}): Map<string, number> {
  // Hold N days of sales for eligible grades (default 1 day).
  return buildSkewerParRecommendations(
    input.items,
    input.skewerPolicy ?? DEFAULT_SKEWER_PAR_POLICY,
  );
}

export function resolveParSalesGrades(
  items: ParRecommendationInput[],
): Map<string, StockRecommendGrade> {
  return assignSalesGrades(
    items.map((item) => ({
      menuItemId: item.menuItemId,
      totalSold:
        item.totalSold ??
        item.metrics.orderSoldTotal + item.metrics.skewerSoldTotal,
    })),
  );
}

export type ParStockBranchSummary = {
  operatingMode: BranchOperatingMode;
  totalAvgDailySales: number;
  sumCurrentPar: number;
  sumRecommendedPar: number;
  sumAvailableStock: number;
  /** Set for skewer branches — target total par (~300–500) */
  branchParTarget: number | null;
  gradeA?: number;
  gradeB?: number;
  gradeC?: number;
  eligibleRecommendedPar?: number;
  eligibleCurrentPar?: number;
  ineligibleCurrentPar?: number;
};

export function buildParStockBranchSummary(input: {
  operatingMode: BranchOperatingMode;
  totalAvgDailySales: number;
  sumCurrentPar: number;
  sumRecommendedPar: number;
  sumAvailableStock: number;
  skewerPolicy?: SkewerParPolicy;
  gradeCounts?: { A: number; B: number; C: number };
  eligibleRecommendedPar?: number;
  eligibleCurrentPar?: number;
  ineligibleCurrentPar?: number;
}): ParStockBranchSummary {
  const policy = input.skewerPolicy ?? DEFAULT_SKEWER_PAR_POLICY;
  return {
    operatingMode: input.operatingMode,
    totalAvgDailySales: Math.round(input.totalAvgDailySales * 100) / 100,
    sumCurrentPar: input.sumCurrentPar,
    sumRecommendedPar: input.sumRecommendedPar,
    sumAvailableStock: input.sumAvailableStock,
    branchParTarget: computeSkewerBranchParTarget(input.totalAvgDailySales, {
      min: policy.branchParMin,
      max: policy.branchParMax,
      factor: policy.branchParFactor,
      maxDaysOnHand: policy.maxDaysOnHand,
    }),
    gradeA: input.gradeCounts?.A,
    gradeB: input.gradeCounts?.B,
    gradeC: input.gradeCounts?.C,
    eligibleRecommendedPar: input.eligibleRecommendedPar,
    eligibleCurrentPar: input.eligibleCurrentPar,
    ineligibleCurrentPar: input.ineligibleCurrentPar,
  };
}
