import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { analyzeBranchParStock } from "@/lib/inventory/inventory-par-stock";
import { loadBranchTomorrowPlan } from "@/lib/inventory/inventory-tomorrow-plan";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  coverageDays: z.number().int().min(1).max(30).optional(),
  safetyPct: z.number().int().min(0).max(100).optional(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    await ensureProdSchemaCompat();
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, kind: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (branch.kind === "WAREHOUSE") {
      return jsonError("สาขาคลังกลางไม่มีเมนูขาย");
    }

    const analyzed = await analyzeBranchParStock({
      branchId,
      coverageDays: body.coverageDays,
      safetyPct: body.safetyPct,
    });

    const tomorrowPlan = await loadBranchTomorrowPlan(branchId);

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `วิเคราะห์สต๊อก ${analyzed.updated} เมนู สาขา ${branch.name}`,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "branch",
      entityId: branch.id,
      metadata: { analyzed, tomorrowSummary: tomorrowPlan.summary },
    });

    return jsonOk({ analyzed, tomorrowPlan });
  } catch (error) {
    return handleApiError(error);
  }
}
