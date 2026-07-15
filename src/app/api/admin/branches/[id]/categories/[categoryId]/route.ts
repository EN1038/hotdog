import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string; categoryId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId, categoryId } = await params;
    await requireBranchAccess(branchId);
    const category = await prisma.menuCategory.findFirst({
      where: { id: categoryId, branchId },
      include: {
        _count: { select: { menuItems: true } },
        menuItems: {
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!category) return jsonError("ไม่พบหมวดหมู่", 404);
    return jsonOk(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId, categoryId } = await params;
    const { session } = await requireBranchAccess(branchId);
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

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "category.update",
      summary: `แก้ไขหมวดหมู่ ${category.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "category",
      entityId: category.id,
      entityName: category.name,
    });

    return jsonOk(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id: branchId, categoryId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const existing = await prisma.menuCategory.findFirst({
      where: { id: categoryId, branchId },
      include: { _count: { select: { menuItems: true } } },
    });
    if (!existing) return jsonError("ไม่พบหมวดหมู่", 404);

    const ctx = await getBranchActivityContext(branchId);
    await prisma.menuCategory.delete({ where: { id: categoryId } });

    await logAdminActivity(session, {
      action: "category.delete",
      summary: `ลบหมวดหมู่ ${existing.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "category",
      entityId: existing.id,
      entityName: existing.name,
    });

    return jsonOk({ ok: true, detachedMenuItems: existing._count.menuItems });
  } catch (error) {
    return handleApiError(error);
  }
}
