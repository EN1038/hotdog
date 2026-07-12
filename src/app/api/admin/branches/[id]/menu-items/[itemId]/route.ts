import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = { params: Promise<{ id: string; itemId: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  description: z.string().optional().nullable(),
  isHidden: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, itemId } = await params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
    });
    if (!existing) return jsonError("ไม่พบเมนู", 404);

    const updated = await prisma.branchMenuItem.update({
      where: { id: itemId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.isHidden !== undefined && { isHidden: body.isHidden }),
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

