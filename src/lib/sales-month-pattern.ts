import type { ShopDailyPoint } from "@/lib/shop-overview-metrics";
import {
  assignSalesGrades,
  type StockRecommendGrade,
} from "@/lib/stock-recommendation-shared";
import {
  DAY_OF_MONTH_BUCKETS,
  MONTH_PATTERN_CLASSIFICATION,
  MONTH_PATTERN_CLASSIFICATION_UI,
  MONTH_PATTERN_MIN_SAMPLE,
  MONTH_PATTERN_PRODUCT_TOP_N,
  type DayOfMonthBucketId,
} from "@/lib/sales-month-pattern-config";

export type MonthBucketClassification = "hot" | "normal" | "cool" | "insufficient";

export type ProductComparisonStatus =
  | "up"
  | "down"
  | "new"
  | "no_sales"
  | "na";

export type MonthBucketInsight = {
  id: DayOfMonthBucketId;
  label: string;
  totalRevenue: number;
  averageDailyRevenue: number;
  totalOrders: number;
  averageOrdersPerActiveDay: number;
  activeDays: number;
  /** วันที่อยู่ในช่วงที่เลือกแต่ revenue=0 และ orders=0 — ไม่นำมาหารเฉลี่ย */
  zeroSalesDays: number;
  percentageVsStoreAverage: number | null;
  classification: MonthBucketClassification;
  classificationLabel: string;
  classificationEmoji: string;
  sufficientForClassification: boolean;
  topProducts: ProductPeriodInsight[];
  slowProducts: ProductPeriodInsight[];
};

export type ProductPeriodInsight = {
  menuItemId: string;
  name: string;
  quantitySold: number;
  revenueBaht: number;
  shareOfPeriodSales: number;
  salesGrade: StockRecommendGrade;
  rank: number;
  avgQtyPerActiveDay: number;
  /** เทียบกับค่าเฉลี่ยต่อวันขายในช่วงอื่น (normalized) */
  comparison?: {
    otherAvgQtyPerActiveDay: number;
    changePct: number | null;
    status: ProductComparisonStatus;
  };
};

export type MonthPatternResult = {
  sufficientData: boolean;
  insufficientReason: string | null;
  storeAverageDailyRevenue: number;
  activeDaysTotal: number;
  buckets: MonthBucketInsight[];
};

