import type { BranchShift, PaymentMethod, Prisma } from "@prisma/client";
import {
  bangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  isCancelledStatus,
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";
import {
  operatingDayDate,
  resolveOperatingDayKey,
} from "@/lib/operating-day";

export type ActiveShift = Pick<
  BranchShift,
  | "id"
  | "branchId"
  | "calendarDate"
  | "roundNumber"
  | "openedAt"
  | "closedAt"
  | "openingCash"
  | "note"
  | "openedByStaffId"
  | "closedByStaffId"
>;

export type ShiftSummaryMenuRow = {
  name: string;
  quantity: number;
  revenueBaht: number;
};

export type ShiftSummary = {
  shift: {
    id: string;
    calendarDate: string;
    roundNumber: number;
    openedAt: string;
    closedAt: string | null;
    openingCash: number;
    note: string | null;
    /** e.g. SHIFT-20260723-001 */
    code: string;
  };
  totalOrders: number;
  cancelledOrders: number;
  /** Non-cancelled orders in the shift */
  orderCount: number;
  completedOrders: number;
  revenueBaht: number;
  cashRevenueBaht: number;
  transferRevenueBaht: number;
  /** Legacy CARD orders only — not offered on new sales */
  cardRevenueBaht: number;
  /** openingCash + cash sales (drawer estimate) */
  expectedCash: number;
  /** revenueBaht + openingCash (ยอดรวมเงินเริ่มต้น) */
  totalWithOpeningCash: number;
  giftQuantity: number;
  menus: ShiftSummaryMenuRow[];
};

const activeShiftSelect = {
  id: true,
  branchId: true,
  calendarDate: true,
  roundNumber: true,
  openedAt: true,
  closedAt: true,
  openingCash: true,
  note: true,
  openedByStaffId: true,
  closedByStaffId: true,
} satisfies Prisma.BranchShiftSelect;

export function shiftCalendarDateKey(shift: { calendarDate: Date }): string {
  // Prisma @db.Date often comes back as UTC midnight for the calendar day
  const iso = shift.calendarDate.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return bangkokDateKey(shift.calendarDate);
}

/** Display code e.g. SHIFT-20260723-001 */
export function formatShiftCode(params: {
  calendarDate: string | Date;
  roundNumber: number;
}): string {
  const key =
    typeof params.calendarDate === "string"
      ? params.calendarDate.slice(0, 10)
      : shiftCalendarDateKey({ calendarDate: params.calendarDate });
  const ymd = key.replace(/-/g, "");
  return `SHIFT-${ymd}-${String(params.roundNumber).padStart(3, "0")}`;
}

export function serializeShift(shift: ActiveShift) {
  return {
    id: shift.id,
    calendarDate: shiftCalendarDateKey(shift),
    roundNumber: shift.roundNumber,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? null,
    openingCash: Number(shift.openingCash),
    note: shift.note?.trim() || null,
    openedByStaffId: shift.openedByStaffId,
    closedByStaffId: shift.closedByStaffId,
  };
}

export async function getActiveShift(
  branchId: string,
): Promise<ActiveShift | null> {
  return prisma.branchShift.findFirst({
    where: { branchId, closedAt: null },
    select: activeShiftSelect,
    orderBy: { openedAt: "desc" },
  });
}

export class ShiftGateError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ShiftGateError";
    this.status = status;
  }
}

/** Require an open shift for selling / mutating current-round orders. */
export async function requireActiveShift(
  branchId: string,
): Promise<ActiveShift> {
  const shift = await getActiveShift(branchId);
  if (!shift) {
    throw new ShiftGateError(
      "ร้านยังไม่เปิดรอบ — กรุณาเปิดร้านและกรอกตังทอนก่อนขาย",
      403,
    );
  }
  return shift;
}

/**
 * Staff may mutate an order only when it belongs to the currently open shift.
 * Legacy orders without shiftId: allow only while a shift is open and the
 * order's queue day matches the active shift calendar date.
 */
export async function assertOrderMutableInActiveShift(params: {
  branchId: string;
  orderShiftId: string | null;
  orderQueueBusinessDate: Date;
}): Promise<ActiveShift> {
  const active = await requireActiveShift(params.branchId);
  if (params.orderShiftId) {
    if (params.orderShiftId !== active.id) {
      throw new ShiftGateError(
        "แก้ไขได้เฉพาะออเดอร์ของรอบที่เปิดอยู่ตอนนี้",
        403,
      );
    }
    return active;
  }
  const orderDay = params.orderQueueBusinessDate.toISOString().slice(0, 10);
  const shiftDay = shiftCalendarDateKey(active);
  if (orderDay !== shiftDay) {
    throw new ShiftGateError(
      "แก้ไขได้เฉพาะออเดอร์ของรอบที่เปิดอยู่ตอนนี้",
      403,
    );
  }
  return active;
}

