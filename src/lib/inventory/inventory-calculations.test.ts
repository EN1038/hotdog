import { describe, expect, it } from "vitest";
import {
  clampTrendFactor,
  computeRecommendedParStock,
  computeSafetyStock,
  computeSkewerBranchParTarget,
  allocateParStockBySalesShare,
  scaleParValuesToTarget,
  computeSuggestedRefill,
  computeTomorrowTarget,
} from "@/lib/inventory/inventory-calculations";
import { computeTomorrowForecast } from "@/lib/inventory/inventory-forecast";
import { deriveDataQuality } from "@/lib/inventory/inventory-data-quality";

describe("computeRecommendedParStock", () => {
  it("TEST 1: avg=18.24, coverage=5, safety=20% → 110", () => {
    expect(computeRecommendedParStock(18.24, 5, 20)).toBe(110);
  });
});

describe("skewer branch par target", () => {
  it("targets ~1 day of sales, never 2 days", () => {
    expect(computeSkewerBranchParTarget(200)).toBe(300); // 1.5d cap vs min 300
    expect(computeSkewerBranchParTarget(320)).toBe(320);
    expect(computeSkewerBranchParTarget(500)).toBe(500);
    expect(computeSkewerBranchParTarget(100)).toBe(150); // 1.5d, not min 300 (3d)
  });

  it("allocates branch par by sales share", () => {
    const allocated = allocateParStockBySalesShare([15, 10, 5], 300);
    expect(allocated.reduce((s, n) => s + n, 0)).toBe(300);
    expect(allocated[0]).toBeGreaterThan(allocated[2]!);
  });

  it("scales down when raw sum exceeds target", () => {
    const scaled = scaleParValuesToTarget([50, 40, 30], 60);
    expect(scaled.reduce((s, n) => s + n, 0)).toBe(60);
  });
});

describe("computeTomorrowTarget", () => {
  it("TEST 2: forecast=35, safety=20% → target 42", () => {
    expect(computeSafetyStock(35, 20)).toBe(7);
    expect(computeTomorrowTarget(35, 20)).toBe(42);
  });
});

describe("computeSuggestedRefill", () => {
  it("TEST 3: target=42, available=20 → refill 22", () => {
    expect(computeSuggestedRefill(42, 20)).toBe(22);
  });

  it("TEST 4: target=42, available=50 → refill 0", () => {
    expect(computeSuggestedRefill(42, 50)).toBe(0);
  });
});

describe("computeTomorrowForecast fallback", () => {
  it("TEST 8: no historical data → INSUFFICIENT", () => {
    const result = computeTomorrowForecast({
      tomorrowDateKey: "2026-08-31",
      sameWeekdayAverage: 0,
      sameWeekdaySampleSize: 0,
      avg7: 0,
      avg14: 0,
      avg30: 0,
      recentTrendPct: 0,
      parStock: 0,
      dataQuality: "INSUFFICIENT",
    });
    expect(result.forecastQty).toBe(0);
    expect(result.forecastSource).toBe("INSUFFICIENT");
    expect(result.dataQuality).toBe("INSUFFICIENT");
    expect(result.reasonCodes).toContain("INSUFFICIENT_HISTORY");
  });

  it("uses PAR fallback when no sales but par set", () => {
    const result = computeTomorrowForecast({
      tomorrowDateKey: "2026-08-31",
      sameWeekdayAverage: 0,
      sameWeekdaySampleSize: 0,
      avg7: 0,
      avg14: 0,
      avg30: 0,
      recentTrendPct: 0,
      parStock: 110,
      dataQuality: "INSUFFICIENT",
    });
    expect(result.forecastQty).toBe(110);
    expect(result.forecastSource).toBe("PAR_FALLBACK");
  });
});

describe("clampTrendFactor", () => {
  it("TEST 9: extreme trend is clamped to ±30%", () => {
    expect(clampTrendFactor(2.0, 30)).toBe(1.3);
    expect(clampTrendFactor(0.3, 30)).toBe(0.7);
    expect(clampTrendFactor(1.1, 30)).toBe(1.1);
  });
});

describe("deriveDataQuality", () => {
  it("TEST 10: partial stock tracking → PARTIAL", () => {
    expect(
      deriveDataQuality({
        tradingDaysWithSales: 10,
        includesPartialStockTracking: true,
      }),
    ).toBe("PARTIAL");
  });

  it("insufficient trading days → INSUFFICIENT", () => {
    expect(
      deriveDataQuality({ tradingDaysWithSales: 1 }),
    ).toBe("INSUFFICIENT");
  });
});

describe("forecast with same weekday history", () => {
  it("applies clamped trend to same-weekday base", () => {
    const result = computeTomorrowForecast({
      tomorrowDateKey: "2026-08-31",
      sameWeekdayAverage: 34,
      sameWeekdaySampleSize: 4,
      avg7: 40,
      avg14: 30,
      avg30: 28,
      recentTrendPct: 50,
      parStock: 0,
      dataQuality: "GOOD",
    });
    expect(result.forecastQty).toBeGreaterThan(0);
    expect(result.forecastQty).toBeLessThanOrEqual(Math.ceil(34 * 1.3));
    expect(result.reasonCodes).toContain("SAME_WEEKDAY_HISTORY");
  });
});
