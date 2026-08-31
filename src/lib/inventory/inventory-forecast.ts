import type { InventoryDataQuality } from "@/lib/inventory/inventory-data-quality";
import type { InventoryReasonCode } from "@/lib/inventory/inventory-reason-codes";
import {
  clampTrendFactor,
  computeRecentTrendFactor,
} from "@/lib/inventory/inventory-calculations";
import { bangkokWeekdayIndex } from "@/lib/inventory/inventory-date";

export type ForecastSource =
  | "SAME_WEEKDAY_RECENT_TREND"
  | "SAME_WEEKDAY"
  | "AVG_7_TREND"
  | "AVG_7"
  | "AVG_14"
  | "AVG_30"
  | "PAR_FALLBACK"
  | "MANUAL_FALLBACK"
  | "INSUFFICIENT";

export type TomorrowForecastInput = {
  tomorrowDateKey: string;
  sameWeekdayAverage: number;
  sameWeekdaySampleSize: number;
  avg7: number;
  avg14: number;
  avg30: number;
  recentTrendPct: number;
  parStock: number;
  dataQuality: InventoryDataQuality;
  includesPartialStockTracking?: boolean;
};

export type TomorrowForecastResult = {
  forecastQty: number;
  forecastSource: ForecastSource;
  dataQuality: InventoryDataQuality;
  reasonCodes: InventoryReasonCode[];
  inputs: {
    sameWeekdayAverage: number;
    sameWeekdaySampleSize: number;
    avg7: number;
    avg14: number;
    avg30: number;
    recentTrendPct: number;
    trendFactor: number;
    parStock: number;
  };
};

export function computeTomorrowForecast(
  input: TomorrowForecastInput,
): TomorrowForecastResult {
  const reasonCodes: InventoryReasonCode[] = [];
  if (input.includesPartialStockTracking) {
    reasonCodes.push("PARTIAL_STOCK_TRACKING");
  }

  const trendFactor = computeRecentTrendFactor(
    input.avg7 > 0 ? input.avg7 * (1 + input.recentTrendPct / 100) : input.avg7,
    input.avg14 > 0 ? input.avg14 : input.avg30,
  );

  if (input.recentTrendPct > 0) reasonCodes.push("RECENT_TREND_UP");
  if (input.recentTrendPct < 0) reasonCodes.push("RECENT_TREND_DOWN");

  // Priority 1: same-weekday + trend
  if (input.sameWeekdayAverage > 0 && input.sameWeekdaySampleSize >= 2) {
    reasonCodes.push("SAME_WEEKDAY_HISTORY");
    const adjusted = Math.ceil(input.sameWeekdayAverage * trendFactor);
    if (input.recentTrendPct >= 15) reasonCodes.push("HIGH_DEMAND");
    if (input.recentTrendPct <= -15) reasonCodes.push("LOW_DEMAND");
    return buildResult(
      adjusted,
      input.sameWeekdaySampleSize >= 3 && input.avg7 > 0
        ? "SAME_WEEKDAY_RECENT_TREND"
        : "SAME_WEEKDAY",
      input.dataQuality,
      reasonCodes,
      input,
      trendFactor,
    );
  }

  // Priority 2: avg7 with trend
  if (input.avg7 > 0) {
    reasonCodes.push("AVG_7_FALLBACK");
    const adjusted = Math.ceil(input.avg7 * clampTrendFactor(1 + input.recentTrendPct / 100));
    return buildResult(
      adjusted,
      input.recentTrendPct !== 0 ? "AVG_7_TREND" : "AVG_7",
      input.dataQuality,
      reasonCodes,
      input,
      trendFactor,
    );
  }

  // Priority 3: avg14
  if (input.avg14 > 0) {
    reasonCodes.push("AVG_14_FALLBACK");
    return buildResult(
      Math.ceil(input.avg14),
      "AVG_14",
      input.dataQuality,
      reasonCodes,
      input,
      1,
    );
  }

  // Priority 4: avg30
  if (input.avg30 > 0) {
    reasonCodes.push("AVG_30_FALLBACK");
    return buildResult(
      Math.ceil(input.avg30),
      "AVG_30",
      input.dataQuality,
      reasonCodes,
      input,
      1,
    );
  }

  // Priority 5: par fallback
  if (input.parStock > 0) {
    reasonCodes.push("PAR_FALLBACK");
    return buildResult(
      input.parStock,
      "PAR_FALLBACK",
      "INSUFFICIENT",
      reasonCodes,
      input,
      1,
    );
  }

  // Priority 6: insufficient
  reasonCodes.push("INSUFFICIENT_HISTORY");
  return buildResult(0, "INSUFFICIENT", "INSUFFICIENT", reasonCodes, input, 1);
}

function buildResult(
  forecastQty: number,
  forecastSource: ForecastSource,
  dataQuality: InventoryDataQuality,
  reasonCodes: InventoryReasonCode[],
  input: TomorrowForecastInput,
  trendFactor: number,
): TomorrowForecastResult {
  return {
    forecastQty: Math.max(0, forecastQty),
    forecastSource,
    dataQuality,
    reasonCodes,
    inputs: {
      sameWeekdayAverage: input.sameWeekdayAverage,
      sameWeekdaySampleSize: input.sameWeekdaySampleSize,
      avg7: input.avg7,
      avg14: input.avg14,
      avg30: input.avg30,
      recentTrendPct: input.recentTrendPct,
      trendFactor,
      parStock: input.parStock,
    },
  };
}

export function tomorrowWeekdayIndex(tomorrowDateKey: string): number {
  return bangkokWeekdayIndex(tomorrowDateKey);
}

export const FORECAST_SOURCE_LABELS: Record<ForecastSource, string> = {
  SAME_WEEKDAY_RECENT_TREND: "วันเดียวกันย้อนหลัง + แนวโน้ม",
  SAME_WEEKDAY: "วันเดียวกันย้อนหลัง",
  AVG_7_TREND: "เฉลี่ย 7 วัน + แนวโน้ม",
  AVG_7: "เฉลี่ย 7 วัน",
  AVG_14: "เฉลี่ย 14 วัน",
  AVG_30: "เฉลี่ย 30 วัน",
  PAR_FALLBACK: "Par Stock",
  MANUAL_FALLBACK: "ตั้งเอง",
  INSUFFICIENT: "ข้อมูลไม่พอ",
};
