import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  incomeDateFromKey,
  incomeUpdateSchema,
  serializeIncome,
} from "@/lib/branch-income";

type Params = { params: Promise<{ id: string }> };

/** PATCH — update an income in the staff's branch. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    const body = incomeUpdateSchema.parse(await request.json());

    const existing = await prisma.branchIncome.findFirst({
      where: { id, branchId: session.branchId },
    });
    if (!existing) return jsonError("ไม่พบรายการรายรับ", 404);

    const updated = await prisma.branchIncome.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.payChannel !== undefined
          ? { payChannel: body.payChannel }
          : {}),
        ...(body.incomeDate !== undefined
          ? { incomeDate: incomeDateFromKey(body.incomeDate) }
          : {}),
        ...(body.note !== undefined
          ? { note: body.note?.trim() || null }
          : {}),
      },
      include: {
        createdByStaff: { select: { name: true } },
        createdByAdmin: { select: { username: true } },
      },
    });

    return jsonOk({ income: serializeIncome(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE — remove an income in the staff's branch. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;

    const existing = await prisma.branchIncome.findFirst({
      where: { id, branchId: session.branchId },
    });
    if (!existing) return jsonError("ไม่พบรายการรายรับ", 404);

    await prisma.branchIncome.delete({ where: { id: existing.id } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
