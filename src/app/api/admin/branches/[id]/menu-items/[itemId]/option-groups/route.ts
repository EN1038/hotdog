import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";

type Params = { params: Promise<{ id: string; itemId: string }> };

const putSchema = z.object({
  groupIds: z.array(z.string()),
});

const itemInclude = {
  category: { select: { id: true, name: true, sortOrder: true } },
  ...menuItemOptionGroupInclude,
} as const;

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id: branchId, itemId } = await params;
    await requireBranchAccess(branchId);
    const body = putSchema.parse(await request.json());

    const item = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
    });
    if (!item) return jsonError("ไม่พบเมนู", 404);

    if (body.groupIds.length > 0) {
      const groups = await prisma.branchOptionGroup.findMany({
        where: { id: { in: body.groupIds }, branchId },
        select: { id: true },
      });
      if (groups.length !== body.groupIds.length) {
        return jsonError("มีหัวข้อตัวเลือกที่ไม่ใช่ของสาขานี้");
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.branchMenuItemOptionGroup.deleteMany({
        where: { menuItemId: itemId },
      });
      if (body.groupIds.length > 0) {
        await tx.branchMenuItemOptionGroup.createMany({
          data: body.groupIds.map((groupId) => ({
            menuItemId: itemId,
            groupId,
          })),
        });
      }
    });

    const updated = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
      include: itemInclude,
    });
    if (!updated) return jsonError("ไม่พบเมนู", 404);
    return jsonOk(flattenMenuItemOptionGroups(updated));
  } catch (error) {
    return handleApiError(error);
  }
}
