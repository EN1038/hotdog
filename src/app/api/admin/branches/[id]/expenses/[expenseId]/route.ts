import { prisma } from "@/lib/db";
import { requireBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  expenseDateFromKey,
  expenseUpdateSchema,
  serializeExpense,
} from "@/lib/branch-expense";

type Params = { params: Promise<{ id: string; expenseId: string }> };

/** PATCH — admin updates an expense. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId, expenseId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = expenseUpdateSchema.parse(await request.json());

    const existing = await prisma.branchExpense.findFirst({
      where: { id: expenseId, branchId },
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

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `แก้ไขค่าใช้จ่าย: ${updated.title}`,
      brandId: null,
      branchId,
      entityType: "BRANCH_EXPENSE",
      entityId: updated.id,
      entityName: updated.title,
    });

    return jsonOk({ expense: serializeExpense(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE — admin deletes an expense. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id: branchId, expenseId } = await params;
    const { session } = await requireBranchAccess(branchId);

    const existing = await prisma.branchExpense.findFirst({
      where: { id: expenseId, branchId },
    });
    if (!existing) return jsonError("ไม่พบรายการค่าใช้จ่าย", 404);

    await prisma.branchExpense.delete({ where: { id: existing.id } });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `ลบค่าใช้จ่าย: ${existing.title}`,
      brandId: null,
      branchId,
      entityType: "BRANCH_EXPENSE",
      entityId: existing.id,
      entityName: existing.title,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
