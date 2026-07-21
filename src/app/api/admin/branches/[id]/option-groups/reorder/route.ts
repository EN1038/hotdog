import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";

const reorderSchema = z.object({
  orderedIds: z.array(z.string()),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = reorderSchema.parse(await request.json());

    if (body.orderedIds.length === 0) return jsonOk({ ok: true });

    const existing = await prisma.branchOptionGroup.findMany({
      where: { branchId, id: { in: body.orderedIds } },
      select: { id: true },
    });
    if (existing.length !== body.orderedIds.length) {
      return jsonError("ข้อมูลหัวข้อตัวเลือกไม่ถูกต้อง");
    }

    await prisma.$transaction(
      body.orderedIds.map((id, index) =>
        prisma.branchOptionGroup.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "option.update",
      summary: "จัดเรียงลำดับหัวข้อตัวเลือก",
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "branch",
      entityId: branchId,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
