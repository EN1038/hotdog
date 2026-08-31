import { isBangkokDateKey } from "@/lib/constants";

export type StockRecommendGrade = "A" | "B" | "C" | "SKIP";

export type StockRecommendStatusKind =
  | "out_of_stock"
  | "should_refill"
  | "sufficient"
  | "overstock";

export type StockRecommendStatusSeverity = "danger" | "warning" | "success";

export type StockRecommendStatus = {
  kind: StockRecommendStatusKind;
  label: string;
  severity: StockRecommendStatusSeverity;
  overstockQty: number;
  overstockHint: string | null;
};

export type StockRecommendationRow = {
  menuItemId: string;
  productCode: string;
  name: string;
  category: string | null;
  imageUrl: string | null;
  totalSold: number;
  orderSold: number;
  skewerSold: number;
  avgDaily: number;
  currentStock: number;
  recommendedStock: number;
  /** @deprecated use suggestedRefill — kept for API compat */
  stockInQty: number;
  suggestedRefill: number;
  overstockQty: number;
  status: StockRecommendStatus;
  grade: StockRecommendGrade;
  sharePct: number;
  defaultShelfLifeDays: number | null;
  coverDays: number;
};

export type StockRecommendationKpis = {
  analyzedCount: number;
  shouldRefillCount: number;
  totalSuggestedRefill: number;
  overstockCount: number;
};

export type StockRecommendationSummary = {
  from: string;
  to: string;
  rangeDays: number;
  activeDays: number;
  coverDays: number;
  safetyFactor: number;
  totalSoldUnits: number;
  menuCount: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeSkip: number;
  includesSkewerSales: boolean;
};

export type StockRecommendationResult = {
  summary: StockRecommendationSummary;
  items: StockRecommendationRow[];
};

export const STOCK_RECOMMEND_DEFAULTS = {
  coverDays: 5,
  safetyFactor: 1.2,
  minSoldForB: 3,
  paretoShare: 0.8,
  overstockRatio: 1.25,
} as const;

export const STOCK_RECOMMEND_GRADE_LABELS: Record<StockRecommendGrade, string> = {
  A: "A ขายดี",
  B: "B ขายปานกลาง",
  C: "C ขายช้า",
  SKIP: "ไม่ขาย",
};

export function formatStockRecommendSafetyPct(safetyFactor: number): number {
  return Math.round(Math.max(0, safetyFactor - 1) * 100);
}

/** recommendedStock = ceil(avgDaily × coverDays × safetyFactor), min 1 when has sales */
export function computeRecommendedStock(
  avgDaily: number,
  coverDays: number,
  safetyFactor: number,
  hasSales: boolean,
): number {
  if (!hasSales || avgDaily <= 0) return 0;
  const raw = Math.ceil(avgDaily * coverDays * safetyFactor);
  return Math.max(raw, 1);
}

/** suggestedRefill = max(recommended − current, 0); never negative */
export function computeSuggestedRefill(
  recommendedStock: number,
  currentStock: number,
): number {
  if (recommendedStock <= 0) return 0;
  if (currentStock >= recommendedStock) return 0;
  return recommendedStock - currentStock;
}

export function computeOverstockQty(
  recommendedStock: number,
  currentStock: number,
): number {
  if (recommendedStock <= 0 || currentStock <= recommendedStock) return 0;
  return currentStock - recommendedStock;
}

