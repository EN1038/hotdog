import type { InventoryDataQuality } from "@/lib/inventory/inventory-data-quality";
import { INVENTORY_DATA_QUALITY_LABELS } from "@/lib/inventory/inventory-data-quality";
import type { InventorySalesDataSource } from "@/lib/inventory/inventory-sales-source";
import type { InventoryStatus } from "@/lib/inventory/inventory-status";
import type { ParComparisonKind } from "@/lib/inventory/inventory-tomorrow-plan-shared";
import type { StockRecommendGrade } from "@/lib/stock-recommendation-shared";

export type ParStockApiRow = {
  menuItemId: string;
  productCode: string;
  hasManualItemCode: boolean;
  name: string;
  category: string | null;
  imageUrl: string | null;
  currentParStock: number;
  recommendedParStock: number;
  parDiff: number;
  availableStock: number;
  stockTracked: boolean;
  source: string;
  coverageDays: number;
  safetyPct: number;
  avgDailySales: number;
  minDailySales: number;
  maxDailySales: number;
  salesGrade: StockRecommendGrade;
  salesGradeLabel: string;
  parEligible: boolean;
  totalSold: number;
  wasteQty: number;
  suggestedRefill: number;
  dataQuality: InventoryDataQuality;
  dataSource: InventorySalesDataSource;
  analysisFrom: string;
  analysisTo: string;
  updatedAt: string | null;
  /** Last time this SKU's Par value was saved (not analysis snapshot). */
  parUpdatedAt: string | null;
};

export type ParStockApiResult = {
  items: ParStockApiRow[];
  summary?: {
    operatingMode: string;
    totalAvgDailySales: number;
    sumCurrentPar: number;
    sumRecommendedPar: number;
    sumAvailableStock: number;
    branchParTarget: number | null;
    gradeA?: number;
    gradeB?: number;
    gradeC?: number;
    eligibleRecommendedPar?: number;
    eligibleCurrentPar?: number;
    ineligibleCurrentPar?: number;
  };
  analysisFrom: string;
  analysisTo: string;
  coverageDays: number;
  safetyPct: number;
  branchName?: string;
  lastParUpdatedAt?: string | null;
};

export type TomorrowPlanApiRow = {
  menuItemId: string;
  productCode: string;
  hasManualItemCode: boolean;
  name: string;
  category: string | null;
  imageUrl?: string | null;
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
  forecastTarget?: number;
  safetyStock: number;
  tomorrowTarget: number;
  availableStock: number;
  stockTracked: boolean;
  suggestedRefill: number;
  confirmedQty?: number | null;
  confirmedAt?: string | null;
  parStock: number;
  belowParQty: number;
  gapFromPar: number;
  parComparison: ParComparisonKind;
  parComparisonLabel: string;
  dataQuality: InventoryDataQuality;
  dataSource: InventorySalesDataSource;
  status: InventoryStatus;
  reasonLabels: string[];
};

export type TomorrowPlanApiResult = {
  planMode?: "TO_PAR";
  tomorrowDate: string;
  todayDate: string;
  safetyPct: number;
  branchName: string;
  computedAt?: string;
  lastConfirmedAt?: string | null;
  items: TomorrowPlanApiRow[];
  summary: {
    refillRequiredCount: number;
    totalSuggestedRefill: number;
    totalConfirmedQty?: number;
    confirmedCount?: number;
    outOfStockCount: number;
    belowParCount: number;
    noParCount?: number;
    gradeA: number;
    gradeB: number;
    gradeC: number;
    totalAvgDailySales?: number;
    sumCurrentPar?: number;
    sumAvailableStock?: number;
    branchParTarget?: number | null;
  };
};

export const DATA_QUALITY_TONE: Record<InventoryDataQuality, string> = {
  GOOD: "bg-emerald-50 text-emerald-800 border-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-800 border-amber-200",
  INSUFFICIENT: "bg-gray-100 text-gray-600 border-gray-200",
};

export function dataQualityLabel(q: InventoryDataQuality): string {
  return INVENTORY_DATA_QUALITY_LABELS[q];
}
