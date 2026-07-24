import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { listShiftsForBranchDate } from "@/lib/branch-shift";
import {
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { getCalendarDayState } from "@/lib/operating-day";
import {
  isCancelledStatus,
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";

type Params = { params: Promise<{ id: string }> };

type OrderForStats = {
  status: OrderStatus;
  awaitingPhotoKey?: boolean;
  deliveryFee: unknown;
  discountAmount: unknown;
  items: Array<{
    quantity: number;
    unitPrice: unknown;
    optionsPrice: unknown;
  }>;
};

function computeDayStats(orders: OrderForStats[]) {
  let completedRevenue = 0;
  let cancelledRevenue = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let openCount = 0;

  for (const order of orders) {
    const total = orderGrandTotal(
      order.items.map((it) => ({
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        optionsPrice: Number(it.optionsPrice),
      })),
      Number(order.deliveryFee),
      Number(order.discountAmount),
    );

    if (isOrderCountableRevenue(order)) {
      completedRevenue += total;
      completedCount += 1;
    } else if (isCancelledStatus(order.status)) {
      cancelledRevenue += total;
      cancelledCount += 1;
    } else {
      openCount += 1;
    }
  }

  return {
    completedRevenue,
    cancelledRevenue,
    completedCount,
    cancelledCount,
    openCount,
    totalOrders: orders.length,
  };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const dayState = getCalendarDayState();
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date")?.trim();
    const date =
      dateParam && isBangkokDateKey(dateParam)
        ? dateParam
        : dayState.operatingDay;
    const businessDate = queueBusinessDateFromKey(date);

    const [orders, shifts] = await Promise.all([
      prisma.order.findMany({
        where: {
          branchId,
          queueBusinessDate: businessDate,
        },
        include: {
          customer: true,
          deliveryLocation: true,
          items: { include: { branchMenuItem: true } },
          shift: {
            select: {
              id: true,
              roundNumber: true,
              openedAt: true,
              closedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      listShiftsForBranchDate(branchId, date),
    ]);

    return jsonOk({
      date,
      isToday: date === dayState.operatingDay,
      operatingDay: dayState.operatingDay,
      dayStats: computeDayStats(orders),
      shifts,
      orders: orders.map((o) => ({
        ...o,
        shiftId: o.shiftId,
        shift: o.shift
          ? {
              id: o.shift.id,
              roundNumber: o.shift.roundNumber,
              openedAt: o.shift.openedAt.toISOString(),
              closedAt: o.shift.closedAt?.toISOString() ?? null,
            }
          : null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
