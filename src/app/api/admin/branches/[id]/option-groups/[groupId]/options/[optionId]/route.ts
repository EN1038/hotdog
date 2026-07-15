import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = {
  params: Promise<{ id: string; groupId: string; optionId: string }>;
};

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  priceDelta: z.number().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId, groupId, optionId } = await params;
    await requireBranchAccess(branchId);
    const option = await prisma.branchOption.findFirst({
      where: {
        id: optionId,
        groupId,
        group: { branchId },
      },
    });
    if (!option) return jsonError("ไม่พบตัวเลือก", 404);

    const body = patchSchema.parse(await request.json());
    const updated = await prisma.branchOption.update({
      where: { id: optionId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.priceDelta !== undefined && { priceDelta: body.priceDelta }),
      },
    });
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id: branchId, groupId, optionId } = await params;
    await requireBranchAccess(branchId);
    const option = await prisma.branchOption.findFirst({
      where: {
        id: optionId,
        groupId,
        group: { branchId },
      },
    });
    if (!option) return jsonError("ไม่พบตัวเลือก", 404);

    await prisma.branchOption.delete({ where: { id: optionId } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
