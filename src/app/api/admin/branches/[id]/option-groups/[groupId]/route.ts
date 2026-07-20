import { OptionGroupMode } from "@prisma/client";
import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { branchOptionGroupInclude } from "@/lib/menu-option-groups";

type Params = { params: Promise<{ id: string; groupId: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    required: z.boolean().optional(),
    minSelect: z.number().int().min(0).optional(),
    maxSelect: z.number().int().min(1).optional(),
    mode: z.nativeEnum(OptionGroupMode).optional(),
    allowDuplicateSelections: z.boolean().optional(),
    menuItemIds: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    const min = data.minSelect;
    const max = data.maxSelect;
    if (min != null && max != null && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "จำนวนขั้นต่ำต้องไม่เกินจำนวนสูงสุด",
        path: ["minSelect"],
      });
    }
  });

async function findBranchGroup(branchId: string, groupId: string) {
  return prisma.branchOptionGroup.findFirst({
    where: { id: groupId, branchId },
    include: branchOptionGroupInclude,
  });
}

async function replaceMenuSources(groupId: string, menuItemIds: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.branchOptionGroupMenuItem.deleteMany({ where: { groupId } });
    if (menuItemIds.length === 0) return;
    await tx.branchOptionGroupMenuItem.createMany({
      data: menuItemIds.map((menuItemId, index) => ({
        groupId,
        menuItemId,
        sortOrder: index,
        isEnabled: true,
      })),
    });
  });
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId, groupId } = await params;
    await requireBranchAccess(branchId);
    const group = await findBranchGroup(branchId, groupId);
    if (!group) return jsonError("ไม่พบหัวข้อตัวเลือก", 404);
    return jsonOk(group);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId, groupId } = await params;
    await requireBranchAccess(branchId);
    const existing = await findBranchGroup(branchId, groupId);
    if (!existing) return jsonError("ไม่พบหัวข้อตัวเลือก", 404);

    const body = patchSchema.parse(await request.json());

    if (body.menuItemIds) {
      const menus = await prisma.branchMenuItem.findMany({
        where: { branchId, id: { in: body.menuItemIds } },
        select: { id: true },
      });
      if (menus.length !== body.menuItemIds.length) {
        return jsonError("มีเมนูที่ไม่ใช่ของสาขานี้");
      }
      await replaceMenuSources(groupId, body.menuItemIds);
    }

    const group = await prisma.branchOptionGroup.update({
      where: { id: groupId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.required !== undefined && { required: body.required }),
        ...(body.minSelect !== undefined && { minSelect: body.minSelect }),
        ...(body.maxSelect !== undefined && { maxSelect: body.maxSelect }),
        ...(body.mode !== undefined && { mode: body.mode }),
        ...(body.allowDuplicateSelections !== undefined && {
          allowDuplicateSelections: body.allowDuplicateSelections,
        }),
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
    const { id: branchId, groupId } = await params;
    await requireBranchAccess(branchId);
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