export function deriveStockRecommendStatus(input: {
  currentStock: number;
  recommendedStock: number;
  suggestedRefill: number;
  overstockRatio?: number;
}): StockRecommendStatus {
  const ratio = input.overstockRatio ?? STOCK_RECOMMEND_DEFAULTS.overstockRatio;
  const overstockQty = computeOverstockQty(
    input.recommendedStock,
    input.currentStock,
  );

  if (input.currentStock <= 0 && input.recommendedStock > 0) {
    return {
      kind: "out_of_stock",
      label: "ของไม่พอ",
      severity: "danger",
      overstockQty: 0,
      overstockHint: null,
    };
  }

  if (
    input.recommendedStock > 0 &&
    input.currentStock > input.recommendedStock * ratio
  ) {
    return {
      kind: "overstock",
      label: "สต๊อกเกิน",
      severity: "warning",
      overstockQty,
      overstockHint:
        overstockQty > 0 ? `เกินแนะนำ ${overstockQty} ชิ้น` : null,
    };
  }

  if (input.suggestedRefill > 0) {
    return {
      kind: "should_refill",
      label: "ควรเติม",
      severity: "warning",
      overstockQty: 0,
      overstockHint: null,
    };
  }

  return {
    kind: "sufficient",
    label: "เพียงพอ",
    severity: "success",
    overstockQty: 0,
    overstockHint: null,
  };
}

export function computeStockRecommendationKpis(
  items: Pick<
    StockRecommendationRow,
    "suggestedRefill" | "status"
  >[],
): StockRecommendationKpis {
  return {
    analyzedCount: items.length,
    shouldRefillCount: items.filter((row) => row.suggestedRefill > 0).length,
    totalSuggestedRefill: items.reduce(
      (sum, row) => sum + row.suggestedRefill,
      0,
    ),
    overstockCount: items.filter((row) => row.status.kind === "overstock")
      .length,
  };
}

function addDaysYmd(dateYmd: string, delta: number): string {
  const start = new Date(`${dateYmd}T12:00:00+07:00`);
  start.setTime(start.getTime() + delta * 24 * 60 * 60 * 1000);
  return start.toISOString().slice(0, 10);
}

function resolveCoverDays(
  defaultShelfLifeDays: number | null | undefined,
  requestedCoverDays: number,
): number {
  const base = Math.max(1, Math.min(30, Math.floor(requestedCoverDays)));
  if (
    defaultShelfLifeDays != null &&
    Number.isFinite(defaultShelfLifeDays) &&
    defaultShelfLifeDays > 0
  ) {
    return Math.max(1, Math.min(base, Math.floor(defaultShelfLifeDays) - 1));
  }
  return base;
}

export function assignSalesGrades(
  soldRows: Array<{ menuItemId: string; totalSold: number }>,
  minSoldForB: number = STOCK_RECOMMEND_DEFAULTS.minSoldForB,
  paretoShare: number = STOCK_RECOMMEND_DEFAULTS.paretoShare,
): Map<string, StockRecommendGrade> {
  const grades = new Map<string, StockRecommendGrade>();
  const totalUnits = soldRows.reduce((sum, row) => sum + row.totalSold, 0);
  if (totalUnits <= 0) {
    for (const row of soldRows) {
      grades.set(row.menuItemId, row.totalSold > 0 ? "C" : "SKIP");
    }
    return grades;
  }

  const sorted = [...soldRows].sort((a, b) => b.totalSold - a.totalSold);
  let cumulative = 0;
  const aIds = new Set<string>();

  for (const row of sorted) {
    if (row.totalSold <= 0) continue;
    cumulative += row.totalSold;
    aIds.add(row.menuItemId);
    if (cumulative / totalUnits >= paretoShare) break;
  }

  for (const row of soldRows) {
    if (row.totalSold <= 0) {
      grades.set(row.menuItemId, "SKIP");
    } else if (aIds.has(row.menuItemId)) {
      grades.set(row.menuItemId, "A");
    } else if (row.totalSold >= minSoldForB) {
      grades.set(row.menuItemId, "B");
    } else {
      grades.set(row.menuItemId, "C");
    }
  }

  return grades;
}

function assignGrades(
  soldRows: Array<{ menuItemId: string; totalSold: number }>,
  minSoldForB: number,
  paretoShare: number,
): Map<string, StockRecommendGrade> {
  return assignSalesGrades(soldRows, minSoldForB, paretoShare);
}

