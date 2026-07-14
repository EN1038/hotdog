import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { branchOptionGroupInclude } from "@/lib/menu-option-groups";

type Params = { params: Promise<{ id: string; groupId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  required: z.boolean().optional(),
  maxSelect: z.number().int().min(1).optional(),
});

async function findBranchGroup(branchId: string, groupId: string) {
  return prisma.branchOptionGroup.findFirst({
    where: { id: groupId, branchId },
    include: branchOptionGroupInclude,
  });
}

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, groupId } = await params;
    const group = await findBranchGroup(branchId, groupId);
    if (!group) return jsonError("ไม่พบหัวข้อตัวเลือก", 404);
    return jsonOk(group);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, groupId } = await params;
    const existing = await findBranchGroup(branchId, groupId);
    if (!existing) return jsonError("ไม่พบหัวข้อตัวเลือก", 404);

    const body = patchSchema.parse(await request.json());
    const group = await prisma.branchOptionGroup.update({
      where: { id: groupId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.required !== undefined && { required: body.required }),
        ...(body.maxSelect !== undefined && { maxSelect: body.maxSelect }),
      },
      include: branchOptionGroupInclude,
    });
    return jsonOk(group);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, groupId } = await params;
    const existing = await findBranchGroup(branchId, groupId);
    if (!existing) return jsonError("ไม่พบหัวข้อตัวเลือก", 404);

    await prisma.branchOptionGroup.delete({ where: { id: groupId } });
    return jsonOk({
      ok: true,
      detachedMenuItems: existing._count.menuItemLinks,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
