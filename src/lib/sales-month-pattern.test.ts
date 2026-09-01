import { describe, expect, it } from "vitest";
import { OrderStatus } from "@prisma/client";
import type { ShopDailyPoint } from "@/lib/shop-overview-metrics";
import {
  buildMonthBucketInsights,
  buildProductPeriodInsights,
  dayOfMonthFromDateKey,
  daysInMonthFromDateKey,
  mergeProductDailySales,
  percentageVsStoreAverage,
  resolveDayOfMonthBucketId,
  assessMonthPatternSample,
  type ProductDailyRow,
} from "@/lib/sales-month-pattern";
import { MONTH_PATTERN_MIN_SAMPLE } from "@/lib/sales-month-pattern-config";

function day(
  date: string,
  revenueBaht: number,
  orderCount = revenueBaht > 0 ? 1 : 0,
): ShopDailyPoint {
  return { date, label: date, revenueBaht, orderCount };
}

function spreadDays(
  from: string,
  count: number,
  revenue: number,
): ShopDailyPoint[] {
  const out: ShopDailyPoint[] = [];
  let cur = from;
  for (let i = 0; i < count; i += 1) {
    const dom = dayOfMonthFromDateKey(cur);
    out.push(day(cur, dom <= 10 ? revenue * 2 : revenue * 0.5));
    const d = new Date(`${cur}T12:00:00+07:00`);
    d.setTime(d.getTime() + 86_400_000);
    cur = d.toISOString().slice(0, 10);
  }
  return out;
}

describe("resolveDayOfMonthBucketId", () => {
  it("maps day-of-month to buckets", () => {
    expect(resolveDayOfMonthBucketId(1)).toBe("1-10");
    expect(resolveDayOfMonthBucketId(10)).toBe("1-10");
    expect(resolveDayOfMonthBucketId(11)).toBe("11-15");
    expect(resolveDayOfMonthBucketId(15)).toBe("11-15");
    expect(resolveDayOfMonthBucketId(16)).toBe("16-25");
    expect(resolveDayOfMonthBucketId(25)).toBe("16-25");
    expect(resolveDayOfMonthBucketId(26)).toBe("26-end");
    expect(resolveDayOfMonthBucketId(31)).toBe("26-end");
  });
});

describe("daysInMonthFromDateKey", () => {
  it("handles 28/29/30/31 day months", () => {
    expect(daysInMonthFromDateKey("2024-02-15")).toBe(29);
    expect(daysInMonthFromDateKey("2023-02-15")).toBe(28);
    expect(daysInMonthFromDateKey("2024-04-15")).toBe(30);
    expect(daysInMonthFromDateKey("2024-01-31")).toBe(31);
    expect(resolveDayOfMonthBucketId(28)).toBe("26-end");
    expect(resolveDayOfMonthBucketId(29)).toBe("26-end");
  });
});

describe("percentageVsStoreAverage", () => {
  it("computes % above/below store average", () => {
    expect(percentageVsStoreAverage(2650, 2140)).toBe(23.8);
    expect(percentageVsStoreAverage(1450, 1760)).toBe(-17.6);
    expect(percentageVsStoreAverage(100, 0)).toBeNull();
  });
});

describe("average daily sales", () => {
  it("uses active days only, not zero-sales calendar days", () => {
    const days: ShopDailyPoint[] = [
      day("2024-01-01", 2000),
      day("2024-01-02", 0),
      day("2024-01-03", 1000),
      day("2024-01-11", 500),
      day("2024-01-12", 500),
      day("2024-01-16", 300),
      day("2024-01-17", 300),
      day("2024-01-26", 200),
      day("2024-01-27", 200),
      day("2024-01-28", 200),
      day("2024-01-29", 200),
      day("2024-01-30", 200),
      day("2024-01-31", 200),
      day("2024-02-01", 2000),
      day("2024-02-02", 2000),
    ];
    const result = buildMonthBucketInsights(days);
    const b110 = result.buckets.find((b) => b.id === "1-10")!;
    expect(b110.activeDays).toBeGreaterThan(0);
    expect(b110.averageDailyRevenue).toBeGreaterThan(0);
    expect(b110.zeroSalesDays).toBeGreaterThanOrEqual(1);
  });
});

describe("insufficient data", () => {
  it("does not classify when sample too small", () => {
    const days = [
      day("2024-01-01", 1000),
      day("2024-01-02", 1000),
    ];
    const result = buildMonthBucketInsights(days);
    expect(result.sufficientData).toBe(false);
    expect(result.insufficientReason).toContain("ข้อมูลยังไม่พอ");
    for (const b of result.buckets) {
      expect(b.classification).toBe("insufficient");
    }
  });

  it("assessMonthPatternSample respects constants", () => {
    expect(
      assessMonthPatternSample({
        activeDaysTotal: MONTH_PATTERN_MIN_SAMPLE.activeDaysTotal - 1,
        bucketsWithActiveDays: 4,
      }).sufficient,
    ).toBe(false);
    expect(
      assessMonthPatternSample({
        activeDaysTotal: 20,
        bucketsWithActiveDays: 1,
      }).sufficient,
    ).toBe(false);
  });
});

