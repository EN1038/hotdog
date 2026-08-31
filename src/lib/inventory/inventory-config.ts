/** Phase 1 inventory foundation — shared defaults (client-safe). */
export const INVENTORY_DEFAULTS = {
  /** Days of coverage for recommended par stock */
  coverageDays: 5,
  /** Safety buffer as percentage (20 = 20%) */
  safetyPct: 20,
  /** Max ± adjustment from recent trend when forecasting tomorrow */
  trendClampPct: 30,
  /** Weeks of same-weekday history to consider */
  sameWeekdayLookbackWeeks: 4,
  /** Minimum trading days with sales for GOOD data quality */
  minTradingDaysForGood: 7,
  /** Minimum trading days for PARTIAL (below = INSUFFICIENT) */
  minTradingDaysForPartial: 3,
  /** Default analysis window (days back from today, inclusive) */
  analysisWindowDays: 30,
  /** FOH: total on-hand ≈ 1 day of sales, never 2 days */
  skewerTotalParMin: 300,
  skewerTotalParMax: 500,
  /** 1.0 = ถือของเท่าขายเฉลี่ย 1 วัน */
  skewerTotalParFactor: 1,
  /** Hard cap: must stay under 2 days of sales */
  skewerMaxDaysOnHand: 1.5,
} as const;

export function safetyFactorFromPct(safetyPct: number): number {
  return 1 + Math.max(0, safetyPct) / 100;
}
