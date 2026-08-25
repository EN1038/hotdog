import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { getActiveShift } from "@/lib/branch-shift";
import {
  bangkokDateKey,
  isBangkokDateKey,
} from "@/lib/constants";
import {
  expenseCreateSchema,
  expenseDateFromKey,
  serializeExpense,
  summarizeExpenses,
} from "@/lib/branch-expense";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";

/** GET — list branch expenses for a date range (default today → today). */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const channel = searchParams.get("payChannel");
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
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
    } else if (dateParam && isBangkokDateKey(dateParam)) {
      fromKey = dateParam;
      toKey = dateParam;
    }

    const dateFilter = {
      gte: expenseDateFromKey(fromKey),
      lte: new Date(`${toKey}T23:59:59.999+07:00`),
    };

    const rows = await prisma.branchExpense.findMany({
      where: {
        branchId: session.branchId,
        expenseDate: dateFilter,
        ...(channel === "CASH" || channel === "TRANSFER"
          ? { payChannel: channel }
          : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { note: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      include: {
        createdByStaff: { select: { name: true } },
        createdByAdmin: { select: { username: true } },
      },
    });

    const expenses = rows.map(serializeExpense);
    return jsonOk({
      from: fromKey,
      to: toKey,
      date: fromKey === toKey ? fromKey : undefined,
      expenses,
      summary: summarizeExpenses(expenses),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — create an expense for the staff branch. */
export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    await assertBrandWriteAllowedByBranchId(session.branchId);
    const body = expenseCreateSchema.parse(await request.json());
    const activeShift = await getActiveShift(session.branchId);

    const created = await prisma.branchExpense.create({
      data: {
        branchId: session.branchId,
        shiftId: activeShift?.id ?? null,
        title: body.title,
        amount: body.amount,
        paymentMode: "IMMEDIATE",
        schedule: null,
        payChannel: body.payChannel,
        expenseDate: expenseDateFromKey(body.expenseDate),
        note: body.note?.trim() || null,
        createdByStaffId: session.staffId,
      },
      include: {
        createdByStaff: { select: { name: true } },
        createdByAdmin: { select: { username: true } },
      },
    });

    return jsonOk({ expense: serializeExpense(created) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
