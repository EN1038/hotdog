import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getActiveShift,
  listShiftsForBranchDate,
  listShiftsForBranchDateRange,
  openShift,
  serializeShift,
  ShiftGateError,
} from "@/lib/branch-shift";
import { isBangkokDateKey, bangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";

function staffCanToggleStore(roles: string[]) {
  return roles.includes("SELLER") || roles.includes("BOTH");
}

const openSchema = z.object({
  openingCash: z.number().finite().min(0).max(1_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

/** GET — list shifts for a Bangkok calendar date (default today). */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    const rangeFrom =
      fromParam && isBangkokDateKey(fromParam) ? fromParam : null;
    const rangeTo = toParam && isBangkokDateKey(toParam) ? toParam : null;
    const dateKey =
      dateParam && isBangkokDateKey(dateParam)
        ? dateParam
        : bangkokDateKey();

    const [shifts, active] = await Promise.all([
      rangeFrom && rangeTo
        ? listShiftsForBranchDateRange(session.branchId, rangeFrom, rangeTo)
        : listShiftsForBranchDate(session.branchId, dateKey),
      getActiveShift(session.branchId),
    ]);

    const statsByShift = new Map<
      string,
      { orderCount: number; completedCount: number; revenueBaht: number }
    >();
    if (shifts.length > 0) {
      const orders = await prisma.order.findMany({
        where: {
          branchId: session.branchId,
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
      from: rangeFrom && rangeTo ? (rangeFrom <= rangeTo ? rangeFrom : rangeTo) : dateKey,
      to: rangeFrom && rangeTo ? (rangeFrom <= rangeTo ? rangeTo : rangeFrom) : dateKey,
      shifts: shiftsWithStats,
      activeShift: active ? serializeShift(active) : null,
      canToggleStore: staffCanToggleStore(session.staffRoles),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    if (!staffCanToggleStore(session.staffRoles)) {
      return jsonError("เฉพาะพนักงานขายเท่านั้นที่เปิดร้านได้", 403);
    }

    const body = openSchema.parse(await request.json());
    try {
      const shift = await openShift({
        branchId: session.branchId,
        openingCash: body.openingCash,
        note: body.note,
        openedByStaffId: session.staffId,
      });
      return jsonOk({ shift: serializeShift(shift) }, 201);
    } catch (e) {
      if (e instanceof ShiftGateError) {
        return jsonError(e.message, e.status);
      }
      console.error(
        "[staff/shifts POST] openShift failed",
        session.branchId,
        e instanceof Error ? e.message : e,
      );
      throw e;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
