import { prisma } from "@/lib/db";
import { requireBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
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

type Params = { params: Promise<{ id: string }> };

/** GET — list expenses for a branch/date. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const channel = searchParams.get("payChannel");
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

    let dateFilter: { gte?: Date; lte?: Date } = {};
    if (
      fromParam &&
      isBangkokDateKey(fromParam) &&
      toParam &&
      isBangkokDateKey(toParam)
    ) {
      dateFilter = {
        gte: expenseDateFromKey(fromParam),
        lte: new Date(`${toParam}T23:59:59.999+07:00`),
      };
    } else {
      const dateKey =
        dateParam && isBangkokDateKey(dateParam)
          ? dateParam
          : bangkokDateKey();
      dateFilter = {
        gte: expenseDateFromKey(dateKey),
        lte: new Date(`${dateKey}T23:59:59.999+07:00`),
      };
    }

    const rows = await prisma.branchExpense.findMany({
      where: {
        branchId,
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
      expenses,
      summary: summarizeExpenses(expenses),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — admin creates an expense. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = expenseCreateSchema.parse(await request.json());
    const activeShift = await getActiveShift(branchId);

    const created = await prisma.branchExpense.create({
      data: {
        branchId,
        shiftId: activeShift?.id ?? null,
        title: body.title,
        amount: body.amount,
        paymentMode: "IMMEDIATE",
        schedule: null,
        payChannel: body.payChannel,
        expenseDate: expenseDateFromKey(body.expenseDate),
        note: body.note?.trim() || null,
        createdByAdminId: session.adminId,
      },
      include: {
        createdByStaff: { select: { name: true } },
        createdByAdmin: { select: { username: true } },
      },
    });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `บันทึกค่าใช้จ่าย: ${created.title} ฿${Number(created.amount).toLocaleString("th-TH")}`,
      brandId: null,
      branchId,
      entityType: "BRANCH_EXPENSE",
      entityId: created.id,
      entityName: created.title,
    });

    return jsonOk({ expense: serializeExpense(created) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