describe("ABC per period", () => {
  it("assigns grades within bucket only", () => {
    const products = [
      {
        menuItemId: "a",
        name: "ลูกชิ้นปลา",
        quantitySold: 100,
        revenueBaht: 5000,
        activeDates: new Set(["2024-01-01", "2024-01-02"]),
      },
      {
        menuItemId: "b",
        name: "ไส้กรอก",
        quantitySold: 30,
        revenueBaht: 900,
        activeDates: new Set(["2024-01-01"]),
      },
      {
        menuItemId: "c",
        name: "บรอกโคลี",
        quantitySold: 2,
        revenueBaht: 40,
        activeDates: new Set(["2024-01-03"]),
      },
    ];
    const insights = buildProductPeriodInsights(products, new Set(["2024-01-01"]));
    const gradeA = insights.find((p) => p.menuItemId === "a");
    const gradeC = insights.find((p) => p.menuItemId === "c");
    expect(gradeA?.salesGrade).toBe("A");
    expect(gradeC?.salesGrade).toBe("C");
    expect(gradeA?.rank).toBe(1);
  });
});

describe("branch isolation", () => {
  it("product rows stay per branch when merged separately", () => {
    const branchA = mergeProductDailySales({
      menuItems: [{ id: "m1", name: "A item" }],
      orderByMenuDate: new Map([["m1", new Map([["2024-01-05", 10]])]]),
      skewerByMenuDate: new Map(),
      revenueByMenuDate: new Map([["m1", new Map([["2024-01-05", 100]])]]),
      dates: ["2024-01-05"],
    });
    const branchB = mergeProductDailySales({
      menuItems: [{ id: "m2", name: "B item" }],
      orderByMenuDate: new Map([["m2", new Map([["2024-01-05", 99]])]]),
      skewerByMenuDate: new Map(),
      revenueByMenuDate: new Map([["m2", new Map([["2024-01-05", 990]])]]),
      dates: ["2024-01-05"],
    });
    expect(branchA[0]?.quantity).toBe(10);
    expect(branchB[0]?.menuItemId).toBe("m2");
    expect(branchA.some((r) => r.menuItemId === "m2")).toBe(false);
  });
});

describe("cancelled order exclusion", () => {
  it("is enforced in loader via isOrderCountableRevenue (contract)", async () => {
    const { isOrderCountableRevenue } = await import("@/lib/order-totals");
    expect(
      isOrderCountableRevenue({
        status: OrderStatus.CANCELLED,
        awaitingPhotoKey: null,
      }),
    ).toBe(false);
    expect(
      isOrderCountableRevenue({
        status: OrderStatus.COMPLETED,
        awaitingPhotoKey: "pending",
      }),
    ).toBe(false);
  });
});

describe("period with no sales", () => {
  it("returns zero averages and insufficient classification", () => {
    const days: ShopDailyPoint[] = Array.from({ length: 20 }, (_, i) =>
      day(`2024-03-${String(i + 1).padStart(2, "0")}`, 0, 0),
    );
    const result = buildMonthBucketInsights(days);
    expect(result.activeDaysTotal).toBe(0);
    expect(result.storeAverageDailyRevenue).toBe(0);
    expect(result.sufficientData).toBe(false);
  });
});

describe("comparison denominator = 0", () => {
  it("uses NEW / NO_SALES / N/A statuses", () => {
    const productRows: ProductDailyRow[] = [
      {
        menuItemId: "new",
        name: "ใหม่",
        date: "2024-01-05",
        quantity: 50,
        revenueBaht: 500,
      },
      {
        menuItemId: "slow",
        name: "ช้า",
        date: "2024-01-20",
        quantity: 1,
        revenueBaht: 10,
      },
    ];
    const days = spreadDays("2024-01-01", MONTH_PATTERN_MIN_SAMPLE.activeDaysTotal + 5, 1000);
    const result = buildMonthBucketInsights(days, productRows);
    const bucket110 = result.buckets.find((b) => b.id === "1-10")!;
    const featured = bucket110.topProducts.find((p) => p.menuItemId === "new");
    expect(featured?.comparison?.status).toBe("new");
    const bucket1625 = result.buckets.find((b) => b.id === "16-25")!;
    const slow = bucket1625.slowProducts.find((p) => p.menuItemId === "slow");
    if (slow?.comparison) {
      expect(["na", "no_sales", "new", "down"]).toContain(slow.comparison.status);
      if (slow.comparison.changePct != null) {
        expect(Number.isFinite(slow.comparison.changePct)).toBe(true);
      }
    }
  });
});

describe("hot vs cool classification from data", () => {
  it("does not hardcode bucket order", () => {
    const days: ShopDailyPoint[] = [];
    for (let m = 1; m <= 3; m += 1) {
      for (let d = 1; d <= 28; d += 1) {
        const date = `2024-0${m}-${String(d).padStart(2, "0")}`;
        const dom = d;
        let rev = 1000;
        if (dom >= 16 && dom <= 25) rev = 3000;
        else if (dom <= 10) rev = 800;
        days.push(day(date, rev));
      }
    }
    const result = buildMonthBucketInsights(days);
    expect(result.sufficientData).toBe(true);
    const b1625 = result.buckets.find((b) => b.id === "16-25")!;
    const b110 = result.buckets.find((b) => b.id === "1-10")!;
    expect(b1625.classification).toBe("hot");
    expect(b110.classification).not.toBe("hot");
  });
});
