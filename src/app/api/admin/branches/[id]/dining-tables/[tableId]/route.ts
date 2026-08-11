import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireBbqWeighBranch } from "@/lib/bbq-branch";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string; tableId: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId, tableId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const gate = await requireBbqWeighBranch(branchId);
    if ("error" in gate && gate.error) return gate.error;

    const existing = await prisma.diningTable.findFirst({
      where: { id: tableId, branchId },
    });
    if (!existing) return jsonError("ไม่พบโต๊ะ", 404);

    const body = patchSchema.parse(await request.json());
    const table = await prisma.diningTable.update({
      where: { id: tableId },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "bbq.table.update",
      summary: `แก้โต๊ะ ${table.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "dining_table",
      entityId: table.id,
      entityName: table.name,
    });

    return jsonOk(table);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id: branchId, tableId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const gate = await requireBbqWeighBranch(branchId);
    if ("error" in gate && gate.error) return gate.error;

    const existing = await prisma.diningTable.findFirst({
      where: { id: tableId, branchId },
      include: {
        sessions: { where: { status: "OPEN" }, select: { id: true }, take: 1 },
      },
    });
    if (!existing) return jsonError("ไม่พบโต๊ะ", 404);
    if (existing.sessions.length > 0) {
      return jsonError("มีบิลเปิดอยู่ — ปิดบิลก่อนหรือปิดการใช้งานโต๊ะแทน");
    }

    await prisma.diningTable.delete({ where: { id: tableId } });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "bbq.table.delete",
      summary: `ลบโต๊ะ ${existing.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "dining_table",
      entityId: existing.id,
      entityName: existing.name,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