export async function openShift(params: {
  branchId: string;
  openingCash: number;
  note?: string | null;
  openedByStaffId?: string | null;
  at?: Date;
}): Promise<ActiveShift> {
  const at = params.at ?? new Date();
  const note = params.note?.trim() || null;

  const branch = await prisma.branch.findUnique({
    where: { id: params.branchId },
    select: { businessDayCutoffTime: true },
  });
  if (!branch) {
    throw new ShiftGateError("ไม่พบสาขา", 404);
  }

  const calendarDate = operatingDayDate(at, branch.businessDayCutoffTime);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.branchShift.findFirst({
      where: { branchId: params.branchId, closedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ShiftGateError("มีรอบเปิดอยู่แล้ว — ปิดรอบก่อนเปิดใหม่", 409);
    }

    const maxRound = await tx.branchShift.aggregate({
      where: { branchId: params.branchId, calendarDate },
      _max: { roundNumber: true },
    });
    const roundNumber = (maxRound._max.roundNumber ?? 0) + 1;

    const shift = await tx.branchShift.create({
      data: {
        branchId: params.branchId,
        calendarDate,
        roundNumber,
        openedAt: at,
        openedByStaffId: params.openedByStaffId ?? null,
        openingCash: params.openingCash,
        note,
      },
      select: activeShiftSelect,
    });

    await tx.branch.update({
      where: { id: params.branchId },
      data: { isOpen: true },
    });

    return shift;
  });
}

export async function closeActiveShift(params: {
  branchId: string;
  closedByStaffId?: string | null;
  at?: Date;
}): Promise<{ shift: ActiveShift; summary: ShiftSummary }> {
  const at = params.at ?? new Date();

  const closed = await prisma.$transaction(async (tx) => {
    const active = await tx.branchShift.findFirst({
      where: { branchId: params.branchId, closedAt: null },
      select: activeShiftSelect,
    });
    if (!active) {
      throw new ShiftGateError("ไม่มีรอบที่เปิดอยู่", 409);
    }

    const shift = await tx.branchShift.update({
      where: { id: active.id },
      data: {
        closedAt: at,
        closedByStaffId: params.closedByStaffId ?? null,
      },
      select: activeShiftSelect,
    });

    await tx.branch.update({
      where: { id: params.branchId },
      data: { isOpen: false },
    });

    return shift;
  });

  const summary = await buildShiftSummary(closed.id);
  return { shift: closed, summary };
}

/**
 * Sync Branch.isOpen with shifts when admin toggles the store.
 * - open: create shift with openingCash 0 if none open
 * - close: close active shift if any
 */
export async function syncShiftWithAdminIsOpen(params: {
  branchId: string;
  isOpen: boolean;
}): Promise<ActiveShift | null> {
  if (params.isOpen) {
    const active = await getActiveShift(params.branchId);
    if (active) return active;
    return openShift({
      branchId: params.branchId,
      openingCash: 0,
      openedByStaffId: null,
    });
  }

  const active = await getActiveShift(params.branchId);
  if (!active) {
    await prisma.branch.update({
      where: { id: params.branchId },
      data: { isOpen: false },
    });
    return null;
  }
  const { shift } = await closeActiveShift({
    branchId: params.branchId,
    closedByStaffId: null,
  });
  return shift;
}

export type CloseShiftsPastCutoffResult = {
  checked: number;
  closed: number;
  branchIds: string[];
  errors: string[];
};

/**
 * Auto-close any open shift whose operating day has already rolled past cutoff.
 * Safe to call from the LINE daily-summary cron (every few minutes).
 */
