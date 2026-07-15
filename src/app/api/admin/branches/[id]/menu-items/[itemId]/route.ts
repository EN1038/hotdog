import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string; itemId: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  description: z.string().optional().nullable(),
  categoryId: z.string().nullable().optional(),
  imageUrl: z.string().optional().nullable(),
  isHidden: z.boolean().optional(),
  isOutOfStock: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  optionGroupIds: z.array(z.string()).optional(),
});

const itemInclude = {
  category: { select: { id: true, name: true, sortOrder: true } },
  ...menuItemOptionGroupInclude,
} as const;

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId, itemId } = await params;
    await requireBranchAccess(branchId);
    const item = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
      include: itemInclude,
    });
    if (!item) return jsonError("ไม่พบเมนู", 404);
    return jsonOk(flattenMenuItemOptionGroups(item));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId, itemId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
    });
    if (!existing) return jsonError("ไม่พบเมนู", 404);

    if (body.categoryId) {
      const cat = await prisma.menuCategory.findFirst({
        where: { id: body.categoryId, branchId },
      });
      if (!cat) return jsonError("ไม่พบหมวดหมู่", 404);
    }

    if (body.optionGroupIds) {
      if (body.optionGroupIds.length > 0) {
        const groups = await prisma.branchOptionGroup.findMany({
          where: { id: { in: body.optionGroupIds }, branchId },
          select: { id: true },
        });
        if (groups.length !== body.optionGroupIds.length) {
          return jsonError("มีหัวข้อตัวเลือกที่ไม่ใช่ของสาขานี้");
        }
      }
      await prisma.$transaction(async (tx) => {
        await tx.branchMenuItemOptionGroup.deleteMany({
          where: { menuItemId: itemId },
        });
        if (body.optionGroupIds!.length > 0) {
          await tx.branchMenuItemOptionGroup.createMany({
            data: body.optionGroupIds!.map((groupId) => ({
              menuItemId: itemId,
              groupId,
            })),
          });
        }
      });
    }

    const updated = await prisma.branchMenuItem.update({
      where: { id: itemId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
        ...(body.isHidden !== undefined && { isHidden: body.isHidden }),
        ...(body.isOutOfStock !== undefined && {
          isOutOfStock: body.isOutOfStock,
        }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
      include: itemInclude,
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "menu.update",
      summary: `แก้ไขเมนู ${updated.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "menu",
      entityId: updated.id,
      entityName: updated.name,
      metadata: { fields: Object.keys(body) },
    });

    return jsonOk(flattenMenuItemOptionGroups(updated));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id: branchId, itemId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const existing = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
    });
    if (!existing) return jsonError("ไม่พบเมนู", 404);

    const ctx = await getBranchActivityContext(branchId);
    await prisma.branchMenuItem.delete({ where: { id: itemId } });

    await logAdminActivity(session, {
      action: "menu.delete",
      summary: `ลบเมนู ${existing.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "menu",
      entityId: existing.id,
      entityName: existing.name,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
