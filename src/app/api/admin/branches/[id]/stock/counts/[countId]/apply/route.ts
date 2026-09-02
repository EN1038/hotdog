import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { convertStockCountSummary } from "@/lib/stock-count-convert";
import { z } from "zod";

type Params = { params: Promise<{ id: string; countId: string }> };

const bodySchema = z.object({
  action: z.enum(["apply", "reject"]).default("apply"),
  note: z.string().trim().max(300).nullable().optional(),
});

/**
 * POST — admin converts a pending stock summary into actual ADJUST stock.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId, countId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const count = await prisma.branchStockSummary.findFirst({
      where: { id: countId, branchId },
    });
    if (!count) return jsonError("ไม่พบสรุปยอด", 404);

    const result = await convertStockCountSummary({
      branchId,
      countId,
      action: body.action,
      note: body.note,
      actor: {
        adminId: session.adminId ?? null,
        staffId: null,
        label: "แอดมิน",
      },
    });

    if (!result.ok) {
      return jsonError(result.error);
    }

    await logAdminActivity(session, {
      action: "branch.update",
      summary:
        body.action === "reject"
          ? `ปฏิเสธสรุปยอดสต๊อก: ${count.name}`
          : `ปรับสต๊อกจากสรุปยอด: ${count.name}${
              typeof result.adjustedItemCount === "number"
                ? ` (${result.adjustedItemCount} รายการที่ยอดเปลี่ยน)`
                : ""
            }`,
      brandId: count.brandId,
      branchId,
      entityType: "STOCK_COUNT",
      entityId: count.id,
      entityName: count.name,
    });

    return jsonOk({
      ok: true,
      status: result.status,
      adjustedItemCount: result.adjustedItemCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
