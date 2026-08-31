import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import { deleteTomorrowPlanLine } from "@/lib/inventory/inventory-tomorrow-plan-records";

type Params = {
  params: Promise<{ id: string; planId: string; lineId: string }>;
};

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id: branchId, planId, lineId } = await params;
    const { session } = await requireBranchAccess(branchId);
    await ensureProdSchemaCompat();

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, kind: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (branch.kind === "WAREHOUSE") {
      return jsonError("สาขาคลังกลางไม่มีเมนูขาย");
    }

    const detail = await deleteTomorrowPlanLine({ branchId, planId, lineId });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `ลบรายการในแผนผลิต-เติม สาขา ${branch.name}`,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "tomorrow_plan",
      entityId: planId,
      metadata: { lineId, planDeleted: detail == null },
    });

    return jsonOk({ deleted: true, plan: detail });
  } catch (error) {
    if (error instanceof Error && error.message === "LINE_NOT_FOUND") {
      return jsonError("ไม่พบรายการในแผนนี้", 404);
    }
    return handleApiError(error);
  }
}
