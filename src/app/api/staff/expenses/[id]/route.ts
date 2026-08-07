import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  expenseDateFromKey,
  expenseUpdateSchema,
  serializeExpense,
} from "@/lib/branch-expense";

type Params = { params: Promise<{ id: string }> };

/** PATCH — update an expense in the staff's branch. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    const body = expenseUpdateSchema.parse(await request.json());

    const existing = await prisma.branchExpense.findFirst({
      where: { id, branchId: session.branchId },
    });
    if (!existing) return jsonError("ไม่พบรายการค่าใช้จ่าย", 404);

    const updated = await prisma.branchExpense.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.payChannel !== undefined
          ? { payChannel: body.payChannel }
          : {}),
        ...(body.expenseDate !== undefined
          ? { expenseDate: expenseDateFromKey(body.expenseDate) }
          : {}),
        ...(body.note !== undefined
          ? { note: body.note?.trim() || null }
          : {}),
        paymentMode: "IMMEDIATE",
        schedule: null,
      },
      include: {
        createdByStaff: { select: { name: true } },
        createdByAdmin: { select: { username: true } },
      },
    });

    return jsonOk({ expense: serializeExpense(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE — remove an expense in the staff's branch. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;

    const existing = await prisma.branchExpense.findFirst({
      where: { id, branchId: session.branchId },
    });
    if (!existing) return jsonError("ไม่พบรายการค่าใช้จ่าย", 404);

    await prisma.branchExpense.delete({ where: { id: existing.id } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
