/** Client-safe expense constants (no Prisma / Zod). */

export const EXPENSE_QUICK_TITLES = [
  "ก๊าซ",
  "น้ำแข็ง",
  "ค่าน้ำ",
  "ค่าไฟ",
  "ค่าเช่า",
  "ค่าเทศกิจ",
  "ค่าทิ้งขยะ",
  "อื่นๆ",
] as const;

export type ExpensePayChannelValue = "CASH" | "TRANSFER";

export const PAY_CHANNEL_LABEL: Record<ExpensePayChannelValue, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอน",
};
