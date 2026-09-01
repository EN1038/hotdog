import type { ShopDailyPoint, ShopWeekdayPoint } from "@/lib/shop-overview-metrics";

export type WeekdayInsightKind = "peak" | "strong" | "avg" | "soft" | "low";

export type WeekdayInsight = ShopWeekdayPoint & {
  kind: WeekdayInsightKind;
  vsAvgPct: number | null;
  advice: string;
};

export type SpendDateRange = {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  dayCount: number;
  revenueBaht: number;
  orderCount: number;
  kind: "hot" | "cool";
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** จัดอันดับวันในสัปดาห์: พีก / แข็งแรง / ปานกลาง / อ่อน / ต่ำ */
export function buildWeekdayInsights(
  weekdays: ShopWeekdayPoint[],
): WeekdayInsight[] {
  const withSales = weekdays.filter((d) => d.revenueBaht > 0);
  if (withSales.length === 0) {
    return weekdays.map((d) => ({
      ...d,
      kind: "avg" as const,
      vsAvgPct: null,
      advice: "ยังไม่มีข้อมูลในช่วงนี้",
    }));
  }

  const avg =
    withSales.reduce((s, d) => s + d.revenueBaht, 0) / withSales.length;
  const sorted = [...withSales].sort(
    (a, b) => b.revenueBaht - a.revenueBaht || b.orderCount - a.orderCount,
  );
  const peakWeekday = sorted[0]?.weekday;
  const strongWeekday = sorted[1]?.weekday;
  const lowWeekday = sorted[sorted.length - 1]?.weekday;
  const softWeekday =
    sorted.length >= 2 ? sorted[sorted.length - 2]?.weekday : undefined;

  return weekdays.map((d) => {
    if (d.revenueBaht <= 0) {
      return {
        ...d,
        kind: "low" as const,
        vsAvgPct: null,
        advice: "เกือบไม่มียอด — ลดการเตรียมได้มาก",
      };
    }
    const vsAvgPct = avg > 0 ? round1(((d.revenueBaht - avg) / avg) * 100) : null;
    let kind: WeekdayInsightKind = "avg";
    let advice = "ยอดใกล้ค่าเฉลี่ย — เตรียมตามปกติ";

    if (d.weekday === peakWeekday) {
      kind = "peak";
      advice = "วันขายดีที่สุด — เตรียมของเพิ่มเป็นพิเศษ";
    } else if (d.weekday === strongWeekday && (vsAvgPct ?? 0) >= 5) {
      kind = "strong";
      advice = "วันขายดี — ควรเตรียมของมากกว่าปกติ";
    } else if (d.weekday === lowWeekday) {
      kind = "low";
      advice = "วันยอดต่ำสุด — ลดการเตรียมของเกินจำเป็น";
    } else if (d.weekday === softWeekday && (vsAvgPct ?? 0) <= -5) {
      kind = "soft";
      advice = "วันยอดอ่อน — ลดการเตรียมได้บ้าง";
    } else if ((vsAvgPct ?? 0) >= 15) {
      kind = "strong";
      advice = "สูงกว่าค่าเฉลี่ยชัด — เตรียมเพิ่ม";
    } else if ((vsAvgPct ?? 0) <= -15) {
      kind = "soft";
      advice = "ต่ำกว่าค่าเฉลี่ยชัด — ลดการเตรียม";
    }

    return { ...d, kind, vsAvgPct, advice };
  });
}

function dayAboveThreshold(revenue: number, threshold: number) {
  return revenue >= threshold;
}

/** รวมวันติดกันที่ยอดสูง/ต่ำ เป็นช่วงวันที่ลูกค้าใช้จ่ายมาก–น้อย */
export function buildSpendDateRanges(
  days: ShopDailyPoint[],
): { hot: SpendDateRange[]; cool: SpendDateRange[]; avgDaily: number } {
  const active = days.filter((d) => d.revenueBaht > 0);
  if (active.length < 2) {
    return { hot: [], cool: [], avgDaily: 0 };
  }
  const avgDaily =
    active.reduce((s, d) => s + d.revenueBaht, 0) / active.length;
  const hotCut = avgDaily * 1.15;
  const coolCut = avgDaily * 0.85;

  function mergeRuns(
    pred: (d: ShopDailyPoint) => boolean,
    kind: "hot" | "cool",
  ): SpendDateRange[] {
    const ranges: SpendDateRange[] = [];
    let i = 0;
    while (i < days.length) {
      if (!pred(days[i]!)) {
        i += 1;
        continue;
      }
      const start = i;
      let revenue = 0;
      let orders = 0;
      while (i < days.length && pred(days[i]!)) {
        revenue += days[i]!.revenueBaht;
        orders += days[i]!.orderCount;
        i += 1;
      }
      const end = i - 1;
      const dayCount = end - start + 1;
      if (dayCount < 1) continue;
      // ช่วงสั้น 1 วันก็โชว์ได้ถ้าห่างจากค่าเฉลี่ยชัด
      ranges.push({
        from: days[start]!.date,
        to: days[end]!.date,
        fromLabel: days[start]!.label,
        toLabel: days[end]!.label,
        dayCount,
        revenueBaht: Math.round(revenue * 100) / 100,
        orderCount: orders,
        kind,
      });
    }
    return ranges
      .sort((a, b) => b.revenueBaht - a.revenueBaht)
      .slice(0, 4);
  }

  const hot = mergeRuns((d) => dayAboveThreshold(d.revenueBaht, hotCut), "hot");
  const cool = mergeRuns(
    (d) => d.revenueBaht > 0 && d.revenueBaht <= coolCut,
    "cool",
  ).sort((a, b) => a.revenueBaht - b.revenueBaht);

  return { hot, cool: cool.slice(0, 4), avgDaily: Math.round(avgDaily * 100) / 100 };
}

export function weekdayKindTone(kind: WeekdayInsightKind): {
  bar: string;
  badge: string;
  label: string;
} {
  switch (kind) {
    case "peak":
      return {
        bar: "bg-emerald-500",
        badge: "bg-emerald-100 text-emerald-900",
        label: "ขายดีที่สุด",
      };
    case "strong":
      return {
        bar: "bg-teal-500",
        badge: "bg-teal-100 text-teal-900",
        label: "ขายดี",
      };
    case "soft":
      return {
        bar: "bg-amber-400",
        badge: "bg-amber-100 text-amber-950",
        label: "ยอดอ่อน",
      };
    case "low":
      return {
        bar: "bg-rose-400",
        badge: "bg-rose-100 text-rose-900",
        label: "ควรลดเตรียม",
      };
    default:
      return {
        bar: "bg-slate-400",
        badge: "bg-slate-100 text-slate-700",
        label: "ปกติ",
      };
  }
}

export type StaffPrepTip = {
  focus: "today" | "tomorrow";
  dateKey: string;
  weekdayLabel: string;
  kind: Exclude<WeekdayInsightKind, "avg">;
  title: string;
  subtitle: string;
};

/** คำแนะนำสั้นสำหรับพนักงาน — โฟกัสพรุ่งนี้ก่อน แล้วค่อยวันนี้ */
export function buildStaffPrepTip(
  weekdays: ShopWeekdayPoint[],
  todayKey: string,
  weekdayLabelForDate: (dateKey: string) => string,
  tomorrowKey: string,
): StaffPrepTip | null {
  const insights = buildWeekdayInsights(weekdays);
  const byWd = new Map(insights.map((d) => [d.weekday, d]));

  function tipFor(
    focus: "today" | "tomorrow",
    dateKey: string,
  ): StaffPrepTip | null {
    const wd = new Date(`${dateKey}T12:00:00+07:00`).getDay();
    const insight = byWd.get(wd);
    if (!insight || insight.kind === "avg" || insight.revenueBaht <= 0) {
      return null;
    }
    if (
      insight.kind !== "peak" &&
      insight.kind !== "strong" &&
      insight.kind !== "soft" &&
      insight.kind !== "low"
    ) {
      return null;
    }
    const dayName = weekdayLabelForDate(dateKey);
    const when = focus === "tomorrow" ? "พรุ่งนี้" : "วันนี้";
    const kindLabel =
      insight.kind === "peak" || insight.kind === "strong"
        ? "มักขายดี"
        : "ยอดมักอ่อน";
    return {
      focus,
      dateKey,
      weekdayLabel: dayName,
      kind: insight.kind,
      title: `${when}${dayName} · ${kindLabel}`,
      subtitle: insight.advice,
    };
  }

  return tipFor("tomorrow", tomorrowKey) ?? tipFor("today", todayKey);
}

