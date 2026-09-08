import { handleApiError, jsonOk } from "@/lib/api";
import {
  getActiveShift,
  listShiftsForBranchDate,
  serializeShift,
} from "@/lib/branch-shift";
import { bangkokDateKey, isBangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";
import {
  ownerAccessErrorResponse,
  requireOwnerBranch,
  requireOwnerSession,
} from "@/lib/owner-accounts-access";

/** GET — list shifts for a branch date (owner accounts import). */
export async function GET(request: Request) {
  try {
    const { session, brandIds } = await requireOwnerSession();
    const { searchParams } = new URL(request.url);
    const branch = await requireOwnerBranch(
      session,
      brandIds,
      searchParams.get("branchId"),
    );

    const dateParam = searchParams.get("date");
    const dateKey =
      dateParam && isBangkokDateKey(dateParam) ? dateParam : bangkokDateKey();

    const [shifts, active] = await Promise.all([
      listShiftsForBranchDate(branch.id, dateKey),
      getActiveShift(branch.id),
    ]);

    const statsByShift = new Map<
      string,
      { orderCount: number; completedCount: number; revenueBaht: number }
    >();
    if (shifts.length > 0) {
      const orders = await prisma.order.findMany({
        where: {
          branchId: branch.id,
          shiftId: { in: shifts.map((s) => s.id) },
        },
        select: {
          shiftId: true,
          status: true,
          awaitingPhotoKey: true,
          deliveryFee: true,
          discountAmount: true,
          items: {
            select: { quantity: true, unitPrice: true, optionsPrice: true },
          },
        },
      });
      for (const order of orders) {
        if (!order.shiftId) continue;
        const cur = statsByShift.get(order.shiftId) ?? {
          orderCount: 0,
          completedCount: 0,
          revenueBaht: 0,
        };
        cur.orderCount += 1;
        if (isOrderCountableRevenue(order)) {
          cur.completedCount += 1;
          cur.revenueBaht += orderGrandTotal(
            order.items.map((i) => ({
              quantity: i.quantity,
              unitPrice: Number(i.unitPrice),
              optionsPrice: Number(i.optionsPrice),
            })),
            Number(order.deliveryFee),
            Number(order.discountAmount),
          );
        }
        statsByShift.set(order.shiftId, cur);
      }
    }

    const shiftsWithStats = shifts.map((s) => {
      const stats = statsByShift.get(s.id);
      return {
        ...s,
        orderCount: stats?.orderCount ?? 0,
        completedCount: stats?.completedCount ?? 0,
        revenueBaht: Math.round((stats?.revenueBaht ?? 0) * 100) / 100,
      };
    });

    return jsonOk({
      date: dateKey,
      branchId: branch.id,
      shifts: shiftsWithStats,
      activeShift: active ? serializeShift(active) : null,
    });
  } catch (error) {
    const owned = ownerAccessErrorResponse(error);
    if (owned) return owned;
    return handleApiError(error);
  }
}