export type ProductDailyRow = {
  menuItemId: string;
  name: string;
  date: string;
  quantity: number;
  revenueBaht: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** ดึงวันที่ของเดือน (1–31) จาก date key YYYY-MM-DD */
export function dayOfMonthFromDateKey(dateKey: string): number {
  return Number.parseInt(dateKey.slice(8, 10), 10);
}

/** จำนวนวันในเดือนของ date key (รองรับ 28/29/30/31) */
export function daysInMonthFromDateKey(dateKey: string): number {
  const y = Number.parseInt(dateKey.slice(0, 4), 10);
  const m = Number.parseInt(dateKey.slice(5, 7), 10);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** แมปวันที่ของเดือน → bucket id */
export function resolveDayOfMonthBucketId(dayOfMonth: number): DayOfMonthBucketId {
  if (dayOfMonth <= 10) return "1-10";
  if (dayOfMonth <= 15) return "11-15";
  if (dayOfMonth <= 25) return "16-25";
  return "26-end";
}

export function bucketLabelForId(id: DayOfMonthBucketId): string {
  return DAY_OF_MONTH_BUCKETS.find((b) => b.id === id)?.label ?? id;
}

function isActiveSalesDay(d: ShopDailyPoint): boolean {
  return d.revenueBaht > 0 || d.orderCount > 0;
}

function classifyBucket(vsAvgPct: number | null): MonthBucketClassification {
  if (vsAvgPct == null) return "insufficient";
  if (vsAvgPct >= MONTH_PATTERN_CLASSIFICATION.hotMinPctAboveAvg) return "hot";
  if (vsAvgPct <= MONTH_PATTERN_CLASSIFICATION.coolMaxPctBelowAvg) return "cool";
  return "normal";
}

function classificationDisplay(kind: MonthBucketClassification): {
  label: string;
  emoji: string;
} {
  const ui = MONTH_PATTERN_CLASSIFICATION_UI[kind];
  return { label: ui.label, emoji: ui.emoji };
}

export function assessMonthPatternSample(input: {
  activeDaysTotal: number;
  bucketsWithActiveDays: number;
}): { sufficient: boolean; reason: string | null } {
  const { activeDaysTotal, bucketsWithActiveDays } = input;
  if (activeDaysTotal < MONTH_PATTERN_MIN_SAMPLE.activeDaysTotal) {
    return {
      sufficient: false,
      reason: "ข้อมูลยังไม่พอสำหรับสรุปแนวโน้ม — ลองขยายช่วงหรือรอให้มียอดขายเพิ่ม",
    };
  }
  if (bucketsWithActiveDays < MONTH_PATTERN_MIN_SAMPLE.bucketsWithData) {
    return {
      sufficient: false,
      reason: "ข้อมูลยังไม่พอสำหรับสรุปแนวโน้ม — ยังไม่ครบหลายช่วงของเดือน",
    };
  }
  return { sufficient: true, reason: null };
}

/** คำนวณ % เทียบค่าเฉลี่ยร้าน */
export function percentageVsStoreAverage(
  bucketAvgDaily: number,
  storeAvgDaily: number,
): number | null {
  if (storeAvgDaily <= 0) return null;
  return round1(((bucketAvgDaily - storeAvgDaily) / storeAvgDaily) * 100);
}

type BucketAccumulator = {
  totalRevenue: number;
  totalOrders: number;
  activeDays: number;
  zeroSalesDays: number;
  activeDates: Set<string>;
};

function emptyBucketAccumulators(): Map<DayOfMonthBucketId, BucketAccumulator> {
  const map = new Map<DayOfMonthBucketId, BucketAccumulator>();
  for (const b of DAY_OF_MONTH_BUCKETS) {
    map.set(b.id, {
      totalRevenue: 0,
      totalOrders: 0,
      activeDays: 0,
      zeroSalesDays: 0,
      activeDates: new Set(),
    });
  }
  return map;
}

/** Phase 1 — วิเคราะห์ยอดขายตามช่วงวันที่ของเดือน */
export function buildMonthBucketInsights(
  days: ShopDailyPoint[],
  productRows: ProductDailyRow[] = [],
): MonthPatternResult {
  const acc = emptyBucketAccumulators();

  for (const d of days) {
    const dom = dayOfMonthFromDateKey(d.date);
    const bucketId = resolveDayOfMonthBucketId(dom);
    const bucket = acc.get(bucketId)!;
    bucket.totalRevenue += d.revenueBaht;
    bucket.totalOrders += d.orderCount;
    if (isActiveSalesDay(d)) {
      bucket.activeDays += 1;
      bucket.activeDates.add(d.date);
    } else {
      bucket.zeroSalesDays += 1;
    }
  }

  const activeDaysAll = days.filter(isActiveSalesDay);
  const activeDaysTotal = activeDaysAll.length;
  const storeTotalRevenue = activeDaysAll.reduce((s, d) => s + d.revenueBaht, 0);
  const storeAverageDailyRevenue =
    activeDaysTotal > 0 ? round2(storeTotalRevenue / activeDaysTotal) : 0;

  const bucketsWithActiveDays = [...acc.values()].filter(
    (b) => b.activeDays >= MONTH_PATTERN_MIN_SAMPLE.activeDaysPerBucket,
  ).length;

  const sample = assessMonthPatternSample({
    activeDaysTotal,
    bucketsWithActiveDays,
  });

  const productByBucket = aggregateProductsByBucket(productRows);

  const buckets: MonthBucketInsight[] = DAY_OF_MONTH_BUCKETS.map((def) => {
    const b = acc.get(def.id)!;
    const hasEnoughDays =
      b.activeDays >= MONTH_PATTERN_MIN_SAMPLE.activeDaysPerBucket;
    const averageDailyRevenue = hasEnoughDays
      ? round2(b.totalRevenue / b.activeDays)
      : 0;
    const averageOrdersPerActiveDay = hasEnoughDays
      ? round2(b.totalOrders / b.activeDays)
      : 0;
    const pct = hasEnoughDays
      ? percentageVsStoreAverage(averageDailyRevenue, storeAverageDailyRevenue)
      : null;

    const sufficientForClassification =
      sample.sufficient && hasEnoughDays && storeAverageDailyRevenue > 0;
    const classification: MonthBucketClassification = sufficientForClassification
      ? classifyBucket(pct)
      : "insufficient";
    const display = classificationDisplay(classification);

    const products = buildProductPeriodInsights(
      productByBucket.get(def.id) ?? [],
      b.activeDates,
    );

    const topProducts = products
      .filter((p) => p.salesGrade === "A")
      .slice(0, MONTH_PATTERN_PRODUCT_TOP_N);
    const slowProducts = products
      .filter((p) => p.salesGrade === "C")
      .slice(0, MONTH_PATTERN_PRODUCT_TOP_N);

    const withComparison = enrichProductComparisons(
      [...topProducts, ...slowProducts],
      def.id,
      productByBucket,
    );

    const topWithComp = withComparison.filter((p) =>
      topProducts.some((t) => t.menuItemId === p.menuItemId),
    );
    const slowWithComp = withComparison.filter((p) =>
      slowProducts.some((t) => t.menuItemId === p.menuItemId),
    );

    return {
      id: def.id,
      label: def.label,
      totalRevenue: round2(b.totalRevenue),
      averageDailyRevenue,
      totalOrders: b.totalOrders,
      averageOrdersPerActiveDay,
      activeDays: b.activeDays,
      zeroSalesDays: b.zeroSalesDays,
      percentageVsStoreAverage: pct,
      classification,
      classificationLabel: sufficientForClassification
        ? display.label
        : MONTH_PATTERN_CLASSIFICATION_UI.insufficient.label,
      classificationEmoji: sufficientForClassification ? display.emoji : "",
      sufficientForClassification,
      topProducts: topWithComp,
      slowProducts: slowWithComp,
    };
  });

  return {
    sufficientData: sample.sufficient,
    insufficientReason: sample.reason,
    storeAverageDailyRevenue,
    activeDaysTotal,
    buckets,
  };
}

type ProductBucketAgg = {
  menuItemId: string;
  name: string;
  quantitySold: number;
  revenueBaht: number;
  activeDates: Set<string>;
};

function aggregateProductsByBucket(
  rows: ProductDailyRow[],
): Map<DayOfMonthBucketId, ProductBucketAgg[]> {
  const byBucket = new Map<DayOfMonthBucketId, Map<string, ProductBucketAgg>>();

  for (const def of DAY_OF_MONTH_BUCKETS) {
    byBucket.set(def.id, new Map());
  }

  for (const row of rows) {
    if (row.quantity <= 0 && row.revenueBaht <= 0) continue;
    const dom = dayOfMonthFromDateKey(row.date);
    const bucketId = resolveDayOfMonthBucketId(dom);
    const inner = byBucket.get(bucketId)!;
    const cur = inner.get(row.menuItemId) ?? {
      menuItemId: row.menuItemId,
      name: row.name,
      quantitySold: 0,
      revenueBaht: 0,
      activeDates: new Set<string>(),
    };
    cur.quantitySold += row.quantity;
    cur.revenueBaht += row.revenueBaht;
    if (row.quantity > 0) cur.activeDates.add(row.date);
    if (row.name && !cur.name) cur.name = row.name;
    inner.set(row.menuItemId, cur);
  }

  const result = new Map<DayOfMonthBucketId, ProductBucketAgg[]>();
  for (const def of DAY_OF_MONTH_BUCKETS) {
    result.set(def.id, [...(byBucket.get(def.id)?.values() ?? [])]);
  }
  return result;
}

/** Phase 2 — ABC ภายใน bucket ที่เลือก */
export function buildProductPeriodInsights(
  products: ProductBucketAgg[],
  bucketActiveDates: Set<string>,
): ProductPeriodInsight[] {
  if (products.length === 0) return [];

  const soldRows = products.map((p) => ({
    menuItemId: p.menuItemId,
    totalSold: p.quantitySold,
  }));
  const grades = assignSalesGrades(soldRows);
  const totalQty = products.reduce((s, p) => s + p.quantitySold, 0);

  const ranked = products
    .map((p) => {
      const activeDays = p.activeDates.size || bucketActiveDates.size || 1;
      const avgQtyPerActiveDay = round2(p.quantitySold / Math.max(activeDays, 1));
      return {
        menuItemId: p.menuItemId,
        name: p.name,
        quantitySold: p.quantitySold,
        revenueBaht: round2(p.revenueBaht),
        shareOfPeriodSales:
          totalQty > 0 ? round1((p.quantitySold / totalQty) * 100) : 0,
        salesGrade: grades.get(p.menuItemId) ?? ("SKIP" as StockRecommendGrade),
        rank: 0,
        avgQtyPerActiveDay,
      };
    })
    .sort(
      (a, b) =>
        b.quantitySold - a.quantitySold || b.revenueBaht - a.revenueBaht,
    );

  ranked.forEach((p, i) => {
    p.rank = i + 1;
  });

  return ranked;
}

function enrichProductComparisons(
  featured: ProductPeriodInsight[],
  currentBucketId: DayOfMonthBucketId,
  productByBucket: Map<DayOfMonthBucketId, ProductBucketAgg[]>,
): ProductPeriodInsight[] {
  return featured.map((product) => {
    const otherBuckets = DAY_OF_MONTH_BUCKETS.filter(
      (b) => b.id !== currentBucketId,
    );
    let otherQty = 0;
    let otherActiveDays = 0;
    let hadSalesInOther = false;
    let hadSalesInCurrent = product.quantitySold > 0;

    for (const b of otherBuckets) {
      const agg = productByBucket.get(b.id) ?? [];
      const match = agg.find((p) => p.menuItemId === product.menuItemId);
      if (match && match.quantitySold > 0) {
        hadSalesInOther = true;
        otherQty += match.quantitySold;
        otherActiveDays += match.activeDates.size;
      }
    }

    const currentAvg = product.avgQtyPerActiveDay;
    const otherAvg =
      otherActiveDays > 0 ? round2(otherQty / otherActiveDays) : 0;

    let status: ProductComparisonStatus = "na";
    let changePct: number | null = null;

    if (!hadSalesInCurrent && !hadSalesInOther) {
      status = "no_sales";
    } else if (!hadSalesInOther && hadSalesInCurrent) {
      status = "new";
    } else if (otherAvg <= 0) {
      status = "na";
    } else if (currentAvg <= 0) {
      status = "no_sales";
    } else {
      changePct = round1(((currentAvg - otherAvg) / otherAvg) * 100);
      status = changePct >= 0 ? "up" : "down";
    }

    return {
      ...product,
      comparison: {
        otherAvgQtyPerActiveDay: otherAvg,
        changePct,
        status,
      },
    };
  });
}

/** สร้าง product daily rows จาก daily maps (order + skewer qty) และ revenue map */
export function mergeProductDailySales(input: {
  menuItems: Array<{ id: string; name: string }>;
  orderByMenuDate: Map<string, Map<string, number>>;
  skewerByMenuDate: Map<string, Map<string, number>>;
  revenueByMenuDate: Map<string, Map<string, number>>;
  dates: string[];
}): ProductDailyRow[] {
  const rows: ProductDailyRow[] = [];
  for (const item of input.menuItems) {
    const orderDaily = input.orderByMenuDate.get(item.id) ?? new Map();
    const skewerDaily = input.skewerByMenuDate.get(item.id) ?? new Map();
    const revenueDaily = input.revenueByMenuDate.get(item.id) ?? new Map();
    for (const date of input.dates) {
      const qty = (orderDaily.get(date) ?? 0) + (skewerDaily.get(date) ?? 0);
      const revenue = revenueDaily.get(date) ?? 0;
      if (qty <= 0 && revenue <= 0) continue;
      rows.push({
        menuItemId: item.id,
        name: item.name,
        date,
        quantity: qty,
        revenueBaht: revenue,
      });
    }
  }
  return rows;
}

export {
  DAY_OF_MONTH_BUCKETS,
  MONTH_PATTERN_MIN_SAMPLE,
  MONTH_PATTERN_CLASSIFICATION,
} from "@/lib/sales-month-pattern-config";
