import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";

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
    await requireAdmin();
    const { id: branchId, itemId } = await params;
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
    await requireAdmin();
    const { id: branchId, itemId } = await params;
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
    return jsonOk(flattenMenuItemOptionGroups(updated));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, itemId } = await params;
    const existing = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
    });
    if (!existing) return jsonError("ไม่พบเมนู", 404);

    await prisma.branchMenuItem.delete({ where: { id: itemId } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
