/**
 * Cuisine group: counter queue + optional weigh
 * (หม่าล่า · ปิ้ง · ทอด · ชาบู · ชั่งกิโล)
 */
export const HOTPOT_COUNTER_GROUP = {
  shortLabel: "หม่าล่า · ปิ้ง · ทอด · ชาบู",
  withWeighLabel: "หม่าล่า · ปิ้ง · ทอด · ชาบู + ชั่งกิโล",
  staffMalaTab: "คิว / เคาน์เตอร์",
  staffWeighTab: "ชั่งกิโล",
  modeTitle: "คิวเคาน์เตอร์",
  modeDescription:
    "หม่าล่า · ปิ้ง · ทอด · ชาบู — คีย์ออเดอร์ · คิว · กะ · หน้าร้านลูกค้า · เปิดชั่งกิโลคู่ได้",
  weighAddonTitle: "รวมขายชั่งกิโลในสาขานี้",
  weighAddonHint:
    "พนักงานสลับคิวเคาน์เตอร์ ↔ ชั่งกิโลในบัญชีเดียว · โต๊ะ QR / ซื้อกลับบ้าน",
} as const;

/** Restaurant type codes that fit this sales group */
export const HOTPOT_COUNTER_TYPE_CODES = [
  "mala",
  "bbq",
  "fried",
  "shabu",
] as const;
