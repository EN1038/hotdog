import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  bangkokDateKey,
  isBangkokDateKey,
} from "@/lib/constants";
import {
  expenseDateFromKey,
  expenseDateKey,
  summarizeExpenses,
} from "@/lib/branch-expense";
import { summarizeIncomes } from "@/lib/branch-income";
import {
  requireOwnerBranch,
  requireOwnerSession,
} from "@/lib/owner-accounts-access";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

type PayChannel = "CASH" | "TRANSFER";

/** GET — owner accounts summary for one branch. */
export async function GET(request: Request) {
  try {
    const { session, brandIds } = await requireOwnerSession();
    await ensureProdSchemaCompat().catch(() => null);
    const { searchParams } = new URL(request.url);
    const branch = await requireOwnerBranch(
      session,
      brandIds,
      searchParams.get("branchId"),
    );

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
          branchId: branch.id,
          expenseDate: { gte: dateGte, lte: dateLte },
        },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        include: {
          createdByStaff: { select: { name: true } },
          createdByAdmin: { select: { username: true } },
        },
      }),
      prisma.branchIncome.findMany({
        where: {
          branchId: branch.id,
          incomeDate: { gte: dateGte, lte: dateLte },
        },
        orderBy: [{ incomeDate: "desc" }, { createdAt: "desc" }],
        include: {
          createdByStaff: { select: { name: true } },
          createdByAdmin: { select: { username: true } },
        },
      }),
    ]);

    const expenses = expenseRows.map((r) => ({
      amount: Number(r.amount),
      payChannel: r.payChannel as PayChannel,
    }));
    const incomes = incomeRows.map((r) => ({
      amount: Number(r.amount),
      payChannel: r.payChannel as PayChannel,
    }));

    const expenseSummary = summarizeExpenses(expenses);
    const incomeSummary = summarizeIncomes(incomes);
    const net = incomeSummary.total - expenseSummary.total;

    const entries = [
      ...incomeRows.map((r) => ({
        kind: "income" as const,
        id: r.id,
        title: r.title,
        amount: Number(r.amount),
        payChannel: r.payChannel as PayChannel,
        date: expenseDateKey(r.incomeDate),
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        createdByStaff: r.createdByStaff
          ? { name: r.createdByStaff.name }
          : null,
        createdByAdmin: r.createdByAdmin
          ? { username: r.createdByAdmin.username }
          : null,
      })),
      ...expenseRows.map((r) => ({
        kind: "expense" as const,
        id: r.id,
        title: r.title,
        amount: Number(r.amount),
        payChannel: r.payChannel as PayChannel,
        date: expenseDateKey(r.expenseDate),
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        createdByStaff: r.createdByStaff
          ? { name: r.createdByStaff.name }
          : null,
        createdByAdmin: r.createdByAdmin
          ? { username: r.createdByAdmin.username }
          : null,
      })),
    ].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });

    return jsonOk({
      from: fromKey,
      to: toKey,
      branchId: branch.id,
      branchName: branch.name,
      brandName: branch.brand?.name ?? "",
      income: incomeSummary,
      expense: expenseSummary,
      net,
      cashNet: incomeSummary.cash - expenseSummary.cash,
      transferNet: incomeSummary.transfer - expenseSummary.transfer,
      entries,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
