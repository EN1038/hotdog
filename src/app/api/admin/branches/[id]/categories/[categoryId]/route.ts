import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = { params: Promise<{ id: string; categoryId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, categoryId } = await params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.menuCategory.findFirst({
      where: { id: categoryId, branchId },
    });
    if (!existing) return jsonError("ไม่พบหมวดหมู่", 404);

    if (body.name && body.name !== existing.name) {
      const dup = await prisma.menuCategory.findUnique({
        where: {
          branchId_name: { branchId, name: body.name },
        },
      });
      if (dup) return jsonError("ชื่อหมวดหมู่ซ้ำในสาขานี้");
    }

    const category = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
      include: { _count: { select: { menuItems: true } } },
    });
    return jsonOk(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, categoryId } = await params;
    const existing = await prisma.menuCategory.findFirst({
      where: { id: categoryId, branchId },
      include: { _count: { select: { menuItems: true } } },
    });
    if (!existing) return jsonError("ไม่พบหมวดหมู่", 404);

    await prisma.menuCategory.delete({ where: { id: categoryId } });
    return jsonOk({ ok: true, detachedMenuItems: existing._count.menuItems });
  } catch (error) {
    return handleApiError(error);
  }
}
