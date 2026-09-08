import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";

type Params = { params: Promise<{ itemId: string }> };

const patchSchema = z.object({
  imageUrl: z.string().trim().max(2000).nullable(),
});

/** PATCH — update product image for menu or non-menu item in staff branch. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { itemId } = await params;
    await assertBrandWriteAllowedByBranchId(session.branchId);
    const body = patchSchema.parse(await request.json());
    const imageUrl = body.imageUrl?.trim() || null;

    const nonMenu = await prisma.branchNonMenuItem.findFirst({
      where: { id: itemId, branchId: session.branchId },
      select: { id: true, name: true, stockType: true, unit: true },
    });
    if (nonMenu) {
      const item = await prisma.branchNonMenuItem.update({
        where: { id: nonMenu.id },
        data: { imageUrl },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          stockType: true,
          unit: true,
        },
      });
      return jsonOk({
        item: {
          id: item.id,
          name: item.name,
          imageUrl: item.imageUrl,
          stockType: item.stockType,
          unit: item.unit,
          isMenu: false,
        },
      });
    }

    const menu = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId: session.branchId },
      select: { id: true, name: true, quantityUnit: true },
    });
    if (!menu) return jsonError("ไม่พบรายการ", 404);

    const item = await prisma.branchMenuItem.update({
      where: { id: menu.id },
      data: { imageUrl },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        quantityUnit: true,
      },
    });

    return jsonOk({
      item: {
        id: item.id,
        name: item.name,
        imageUrl: item.imageUrl,
        stockType: "SALE_ITEM" as const,
        unit: item.quantityUnit?.trim() || "ชิ้น",
        isMenu: true,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
