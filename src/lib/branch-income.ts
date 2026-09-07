import { z } from "zod";
import { isBangkokDateKey } from "@/lib/constants";
import {
  expenseDateFromKey,
  expenseDateKey,
} from "@/lib/branch-expense";
import {
  INCOME_QUICK_TITLES,
  INCOME_PAY_CHANNEL_LABEL,
  type IncomePayChannelValue,
} from "@/lib/branch-income-ui";

export type { IncomePayChannelValue };

export const incomeCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  amount: z.number().finite().positive().max(10_000_000),
  payChannel: z.enum(["CASH", "TRANSFER"]).default("CASH"),
  incomeDate: z
    .string()
    .refine(isBangkokDateKey, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)"),
  note: z.string().trim().max(500).nullable().optional(),
});

export const incomeUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  amount: z.number().finite().positive().max(10_000_000).optional(),
  payChannel: z.enum(["CASH", "TRANSFER"]).optional(),
  incomeDate: z
    .string()
    .refine(isBangkokDateKey, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)")
    .optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export type IncomeCreateInput = z.infer<typeof incomeCreateSchema>;
export type IncomeUpdateInput = z.infer<typeof incomeUpdateSchema>;

export const incomeDateFromKey = expenseDateFromKey;
export const incomeDateKey = expenseDateKey;

export function serializeIncome<
  T extends {
    id: string;
    branchId: string;
    shiftId: string | null;
    title: string;
    amount: { toString(): string } | number;
    payChannel: IncomePayChannelValue;
    incomeDate: Date;
    note: string | null;
    createdByStaffId: string | null;
    createdByAdminId: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdByStaff?: { name: string | null } | null;
    createdByAdmin?: { username: string } | null;
  },
>(row: T) {
  return {
    id: row.id,
    branchId: row.branchId,
    shiftId: row.shiftId,
    title: row.title,
    amount: Number(row.amount),
    payChannel: row.payChannel,
    incomeDate: incomeDateKey(row.incomeDate),
    note: row.note,
    createdByStaffId: row.createdByStaffId,
    createdByAdminId: row.createdByAdminId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByStaff: row.createdByStaff
      ? { name: row.createdByStaff.name }
      : null,
    createdByAdmin: row.createdByAdmin
      ? { username: row.createdByAdmin.username }
      : null,
  };
}

export function summarizeIncomes(
  rows: Array<{ amount: number; payChannel: IncomePayChannelValue }>,
) {
  let total = 0;
  let cash = 0;
  let transfer = 0;
  for (const row of rows) {
    total += row.amount;
    if (row.payChannel === "TRANSFER") transfer += row.amount;
    else cash += row.amount;
  }
  return {
    count: rows.length,
    total,
    cash,
    transfer,
  };
}

export { INCOME_QUICK_TITLES, INCOME_PAY_CHANNEL_LABEL };
