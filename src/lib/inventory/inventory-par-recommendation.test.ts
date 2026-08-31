import { BranchOperatingMode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildParStockRecommendations } from "@/lib/inventory/inventory-par-recommendation";
import { DEFAULT_SKEWER_PAR_POLICY, factorsForHoldDays } from "@/lib/inventory/inventory-par-policy";
import type { MenuItemSalesMetrics } from "@/lib/inventory/inventory-sales-metrics";

function metrics(avg30: number, totalSold: number): MenuItemSalesMetrics {
  return {
    menuItemId: "x",
    todaySales: 0,
    avg7: avg30,
    avg14: avg30,
    avg30,
    sameWeekdayAverage: 0,
    sameWeekdaySampleSize: 0,
    recentTrendPct: 0,
    daysWithSales: 10,
    sampleSize: 10,
    dataSource: "ORDER_COMPLETED",
    dataQuality: "GOOD",
    orderSoldTotal: totalSold,
    skewerSoldTotal: 0,
    includesSkewer: false,
    minDailySales: avg30,
    maxDailySales: avg30,
  };
}

describe("buildParStockRecommendations skewer", () => {
  it("allocates only to A+B, ~1 day per SKU, under 2 days total", () => {
    const items = [
      { menuItemId: "a", metrics: metrics(15, 450), totalSold: 450 },
      { menuItemId: "b", metrics: metrics(8, 240), totalSold: 240 },
      { menuItemId: "c", metrics: metrics(1, 2), totalSold: 2 },
    ];
    const rec = buildParStockRecommendations({
      operatingMode: BranchOperatingMode.SKEWER,
      items,
      skewerPolicy: DEFAULT_SKEWER_PAR_POLICY,
    });
    expect(rec.get("c")).toBe(0);
    expect(rec.get("a")).toBeLessThanOrEqual(Math.floor(15 * 1.5));
    expect(rec.get("b")).toBeLessThanOrEqual(Math.floor(8 * 1.5));
    const sum =
      (rec.get("a") ?? 0) + (rec.get("b") ?? 0) + (rec.get("c") ?? 0);
    expect(sum).toBeLessThanOrEqual(Math.floor((15 + 8 + 1) * 1.5));
    expect(rec.get("a")!).toBeGreaterThan(rec.get("b")!);
  });

  it("scales recommendations for 2 hold days", () => {
    const items = [
      { menuItemId: "a", metrics: metrics(15, 450), totalSold: 450 },
      { menuItemId: "b", metrics: metrics(8, 240), totalSold: 240 },
      { menuItemId: "c", metrics: metrics(1, 2), totalSold: 2 },
    ];
    const rec = buildParStockRecommendations({
      operatingMode: BranchOperatingMode.SKEWER,
      items,
      skewerPolicy: {
        ...DEFAULT_SKEWER_PAR_POLICY,
        ...factorsForHoldDays(2),
      },
    });
    expect(rec.get("c")).toBe(0);
    expect(rec.get("a")).toBe(30);
    expect(rec.get("b")).toBe(16);
  });
});
