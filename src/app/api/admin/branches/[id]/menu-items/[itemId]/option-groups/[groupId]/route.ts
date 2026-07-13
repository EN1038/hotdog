import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = {
  params: Promise<{ id: string; itemId: string; groupId: string }>;
};

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  required: z.boolean().optional(),
  maxSelect: z.number().int().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

async function assertGroup(branchId: string, itemId: string, groupId: string) {
  const group = await prisma.menuOptionGroup.findFirst({
    where: { id: groupId, menuItem: { id: itemId, branchId } },
  });
  if (!group) return null;
  return group;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, itemId, groupId } = await params;
    const body = patchSchema.parse(await request.json());
    const existing = await assertGroup(branchId, itemId, groupId);
    if (!existing) return jsonError("ไม่พบกลุ่มตัวเลือก", 404);

    const updated = await prisma.menuOptionGroup.update({
      where: { id: groupId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.required !== undefined && { required: body.required }),
        ...(body.maxSelect !== undefined && { maxSelect: body.maxSelect }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    });
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, itemId, groupId } = await params;
    const existing = await assertGroup(branchId, itemId, groupId);
    if (!existing) return jsonError("ไม่พบกลุ่มตัวเลือก", 404);

    await prisma.menuOptionGroup.delete({ where: { id: groupId } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
