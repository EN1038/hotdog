export type InventoryReasonCode =
  | "SAME_WEEKDAY_HISTORY"
  | "RECENT_TREND_UP"
  | "RECENT_TREND_DOWN"
  | "INSUFFICIENT_HISTORY"
  | "PAR_FALLBACK"
  | "HIGH_DEMAND"
  | "LOW_DEMAND"
  | "BELOW_TARGET"
  | "ABOVE_TARGET"
  | "NO_PAR"
  | "PARTIAL_STOCK_TRACKING"
  | "AVG_7_FALLBACK"
  | "AVG_14_FALLBACK"
  | "AVG_30_FALLBACK"
  | "MANUAL_FALLBACK";

export const INVENTORY_REASON_LABELS: Record<InventoryReasonCode, string> = {
  SAME_WEEKDAY_HISTORY: "ใช้ค่าเฉลี่ยวันเดียวกันย้อนหลัง",
  RECENT_TREND_UP: "ยอดขาย 7 วันล่าสุดเพิ่มขึ้น",
  RECENT_TREND_DOWN: "ยอดขาย 7 วันล่าสุดลดลง",
  INSUFFICIENT_HISTORY: "ข้อมูลยอดขายยังไม่เพียงพอ",
  PAR_FALLBACK: "ใช้ Par Stock เป็นค่าอ้างอิง",
  HIGH_DEMAND: "ความต้องการสูงกว่าปกติ",
  LOW_DEMAND: "ความต้องการต่ำกว่าปกติ",
  BELOW_TARGET: "ต่ำกว่าเป้าหมายพรุ่งนี้",
  ABOVE_TARGET: "สูงกว่าเป้าหมายพรุ่งนี้",
  NO_PAR: "ยังไม่ได้ตั้ง Par Stock",
  PARTIAL_STOCK_TRACKING: "บางช่องทางไม่หักสต๊อกจริง",
  AVG_7_FALLBACK: "ใช้ค่าเฉลี่ย 7 วันล่าสุด",
  AVG_14_FALLBACK: "ใช้ค่าเฉลี่ย 14 วันล่าสุด",
  AVG_30_FALLBACK: "ใช้ค่าเฉลี่ย 30 วันล่าสุด",
  MANUAL_FALLBACK: "ใช้ค่าที่ตั้งเอง",
};

export function formatReasonLabels(codes: InventoryReasonCode[]): string[] {
  return codes.map((code) => INVENTORY_REASON_LABELS[code] ?? code);
}