export async function closeShiftsPastCutoff(
  at: Date = new Date(),
): Promise<CloseShiftsPastCutoffResult> {
  const result: CloseShiftsPastCutoffResult = {
    checked: 0,
    closed: 0,
    branchIds: [],
    errors: [],
  };

  const openShifts = await prisma.branchShift.findMany({
    where: { closedAt: null },
    select: {
      ...activeShiftSelect,
      branch: { select: { businessDayCutoffTime: true } },
    },
  });

  for (const row of openShifts) {
    result.checked += 1;
    const cutoff = row.branch.businessDayCutoffTime;
    const currentDay = resolveOperatingDayKey(at, cutoff);
    const shiftDay = shiftCalendarDateKey(row);

    if (shiftDay === currentDay) continue;

    try {
      await closeActiveShift({
        branchId: row.branchId,
        closedByStaffId: null,
        at,
      });
      result.closed += 1;
      result.branchIds.push(row.branchId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ปิดรอบไม่สำเร็จ";
      result.errors.push(`${row.branchId}: ${msg}`);
    }
  }

  return result;
}

type OrderForSummary = {
  status: string;
  awaitingPhotoKey: boolean;
  paymentMethod: PaymentMethod;
  deliveryFee: unknown;
  discountAmount: unknown;
  items: Array<{
    itemName: string;
    quantity: number;
    unitPrice: unknown;
    optionsPrice: unknown;
    giftQuantity?: number | null;
  }>;
};

export function computeShiftSummaryFromOrders(
  shift: ActiveShift,
  orders: OrderForSummary[],
): ShiftSummary {
  let cancelledOrders = 0;
  let completedOrders = 0;
  let revenueBaht = 0;
  let cashRevenueBaht = 0;
  let transferRevenueBaht = 0;
  let cardRevenueBaht = 0;
  let giftQuantity = 0;
  const menuMap = new Map<string, ShiftSummaryMenuRow>();

  for (const o of orders) {
    if (isCancelledStatus(o.status as never)) {
      cancelledOrders += 1;
      continue;
    }
    if (
      !isOrderCountableRevenue({
        status: o.status as never,
        awaitingPhotoKey: o.awaitingPhotoKey,
      })
    ) {
      continue;
    }

    completedOrders += 1;
    const lineItems = o.items.map((i) => ({
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      optionsPrice: Number(i.optionsPrice),
    }));
    const total = orderGrandTotal(
      lineItems,
      Number(o.deliveryFee),
      Number(o.discountAmount),
    );
    revenueBaht += total;

    if (o.paymentMethod === "CASH") cashRevenueBaht += total;
    else if (o.paymentMethod === "TRANSFER") transferRevenueBaht += total;
    else if (o.paymentMethod === "CARD") cardRevenueBaht += total;

    for (const item of o.items) {
      giftQuantity += Math.max(0, Number(item.giftQuantity ?? 0));
      const name = item.itemName.trim() || "ไม่ระบุ";
      const lineRev =
        (Number(item.unitPrice) + Number(item.optionsPrice ?? 0)) *
        item.quantity;
      const prev = menuMap.get(name);
      if (prev) {
        prev.quantity += item.quantity;
        prev.revenueBaht += lineRev;
      } else {
        menuMap.set(name, {
          name,
          quantity: item.quantity,
          revenueBaht: lineRev,
        });
      }
    }
  }

  const openingCash = Number(shift.openingCash);
  const calendarDate = shiftCalendarDateKey(shift);
  const menus = [...menuMap.values()].sort(
    (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "th"),
  );

  return {
    shift: {
      id: shift.id,
      calendarDate,
      roundNumber: shift.roundNumber,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      openingCash,
      note: shift.note?.trim() || null,
      code: formatShiftCode({
        calendarDate,
        roundNumber: shift.roundNumber,
      }),
    },
    totalOrders: orders.length,
    cancelledOrders,
    orderCount: orders.length - cancelledOrders,
    completedOrders,
    revenueBaht,
    cashRevenueBaht,
    transferRevenueBaht,
    cardRevenueBaht,
    expectedCash: openingCash + cashRevenueBaht,
    totalWithOpeningCash: openingCash + revenueBaht,
    giftQuantity,
    menus,
  };
}

export async function buildShiftSummary(shiftId: string): Promise<ShiftSummary> {
  const shift = await prisma.branchShift.findUnique({
    where: { id: shiftId },
    select: activeShiftSelect,
  });
  if (!shift) {
    throw new ShiftGateError("ไม่พบรอบ", 404);
  }

  const orders = await prisma.order.findMany({
    where: { shiftId },
    select: {
      status: true,
      awaitingPhotoKey: true,
      paymentMethod: true,
      deliveryFee: true,
      discountAmount: true,
      items: {
        select: {
          itemName: true,
          quantity: true,
          unitPrice: true,
          optionsPrice: true,
          giftQuantity: true,
        },
      },
    },
  });

  return computeShiftSummaryFromOrders(shift, orders);
}

export async function listShiftsForBranchDate(
  branchId: string,
  calendarDateKey: string,
) {
  const calendarDate = queueBusinessDateFromKey(calendarDateKey);
  const shifts = await prisma.branchShift.findMany({
    where: { branchId, calendarDate },
    select: activeShiftSelect,
    orderBy: { roundNumber: "asc" },
  });
  return shifts.map(serializeShift);
}
