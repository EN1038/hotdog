/** Client-safe income constants (no Prisma / Zod). */

export const INCOME_QUICK_TITLES = [
  "เงินทุนหมุนเวียน",
  "รับจากเจ้าของ",
  "รับคืนเงิน",
  "อื่นๆ",
] as const;

export type IncomePayChannelValue = "CASH" | "TRANSFER";

export const INCOME_PAY_CHANNEL_LABEL: Record<IncomePayChannelValue, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอน",
};
