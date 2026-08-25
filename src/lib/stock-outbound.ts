/**
 * สาขา FOH — ประเภทจ่ายออก
 * - ของเสีย → DAMAGE (นับในกลุ่มของเสีย; LOST รองรับช่องทางอื่น)
 * - จ่ายออกจากสต๊อก → ISSUE (เบิกใช้ / ส่งออกที่ไม่ใช่ของเสีย)
 */

export type StockOutboundPurpose = "waste" | "stock_out";

export const STOCK_OUTBOUND_PURPOSE_LABEL: Record<
  StockOutboundPurpose,
  { title: string; hint: string; apiAction: "damage" | "issue" }
> = {
  waste: {
    title: "ของเสีย",
    hint: "ชำรุด · ทำหล่น · ใช้ไม่ได้ — นับในกลุ่มของเสีย",
    apiAction: "damage",
  },
  stock_out: {
    title: "จ่ายออกจากสต๊อก",
    hint: "เบิกใช้ · ส่งออก · เปลี่ยนของ — ไม่ใช่ของเสีย",
    apiAction: "issue",
  },
};

/** ประวัติที่นับเป็นของเสียในรายงาน */
export const BRANCH_WASTE_HISTORY_TYPES = ["DAMAGE", "LOST"] as const;

/** ประวัติจ่ายออกจากสต๊อก */
export const BRANCH_STOCK_OUT_HISTORY_TYPES = ["ISSUE"] as const;

/** รวมรายการออกจากสต๊อกทั้งหมด (ประวัติจ่ายออก) */
export const BRANCH_OUTBOUND_HISTORY_TYPES = [
  "ISSUE",
  "DAMAGE",
  "LOST",
] as const;

export function outboundHistoryLabel(type: string): string {
  if (type === "DAMAGE") return "ของเสีย · ชำรุด";
  if (type === "LOST") return "ของเสีย · สูญหาย";
  if (type === "ISSUE") return "จ่ายออกจากสต๊อก";
  return type;
}

export function isBranchWasteHistoryType(type: string): boolean {
  return type === "DAMAGE" || type === "LOST";
}
