/** ช่วงวันที่ของเดือนสำหรับวิเคราะห์ยอดขาย */
export type DayOfMonthBucketId = "1-10" | "11-15" | "16-25" | "26-end";

export type DayOfMonthBucketDef = {
  id: DayOfMonthBucketId;
  /** ข้อความ UI เช่น วันที่ 1–10 */
  label: string;
  fromDay: number;
  /** 25 หรือ 31 — ใช้จับช่วงสิ้นเดือนตามปฏิทิน */
  toDay: number;
};

export const DAY_OF_MONTH_BUCKETS: readonly DayOfMonthBucketDef[] = [
  { id: "1-10", label: "วันที่ 1–10", fromDay: 1, toDay: 10 },
  { id: "11-15", label: "วันที่ 11–15", fromDay: 11, toDay: 15 },
  { id: "16-25", label: "วันที่ 16–25", fromDay: 16, toDay: 25 },
  { id: "26-end", label: "วันที่ 26–สิ้นเดือน", fromDay: 26, toDay: 31 },
] as const;

/** ช่วงย้อนหลังที่รองรับ (วัน) */
export const MONTH_PATTERN_PERIOD_OPTIONS = [30, 60, 90] as const;
export type MonthPatternPeriodDays = (typeof MONTH_PATTERN_PERIOD_OPTIONS)[number];
export const MONTH_PATTERN_DEFAULT_PERIOD_DAYS: MonthPatternPeriodDays = 90;

/**
 * เกณฑ์จัดช่วงขายดี/ปกติ/น้อย — สอดคล้อง buildWeekdayInsights (±15%)
 * และ buildSpendDateRanges (hot 1.15× / cool 0.85×)
 */
export const MONTH_PATTERN_CLASSIFICATION = {
  hotMinPctAboveAvg: 15,
  coolMaxPctBelowAvg: -15,
} as const;

/**
 * ขั้นต่ำข้อมูลก่อนสรุปแนวโน้ม:
 * - อย่างน้อย 14 วันที่มียอดขายในช่วงที่เลือก (~2 สัปดาห์)
 * - อย่างน้อย 2 bucket ที่มีวันขาย
 * - อย่างน้อย 2 วันขายต่อ bucket ที่จะแสดงตัวเลขเฉลี่ย
 */
export const MONTH_PATTERN_MIN_SAMPLE = {
  activeDaysTotal: 14,
  bucketsWithData: 2,
  activeDaysPerBucket: 2,
} as const;

export const MONTH_PATTERN_PRODUCT_TOP_N = 5;

export const MONTH_PATTERN_CLASSIFICATION_UI = {
  hot: { emoji: "🔥", label: "ช่วงขายดี" },
  normal: { emoji: "🙂", label: "ช่วงขายปกติ" },
  cool: { emoji: "📉", label: "ช่วงขายน้อย" },
  insufficient: { emoji: "", label: "ข้อมูลยังไม่พอ" },
} as const;
