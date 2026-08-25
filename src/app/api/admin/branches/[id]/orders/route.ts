import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { listShiftsForBranchDate } from "@/lib/branch-shift";
import {
  bangkokDateKey,
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

function addDaysYmd(dateYmd: string, delta: number): string {
  const start = new Date(`${dateYmd}T12:00:00+07:00`);
  start.setTime(start.getTime() + delta * 24 * 60 * 60 * 1000);
  return bangkokDateKey(start);
}

function dayLabelTh(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00+07:00`);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function buildDateRange(fromYmd: string, toYmd: string) {
  const days: {
    date: string;
    label: string;
    revenue: number;
    cancelled: number;
  }[] = [];
  let cur = fromYmd;
  // Cap at 93 days to avoid huge payloads
  for (let i = 0; i < 93; i += 1) {
    days.push({
      date: cur,
      label: dayLabelTh(cur),
      revenue: 0,
      cancelled: 0,
    });
    if (cur >= toYmd) break;
    cur = addDaysYmd(cur, 1);
  }
  return days;
}

function normalizeRange(fromRaw: string, toRaw: string) {
  return fromRaw <= toRaw
    ? { from: fromRaw, to: toRaw }
    : { from: toRaw, to: fromRaw };
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
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    const summaryOnly = searchParams.get("summary") === "1";

    if (
      fromParam &&
      toParam &&
      isBangkokDateKey(fromParam) &&
      isBangkokDateKey(toParam)
    ) {
      const { from, to } = normalizeRange(fromParam, toParam);
      const orders = await prisma.order.findMany({
        where: {
          branchId,
          queueBusinessDate: {
            gte: queueBusinessDateFromKey(from),
            lte: queueBusinessDateFromKey(to),
          },
        },
        select: {
          status: true,
          awaitingPhotoKey: true,
          deliveryFee: true,
          discountAmount: true,
          queueBusinessDate: true,
          items: {
            select: { quantity: true, unitPrice: true, optionsPrice: true },
          },
        },
      });

      const days = buildDateRange(from, to);
      const byDay = new Map(days.map((d) => [d.date, d]));
      for (const order of orders) {
        const key = bangkokDateKey(order.queueBusinessDate);
        const bucket = byDay.get(key);
        if (!bucket) continue;
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
          bucket.revenue += total;
        } else if (isCancelledStatus(order.status)) {
          bucket.cancelled += 1;
        }
      }

      return jsonOk({
        from,
        to,
        operatingDay: dayState.operatingDay,
        dayStats: computeDayStats(orders),
        days,
        ...(summaryOnly ? {} : { orders: [] }),
      });
    }

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
          consumableLines: true,
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
