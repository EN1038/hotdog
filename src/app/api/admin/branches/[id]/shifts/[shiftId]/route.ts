import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  cancelShift,
  formatShiftCode,
  restoreCancelledShift,
  serializeShift,
  ShiftGateError,
  shiftCalendarDateKey,
} from "@/lib/branch-shift";
import { StockError } from "@/lib/stock";

type Params = { params: Promise<{ id: string; shiftId: string }> };

const bodySchema = z.object({
  /** true = ยกเลิกรอบ, false = กู้คืนจากสถานะยกเลิก */
  cancelled: z.boolean(),
  cancelNote: z.string().trim().max(500).optional().nullable(),
});

/**
 * PATCH — set or clear cancelled status on a sales shift (admin only).
 * Cancel marks orders CANCELLED and restores stock.
 * Restore reverses bulk shift-cancel (orders + stock).
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId, shiftId } = await params;
    const { session } = await requireBranchAccess(branchId);

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonError("ข้อมูลไม่ถูกต้อง", 400);
    }

    const ctx = await getBranchActivityContext(branchId);

    if (parsed.data.cancelled) {
      try {
        const result = await cancelShift({
          shiftId,
          branchId,
          cancelNote: parsed.data.cancelNote,
        });
        const code = formatShiftCode({
          calendarDate: shiftCalendarDateKey(result),
          roundNumber: result.roundNumber,
        });

        await logAdminActivity(session, {
          action: "branch.shift.cancel",
          summary: `ยกเลิกรอบขาย ${code} (ยกเลิก ${result.cancelledOrderCount} ออเดอร์ · คืนสต๊อก ${result.restoredStockOrderCount} รายการ)`,
          brandId: ctx?.brandId,
          brandName: ctx?.brand?.name,
          branchId,
          branchName: ctx?.name,
          entityType: "branch_shift",
          entityId: result.id,
          entityName: code,
          metadata: {
            cancelNote: result.cancelNote,
            cancelledOrderCount: result.cancelledOrderCount,
            restoredStockOrderCount: result.restoredStockOrderCount,
          },
        });

        return jsonOk({
          shift: serializeShift(result),
          cancelledOrderCount: result.cancelledOrderCount,
          restoredStockOrderCount: result.restoredStockOrderCount,
        });
      } catch (e) {
        if (e instanceof ShiftGateError) {
          return jsonError(e.message, e.status);
        }
        if (e instanceof StockError) {
          return jsonError(e.message, e.status);
        }
        throw e;
      }
    }

    try {
      const result = await restoreCancelledShift({ shiftId, branchId });
      const code = formatShiftCode({
        calendarDate: shiftCalendarDateKey(result),
        roundNumber: result.roundNumber,
      });

      await logAdminActivity(session, {
        action: "branch.shift.restore",
        summary: `กู้คืนรอบขาย ${code} (คืน ${result.restoredOrderCount} ออเดอร์ · ตัดสต๊อกใหม่ ${result.restockedOrderCount} รายการ)`,
        brandId: ctx?.brandId,
        brandName: ctx?.brand?.name,
        branchId,
        branchName: ctx?.name,
        entityType: "branch_shift",
        entityId: result.id,
        entityName: code,
        metadata: {
          restoredOrderCount: result.restoredOrderCount,
          restockedOrderCount: result.restockedOrderCount,
        },
      });

      return jsonOk({
        shift: serializeShift(result),
        restoredOrderCount: result.restoredOrderCount,
        restockedOrderCount: result.restockedOrderCount,
      });
    } catch (e) {
      if (e instanceof ShiftGateError) {
        return jsonError(e.message, e.status);
      }
      if (e instanceof StockError) {
        return jsonError(e.message, e.status);
      }
      throw e;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
