import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  expenseDateFromKey,
  expenseUpdateSchema,
  serializeExpense,
} from "@/lib/branch-expense";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";
import {
  requireOwnerBranch,
  requireOwnerSession,
} from "@/lib/owner-accounts-access";

type Params = { params: Promise<{ id: string }> };

async function findOwnerExpense(id: string, brandIds: string[]) {
  return prisma.branchExpense.findFirst({
    where: {
      id,
      branch: { brandId: { in: brandIds } },
    },
    select: { id: true, branchId: true },
  });
}

/** PATCH — update an expense in an owner brand branch. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { session, brandIds } = await requireOwnerSession();
    const { id } = await params;
    const body = expenseUpdateSchema.parse(await request.json());
    const existing = await findOwnerExpense(id, brandIds);
    if (!existing) return jsonError("ไม่พบรายการค่าใช้จ่าย", 404);
    await requireOwnerBranch(session, brandIds, existing.branchId);
    await assertBrandWriteAllowedByBranchId(existing.branchId);

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

/** DELETE — remove an expense in an owner brand branch. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { session, brandIds } = await requireOwnerSession();
    const { id } = await params;
    const existing = await findOwnerExpense(id, brandIds);
    if (!existing) return jsonError("ไม่พบรายการค่าใช้จ่าย", 404);
    await requireOwnerBranch(session, brandIds, existing.branchId);
    await assertBrandWriteAllowedByBranchId(existing.branchId);

    await prisma.branchExpense.delete({ where: { id: existing.id } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
