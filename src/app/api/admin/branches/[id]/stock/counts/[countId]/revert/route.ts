import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { revertStockSummaryToPendingConvert } from "@/lib/stock-count-revert";

type Params = { params: Promise<{ id: string; countId: string }> };

const bodySchema = z.object({
  note: z.string().trim().max(300).nullable().optional(),
});

/** POST — revert auto-applied consumable/equipment summary back to pending Convert. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId, countId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const count = await prisma.branchStockSummary.findFirst({
      where: { id: countId, branchId },
    });
    if (!count) return jsonError("ไม่พบสรุปยอด", 404);

    const result = await revertStockSummaryToPendingConvert({
      branchId,
      countId,
      actorAdminId: session.adminId ?? null,
      note: body.note,
    });

    if (!result.ok) {
      return jsonError(result.error);
    }

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `ย้อนกลับสรุปยอดรอ Convert: ${count.name} (คืนยอด ${result.restoredItemCount} รายการ)`,
      brandId: count.brandId,
      branchId,
      entityType: "STOCK_COUNT",
      entityId: count.id,
      entityName: count.name,
    });

    return jsonOk({
      ok: true,
      status: result.status,
      restoredItemCount: result.restoredItemCount,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ไม่พบ")) {
      return jsonError(error.message);
    }
    return handleApiError(error);
  }
}
