import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  bangkokDateKey,
  isBangkokDateKey,
} from "@/lib/constants";
import { expenseDateFromKey, summarizeExpenses } from "@/lib/branch-expense";
import { summarizeIncomes } from "@/lib/branch-income";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

/** GET — accounts dashboard totals (manual income + expense only). */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    await ensureProdSchemaCompat().catch(() => null);
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const today = bangkokDateKey();

    let fromKey = today;
    let toKey = today;
    if (
      fromParam &&
      isBangkokDateKey(fromParam) &&
      toParam &&
      isBangkokDateKey(toParam)
    ) {
      fromKey = fromParam <= toParam ? fromParam : toParam;
      toKey = fromParam <= toParam ? toParam : fromParam;
    }

    const dateGte = expenseDateFromKey(fromKey);
    const dateLte = new Date(`${toKey}T23:59:59.999+07:00`);

    const [expenseRows, incomeRows] = await Promise.all([
      prisma.branchExpense.findMany({
        where: {
          branchId: session.branchId,
          expenseDate: { gte: dateGte, lte: dateLte },
        },
        select: { amount: true, payChannel: true },
      }),
      prisma.branchIncome.findMany({
        where: {
          branchId: session.branchId,
          incomeDate: { gte: dateGte, lte: dateLte },
        },
        select: { amount: true, payChannel: true },
      }),
    ]);

    const expenses = expenseRows.map((r) => ({
      amount: Number(r.amount),
      payChannel: r.payChannel,
    }));
    const incomes = incomeRows.map((r) => ({
      amount: Number(r.amount),
      payChannel: r.payChannel,
    }));

    const expenseSummary = summarizeExpenses(expenses);
    const incomeSummary = summarizeIncomes(incomes);
    const net = incomeSummary.total - expenseSummary.total;

    return jsonOk({
      from: fromKey,
      to: toKey,
      income: incomeSummary,
      expense: expenseSummary,
      net,
      cashNet: incomeSummary.cash - expenseSummary.cash,
      transferNet: incomeSummary.transfer - expenseSummary.transfer,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