export function buildStockRecommendationRows(input: {
  menuItems: Array<{
    id: string;
    name: string;
    productCode: string;
    category: string | null;
    imageUrl: string | null;
    defaultShelfLifeDays: number | null;
    currentStock: number;
    orderSold: number;
    skewerSold: number;
  }>;
  activeDays: number;
  coverDays: number;
  safetyFactor: number;
  minSoldForB: number;
  paretoShare: number;
}): StockRecommendationRow[] {
  const effectiveDays = Math.max(input.activeDays, 1);
  const soldRows = input.menuItems.map((item) => ({
    menuItemId: item.id,
    totalSold: item.orderSold + item.skewerSold,
  }));
  const grades = assignGrades(
    soldRows,
    input.minSoldForB,
    input.paretoShare,
  );
  const grandTotal = soldRows.reduce((sum, row) => sum + row.totalSold, 0);

  return input.menuItems
    .map((item) => {
      const totalSold = item.orderSold + item.skewerSold;
      const avgDaily = totalSold / effectiveDays;
      const itemCoverDays = resolveCoverDays(
        item.defaultShelfLifeDays,
        input.coverDays,
      );
      const recommendedStock = computeRecommendedStock(
        avgDaily,
        itemCoverDays,
        input.safetyFactor,
        totalSold > 0,
      );
      const suggestedRefill = computeSuggestedRefill(
        recommendedStock,
        item.currentStock,
      );
      const overstockQty = computeOverstockQty(
        recommendedStock,
        item.currentStock,
      );
      const status = deriveStockRecommendStatus({
        currentStock: item.currentStock,
        recommendedStock,
        suggestedRefill,
      });
      const grade = grades.get(item.id) ?? "SKIP";
      const sharePct =
        grandTotal > 0
          ? Math.round((totalSold / grandTotal) * 1000) / 10
          : 0;

      return {
        menuItemId: item.id,
        productCode: item.productCode,
        name: item.name,
        category: item.category,
        imageUrl: item.imageUrl,
        totalSold,
        orderSold: item.orderSold,
        skewerSold: item.skewerSold,
        avgDaily: Math.round(avgDaily * 100) / 100,
        currentStock: item.currentStock,
        recommendedStock,
        stockInQty: suggestedRefill,
        suggestedRefill,
        overstockQty,
        status,
        grade,
        sharePct,
        defaultShelfLifeDays: item.defaultShelfLifeDays,
        coverDays: itemCoverDays,
      };
    })
    .sort((a, b) => b.totalSold - a.totalSold || a.name.localeCompare(b.name, "th"));
}

export function parseStockRecommendRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  fallbackTo: string,
): { from: string; to: string } | null {
  const to = toRaw?.trim() || fallbackTo;
  const from =
    fromRaw?.trim() ||
    addDaysYmd(to, -29);
  if (!isBangkokDateKey(from) || !isBangkokDateKey(to)) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

export function exportStockRecommendationsCsv(
  branchName: string,
  result: StockRecommendationResult,
): string {
  const header = [
    "สาขา",
    "วิเคราะห์ตั้งแต่",
    "ถึงวันที่",
    "ชื่อเมนู",
    "หมวด",
    "กลุ่ม",
    "ขายได้",
    "ขายออเดอร์",
    "ขายเสียบไม้",
    "สัดส่วน%",
    "เฉลี่ย/วัน",
    "คงเหลือ",
    "ควรมี",
    "ควรเติม",
    "สถานะ",
    "เตรียมขาย(วัน)",
  ];

  const lines = result.items.map((row) =>
    [
      branchName,
      result.summary.from,
      result.summary.to,
      row.name,
      row.category ?? "",
      STOCK_RECOMMEND_GRADE_LABELS[row.grade],
      row.totalSold,
      row.orderSold,
      row.skewerSold,
      row.sharePct,
      row.avgDaily,
      row.currentStock,
      row.recommendedStock,
      row.suggestedRefill,
      row.status.label,
      row.coverDays,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );

  return `\uFEFF${[header.join(","), ...lines].join("\n")}`;
}
