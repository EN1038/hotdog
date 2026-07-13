import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = {
  params: Promise<{ id: string; itemId: string; optionId: string }>;
};

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  priceDelta: z.number().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, itemId, optionId } = await params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.menuOption.findFirst({
      where: {
        id: optionId,
        group: { menuItem: { id: itemId, branchId } },
      },
    });
    if (!existing) return jsonError("ไม่พบตัวเลือก", 404);

    const updated = await prisma.menuOption.update({
      where: { id: optionId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.priceDelta !== undefined && { priceDelta: body.priceDelta }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
    });
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, itemId, optionId } = await params;
    const existing = await prisma.menuOption.findFirst({
      where: {
        id: optionId,
        group: { menuItem: { id: itemId, branchId } },
      },
    });
    if (!existing) return jsonError("ไม่พบตัวเลือก", 404);

    await prisma.menuOption.delete({ where: { id: optionId } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
