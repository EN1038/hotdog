/** จังหวะนับสต๊อก — คนละขั้นกับประเภทเมนูขาย/ของสิ้นเปลือง/อุปกรณ์ */
export const STOCK_COUNT_TIMINGS = [
  "BEFORE_OPEN",
  "AFTER_CLOSE",
  "RECHECK",
] as const;

export type StockCountTiming = (typeof STOCK_COUNT_TIMINGS)[number];

/** ค่าเริ่มต้น + รายการเก่ายังไม่ระบุจังหวะ */
export const DEFAULT_STOCK_COUNT_TIMING: StockCountTiming = "AFTER_CLOSE";

export const STOCK_COUNT_TIMING_LABEL: Record<StockCountTiming, string> = {
  BEFORE_OPEN: "ก่อนเปิด",
  AFTER_CLOSE: "หลังปิด",
  RECHECK: "รีเช็ค",
};

export const STOCK_COUNT_TIMING_OPTIONS: Array<{
  value: StockCountTiming;
  label: string;
  hint: string;
}> = [
  {
    value: "BEFORE_OPEN",
    label: "ก่อนเปิดรอบ",
    hint: "นับก่อนเริ่มขาย / เปิดรอบ",
  },
  {
    value: "AFTER_CLOSE",
    label: "หลังปิดรอบ",
    hint: "นับเมื่อปิดรอบหรือสิ้นวัน (ค่าเริ่มต้น)",
  },
  {
    value: "RECHECK",
    label: "รีเช็ค",
    hint: "นับซ้ำกลางวันหรือเมื่อสงสัยตัวเลข",
  },
];

export function isStockCountTiming(value: unknown): value is StockCountTiming {
  return (
    typeof value === "string" &&
    (STOCK_COUNT_TIMINGS as readonly string[]).includes(value)
  );
}

export function stockCountTimingLabel(
  value: string | null | undefined,
): string | null {
  if (!isStockCountTiming(value)) return null;
  return STOCK_COUNT_TIMING_LABEL[value];
}

/** อ่านจังหวะจาก note/ชื่อ — ไม่มีให้ถือเป็นหลังปิด */
export function resolveStockCountTiming(input: {
  timing?: unknown;
  name?: string | null;
}): StockCountTiming {
  if (isStockCountTiming(input.timing)) return input.timing;
  const name = input.name ?? "";
  if (name.includes("ก่อนเปิด")) return "BEFORE_OPEN";
  if (name.includes("หลังปิด")) return "AFTER_CLOSE";
  if (name.includes("รีเช็ค")) return "RECHECK";
  return DEFAULT_STOCK_COUNT_TIMING;
}
