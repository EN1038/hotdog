import {
  INVENTORY_DEFAULTS,
  safetyFactorFromPct,
} from "@/lib/inventory/inventory-config";

/** Recommended par = ceil(avgDaily × coverageDays × safetyFactor) */
export function computeRecommendedParStock(
  avgDailySales: number,
  coverageDays: number = INVENTORY_DEFAULTS.coverageDays,
  safetyPct: number = INVENTORY_DEFAULTS.safetyPct,
): number {
  if (avgDailySales <= 0) return 0;
  const factor = safetyFactorFromPct(safetyPct);
  return Math.ceil(avgDailySales * coverageDays * factor);
}

/** Pick avg daily sales for par (prefer longer window). */
export function avgDailyForPar(metrics: {
  avg30: number;
  avg14: number;
  avg7: number;
}): number {
  if (metrics.avg30 > 0) return metrics.avg30;
  if (metrics.avg14 > 0) return metrics.avg14;
  return metrics.avg7;
}

/** Branch par ≈ 1 day of sales, clamped 300–500, never 2 days of stock. */
export function computeSkewerBranchParTarget(
  totalAvgDailySales: number,
  overrides?: { min?: number; max?: number; factor?: number; maxDaysOnHand?: number },
): number {
  const min = overrides?.min ?? INVENTORY_DEFAULTS.skewerTotalParMin;
  const max = overrides?.max ?? INVENTORY_DEFAULTS.skewerTotalParMax;
  const factor = overrides?.factor ?? INVENTORY_DEFAULTS.skewerTotalParFactor;
  const maxDays =
    overrides?.maxDaysOnHand ?? INVENTORY_DEFAULTS.skewerMaxDaysOnHand;
  if (totalAvgDailySales <= 0) {
    return Math.round((min + max) / 2);
  }
  const oneDay = Math.round(totalAvgDailySales * factor);
  const twoDayCap = Math.max(1, Math.floor(totalAvgDailySales * maxDays));
  const ceiling = Math.min(max, twoDayCap);
  return Math.min(ceiling, Math.max(Math.min(min, twoDayCap), oneDay));
}

/** Scale par values down to targetTotal when sum exceeds budget (weights = current values). */
export function scaleParValuesToTarget(values: number[], targetTotal: number): number[] {
  const sum = values.reduce((s, v) => s + v, 0);
  if (targetTotal <= 0 || sum <= 0) return values.map(() => 0);
  if (sum <= targetTotal) return [...values];
  return allocateParStockBySalesShare(values, targetTotal);
}

/** Split branch par budget across SKUs by sales share (integers, sum = targetTotal). */
export function allocateParStockBySalesShare(
  avgDailySales: number[],
  targetTotal: number,
): number[] {
  if (targetTotal <= 0 || avgDailySales.length === 0) {
    return avgDailySales.map(() => 0);
  }
  const weights = avgDailySales.map((a) => Math.max(0, a));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (weightSum <= 0) return avgDailySales.map(() => 0);

  const exact = weights.map((w) => (targetTotal * w) / weightSum);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = targetTotal - floors.reduce((s, v) => s + v, 0);
  const byFrac = exact
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < byFrac.length && remainder > 0; k++) {
    out[byFrac[k]!.i] += 1;
    remainder -= 1;
  }
  return out;
}

/** safetyStock = ceil(forecast × safetyPct%) */
export function computeSafetyStock(
  forecastQty: number,
  safetyPct: number = INVENTORY_DEFAULTS.safetyPct,
): number {
  if (forecastQty <= 0) return 0;
  return Math.ceil(forecastQty * (Math.max(0, safetyPct) / 100));
}

/** tomorrowTarget = forecast + safetyStock */
export function computeTomorrowTarget(
  forecastQty: number,
  safetyPct: number = INVENTORY_DEFAULTS.safetyPct,
): number {
  if (forecastQty <= 0) return 0;
  return forecastQty + computeSafetyStock(forecastQty, safetyPct);
}

/** suggestedRefill = max(tomorrowTarget − available, 0) */
export function computeSuggestedRefill(
  tomorrowTarget: number,
  availableStock: number,
): number {
  if (tomorrowTarget <= 0) return 0;
  return Math.max(tomorrowTarget - availableStock, 0);
}

/** Clamp trend multiplier to ±maxPct% around 1.0 */
export function clampTrendFactor(
  rawFactor: number,
  maxPct: number = INVENTORY_DEFAULTS.trendClampPct,
): number {
  const min = 1 - maxPct / 100;
  const max = 1 + maxPct / 100;
  if (!Number.isFinite(rawFactor) || rawFactor <= 0) return 1;
  return Math.min(max, Math.max(min, rawFactor));
}

/** Compute bounded trend factor: recentAvg / baselineAvg */
export function computeRecentTrendFactor(
  recentAvg: number,
  baselineAvg: number,
  maxPct: number = INVENTORY_DEFAULTS.trendClampPct,
): number {
  if (baselineAvg <= 0 || recentAvg <= 0) return 1;
  return clampTrendFactor(recentAvg / baselineAvg, maxPct);
}

/** Trading-day average from daily totals map */
export function computeTradingDayAverage(
  dailyTotals: Map<string, number>,
  tradingDays: number,
): number {
  if (tradingDays <= 0) return 0;
  let sum = 0;
  for (const qty of dailyTotals.values()) {
    sum += qty;
  }
  return sum / tradingDays;
}

/** Average over last N trading days (days with any sales in the map). */
export function computeRecentTradingAverage(
  dailyTotals: Map<string, number>,
  sortedDateKeys: string[],
  windowSize: number,
): number {
  const withSales = sortedDateKeys.filter((key) => (dailyTotals.get(key) ?? 0) > 0);
  const slice = withSales.slice(-windowSize);
  if (slice.length === 0) return 0;
  const sum = slice.reduce((acc, key) => acc + (dailyTotals.get(key) ?? 0), 0);
  return sum / slice.length;
}

/** Same-weekday average for target weekday from historical date keys. */
export function computeSameWeekdayAverage(
  dailyTotals: Map<string, number>,
  targetWeekday: number,
  lookbackWeeks: number = INVENTORY_DEFAULTS.sameWeekdayLookbackWeeks,
  beforeDateKey?: string,
): { average: number; sampleSize: number } {
  const cutoff = beforeDateKey ?? "9999-12-31";
  const samples: Array<{ dateKey: string; qty: number }> = [];

  for (const [dateKey, qty] of dailyTotals) {
    if (dateKey >= cutoff) continue;
    const weekday = getWeekdayFromDateKey(dateKey);
    if (weekday !== targetWeekday) continue;
    samples.push({ dateKey, qty });
  }

  samples.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const capped = samples.slice(0, lookbackWeeks);
  if (capped.length === 0) return { average: 0, sampleSize: 0 };
  const sum = capped.reduce((a, b) => a + b.qty, 0);
  return { average: sum / capped.length, sampleSize: capped.length };
}

function getWeekdayFromDateKey(dateKey: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
  });
  const weekday = formatter.format(new Date(`${dateKey}T12:00:00+07:00`));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

/** Percent change from baseline to recent (rounded). */
export function computeTrendPct(recentAvg: number, baselineAvg: number): number {
  if (baselineAvg <= 0) return 0;
  return Math.round(((recentAvg - baselineAvg) / baselineAvg) * 100);
}
