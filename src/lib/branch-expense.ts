import { z } from "zod";
import { isBangkokDateKey } from "@/lib/constants";

import {
  EXPENSE_QUICK_TITLES,
  PAY_CHANNEL_LABEL,
  type ExpensePayChannelValue,
} from "@/lib/branch-expense-ui";

export const EXPENSE_PAY_CHANNELS = ["CASH", "TRANSFER"] as const;

export type { ExpensePayChannelValue };

export const expenseCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  amount: z.number().finite().positive().max(10_000_000),
  payChannel: z.enum(["CASH", "TRANSFER"]).default("CASH"),
  expenseDate: z
    .string()
    .refine(isBangkokDateKey, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)"),
  note: z.string().trim().max(500).nullable().optional(),
});

export const expenseUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  amount: z.number().finite().positive().max(10_000_000).optional(),
  payChannel: z.enum(["CASH", "TRANSFER"]).optional(),
  expenseDate: z
    .string()
    .refine(isBangkokDateKey, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)")
    .optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;

export function expenseDateFromKey(dateKey: string): Date {
  // @db.Date must be calendar day, not local evening Instant (avoids off-by-one)
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function expenseDateKey(date: Date | string): string {
  if (typeof date === "string") {
    const m = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    date = new Date(date);
  }
  // Prefer UTC calendar day (Prisma Date typically midnight UTC for @db.Date)
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function serializeExpense<
  T extends {
    id: string;
    branchId: string;
    shiftId: string | null;
    title: string;
    amount: { toString(): string } | number;
    payChannel: ExpensePayChannelValue;
    expenseDate: Date;
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
    expenseDate: expenseDateKey(row.expenseDate),
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

export function summarizeExpenses(
  rows: Array<{ amount: number; payChannel: ExpensePayChannelValue }>,
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

export { EXPENSE_QUICK_TITLES, PAY_CHANNEL_LABEL };
