import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { setStockHistoryLinesCancelled } from "@/lib/stock-history-cancel";
import { StockError } from "@/lib/stock";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  cancelled: z.boolean(),
  cancelNote: z.string().trim().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        id: z.string().min(1),
        source: z.enum(["menu", "non_menu"]),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * PATCH — cancel or restore a stock-in / issue batch (or selected lines).
 * Cancelling reverses the stock quantity effect; restore re-applies it.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonError("ข้อมูลไม่ถูกต้อง", 400);
    }

    const brand = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        name: true,
        brandId: true,
        brand: { select: { name: true, allowNegativeStock: true } },
      },
    });

    try {
      const result = await setStockHistoryLinesCancelled({
        branchId,
        lines: parsed.data.lines,
        cancelled: parsed.data.cancelled,
        cancelNote: parsed.data.cancelNote,
        allowNegativeStock: Boolean(brand?.brand?.allowNegativeStock),
      });

      const ctx = await getBranchActivityContext(branchId);
      await logAdminActivity(session, {
        action: parsed.data.cancelled
          ? "branch.stock.history.cancel"
          : "branch.stock.history.restore",
        summary: parsed.data.cancelled
          ? `ยกเลิกรายการสต๊อก ${result.updated} รายการ`
          : `กู้คืนรายการสต๊อก ${result.updated} รายการ`,
        brandId: ctx?.brandId ?? brand?.brandId ?? undefined,
        brandName: ctx?.brand?.name ?? brand?.brand?.name ?? undefined,
        branchId,
        branchName: ctx?.name ?? brand?.name,
        entityType: "branch_stock_history",
        entityId: branchId,
        entityName: brand?.name,
        metadata: {
          updated: result.updated,
          cancelNote: parsed.data.cancelNote ?? null,
          lineCount: parsed.data.lines.length,
        },
      });

      return jsonOk({
        updated: result.updated,
        cancelled: parsed.data.cancelled,
      });
    } catch (e) {
      if (e instanceof StockError) {
        return jsonError(e.message, e.status);
      }
      throw e;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
