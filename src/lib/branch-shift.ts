import {
  OrderStatus,
  Prisma,
  type BranchShift,
  type PaymentMethod,
  type SalesChannel,
} from "@prisma/client";
import {
  bangkokDateKey,
  queueBusinessDateFromKey,
  SALES_CHANNEL_LABELS,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  isCancelledStatus,
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";
import {
  aggregateBranchMenuStockSalesByOrders,
  reapplyStockForOrder,
  restoreStockForOrder,
} from "@/lib/stock";

/** Encoded in Order.cancelReason when bulk-cancelled via shift cancel. */
const SHIFT_CANCEL_REASON_PREFIX = "SHIFT_CANCEL:";

const ORDER_STATUSES = new Set<string>(Object.values(OrderStatus));

function encodeShiftCancelReason(
  prevStatus: OrderStatus,
  note: string,
): string {
  return `${SHIFT_CANCEL_REASON_PREFIX}${prevStatus}|${note}`.slice(0, 200);
}

function isShiftBulkCancelReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  if (reason.startsWith(SHIFT_CANCEL_REASON_PREFIX)) return true;
  // legacy cancelShift reason before status encoding
  if (reason.startsWith("ยกเลิกรอบขาย")) return true;
  return false;
}

function prevStatusFromShiftCancelReason(
  reason: string | null | undefined,
): OrderStatus {
  if (reason?.startsWith(SHIFT_CANCEL_REASON_PREFIX)) {
    const rest = reason.slice(SHIFT_CANCEL_REASON_PREFIX.length);
    const statusRaw = rest.split("|")[0]?.trim() ?? "";
    if (ORDER_STATUSES.has(statusRaw) && statusRaw !== OrderStatus.CANCELLED) {
      return statusRaw as OrderStatus;
    }
  }
  return OrderStatus.COMPLETED;
}

export type ActiveShift = {
  id: string;
  branchId: string;
  calendarDate: Date;
  roundNumber: number;
  openedAt: Date;
  closedAt: Date | null;
  openingCash: BranchShift["openingCash"];
  note: string | null;
  openedByStaffId: string | null;
  closedByStaffId: string | null;
  cancelledAt: Date | null;
  cancelNote: string | null;
};

export type ShiftSummaryMenuRow = {
  name: string;
  quantity: number;
  revenueBaht: number;
};

export type ShiftSummaryChannelRow = {
  channel: SalesChannel | string;
  label: string;
  orderCount: number;
  revenueBaht: number;
};

export type ShiftStockDeductionRow = {
  menuItemId: string;
  name: string;
  quantity: number;
  orders: Array<{ id: string; orderNumber: string }>;
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
    cancelledAt: string | null;
    cancelNote: string | null;
    isCancelled: boolean;
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
  /**
   * Grand total of cancelled orders (ยังนับยอดเงินที่เคยขาย แม้ไม่รวมในยอดสุทธิ)
   */
  cancelledRevenueBaht: number;
  /** ชิ้นเมนู (จำนวน + ของแถม) จากออเดอร์ที่ยกเลิก */
  cancelledItemQuantity: number;
  /**
   * ชิ้นที่ระบบเคยตัดสต๊อกเมนูสาขาแล้วคืน (จากประวัติ SALE ของออเดอร์ที่ยกเลิก)
   */
  stockRestoredQuantity: number;
  /** รายการสต๊อกเมนูที่คืนตามออเดอร์ยกเลิก */
  stockRestored: ShiftStockDeductionRow[];
  menus: ShiftSummaryMenuRow[];
  /** Sales channel breakdown (หน้าร้าน / Facebook / App Delivery …) */
  channels: ShiftSummaryChannelRow[];
  /** Branch menu stock still cut by sales in this shift (stockDeducted) */
  stockDeductions: ShiftStockDeductionRow[];
};

/** Core shift columns only — cancel fields loaded via SQL so stale Prisma clients still work. */
const baseShiftSelect = {
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

type BaseShiftRow = Prisma.BranchShiftGetPayload<{ select: typeof baseShiftSelect }>;

/** Qualified table for raw SQL (schema may be order_app, not public). */
function branchShiftTableSql() {
  const schema = (process.env.DATABASE_SCHEMA ?? "public").replace(/"/g, "");
  return Prisma.raw(`"${schema}"."BranchShift"`);
}

async function loadCancelMetaByIds(
  ids: string[],
): Promise<Map<string, { cancelledAt: Date | null; cancelNote: string | null }>> {
  const map = new Map<
    string,
    { cancelledAt: Date | null; cancelNote: string | null }
  >();
  if (ids.length === 0) return map;
  try {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; cancelledAt: Date | null; cancelNote: string | null }>
    >`
      SELECT id, "cancelledAt", "cancelNote"
      FROM ${branchShiftTableSql()}
      WHERE id IN (${Prisma.join(ids)})
    `;
    for (const r of rows) {
      map.set(r.id, {
        cancelledAt: r.cancelledAt ?? null,
        cancelNote: r.cancelNote ?? null,
      });
    }
  } catch (e) {
    console.error("[branch-shift] loadCancelMetaByIds failed", e);
  }
  return map;
}

async function attachCancelMeta(rows: BaseShiftRow[]): Promise<ActiveShift[]> {
  const meta = await loadCancelMetaByIds(rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    cancelledAt: meta.get(r.id)?.cancelledAt ?? null,
    cancelNote: meta.get(r.id)?.cancelNote ?? null,
  }));
}

async function attachCancelMetaOne(
  row: BaseShiftRow | null,
): Promise<ActiveShift | null> {
  if (!row) return null;
  const [withMeta] = await attachCancelMeta([row]);
  return withMeta ?? null;
}

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
  const cancelledAt = shift.cancelledAt?.toISOString() ?? null;
  return {
    id: shift.id,
    calendarDate: shiftCalendarDateKey(shift),
    roundNumber: shift.roundNumber,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? null,
    openingCash: Number(shift.openingCash),
    note: shift.note?.trim() || null,
    cancelledAt,
    cancelNote: shift.cancelNote?.trim() || null,
    isCancelled: Boolean(shift.cancelledAt),
    openedByStaffId: shift.openedByStaffId,
    closedByStaffId: shift.closedByStaffId,
  };
}

export async function getActiveShift(
  branchId: string,
): Promise<ActiveShift | null> {
  // Cancelled open rounds are closed on cancel; filter closedAt only so list
  // works even if Prisma Client is older than the cancel columns.
  const row = await prisma.branchShift.findFirst({
    where: { branchId, closedAt: null },
    select: baseShiftSelect,
    orderBy: { openedAt: "desc" },
  });
  const shift = await attachCancelMetaOne(row);
  if (shift?.cancelledAt) return null;
  return shift;
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
  const openingCash = Number(params.openingCash);
  if (!Number.isFinite(openingCash) || openingCash < 0) {
    throw new ShiftGateError("ตังทอนไม่ถูกต้อง — กรอกจำนวนเงินตั้งแต่ 0 ขึ้นไป", 400);
  }

  const branch = await prisma.branch.findUnique({
    where: { id: params.branchId },
    select: { id: true },
  });
  if (!branch) {
    throw new ShiftGateError("ไม่พบสาขา", 404);
  }

  // Heal cancel leftovers: cancelled but closedAt still null (UI thinks store closed).
  const danglingOpen = await prisma.branchShift.findMany({
    where: { branchId: params.branchId, closedAt: null },
    select: baseShiftSelect,
  });
  if (danglingOpen.length > 0) {
    const withMeta = await attachCancelMeta(danglingOpen);
    for (const row of withMeta) {
      if (row.cancelledAt) {
        await prisma.branchShift.update({
          where: { id: row.id },
          data: { closedAt: row.cancelledAt },
        });
      }
    }
  }

  // Already open (e.g. double-tap or stale UI) — return current round instead of hard fail.
  const alreadyOpen = await getActiveShift(params.branchId);
  if (alreadyOpen) {
    await prisma.branch.update({
      where: { id: params.branchId },
      data: { isOpen: true },
      select: { id: true },
    });
    return alreadyOpen;
  }

  const calendarDate = queueBusinessDateFromKey(bangkokDateKey(at));

  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize opens per branch (prevents same-round unique conflicts on double-tap)
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`branch-shift-open:${params.branchId}`}))
      `;

      const existing = await tx.branchShift.findFirst({
        where: { branchId: params.branchId, closedAt: null },
        select: baseShiftSelect,
      });
      if (existing) {
        const [meta] = await attachCancelMeta([existing]);
        if (meta?.cancelledAt) {
          await tx.branchShift.update({
            where: { id: existing.id },
            data: { closedAt: meta.cancelledAt },
          });
        } else {
          await tx.branch.update({
            where: { id: params.branchId },
            data: { isOpen: true },
            select: { id: true },
          });
          return {
            ...existing,
            cancelledAt: null,
            cancelNote: null,
          } satisfies ActiveShift;
        }
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
          openingCash,
          note,
        },
        select: baseShiftSelect,
      });

      await tx.branch.update({
        where: { id: params.branchId },
        data: { isOpen: true },
        select: { id: true },
      });

      return {
        ...shift,
        cancelledAt: null,
        cancelNote: null,
      } satisfies ActiveShift;
    });
  } catch (e) {
    if (e instanceof ShiftGateError) throw e;
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const recovered = await getActiveShift(params.branchId);
      if (recovered) return recovered;
      throw new ShiftGateError(
        "เปิดร้านไม่สำเร็จ (ชนกับรอบอื่น) — ลองใหม่อีกครั้ง",
        409,
      );
    }
    throw e;
  }
}

export async function closeActiveShift(params: {
  branchId: string;
  closedByStaffId?: string | null;
  /**
   * Cash counted in drawer at close.
   * If omitted (cron / legacy), uses calculated expected drawer cash.
   */
  closingCash?: number;
  at?: Date;
}): Promise<{ shift: ActiveShift; summary: ShiftSummary }> {
  const at = params.at ?? new Date();

  const activePreview = await prisma.branchShift.findFirst({
    where: { branchId: params.branchId, closedAt: null },
    select: baseShiftSelect,
  });
  if (!activePreview) {
    throw new ShiftGateError("ไม่มีรอบที่เปิดอยู่", 409);
  }

  let closingCash =
    params.closingCash != null ? Number(params.closingCash) : NaN;
  if (!Number.isFinite(closingCash) || closingCash < 0) {
    try {
      const preview = await buildShiftSummary(activePreview.id);
      const cashExp = await prisma.branchExpense.aggregate({
        where: { shiftId: activePreview.id, payChannel: "CASH" },
        _sum: { amount: true },
      });
      closingCash = Math.max(
        0,
        Math.round(
          (Number(preview.expectedCash) - Number(cashExp._sum.amount ?? 0)) *
            100,
        ) / 100,
      );
    } catch {
      closingCash = Math.max(0, Number(activePreview.openingCash) || 0);
    }
  }

  const closed = await prisma.$transaction(async (tx) => {
    const active = await tx.branchShift.findFirst({
      where: { branchId: params.branchId, closedAt: null },
      select: baseShiftSelect,
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
      select: baseShiftSelect,
    });

    // closingCash may lag Prisma generate — write via SQL
    try {
      await tx.$executeRaw`
        UPDATE ${branchShiftTableSql()}
        SET "closingCash" = ${closingCash}
        WHERE id = ${shift.id}
      `;
    } catch (e) {
      console.error(
        "[closeActiveShift] closingCash update skipped",
        e instanceof Error ? e.message : e,
      );
    }

    // select only id — avoid RETURNING every Branch column (isTest etc.)
    await tx.branch.update({
      where: { id: params.branchId },
      data: { isOpen: false },
      select: { id: true },
    });

    return {
      ...shift,
      cancelledAt: null,
      cancelNote: null,
    } satisfies ActiveShift;
  });

  // Summary/LINE must never fail the close (DB already committed).
  // Awaiting external LINE or heavy stock summary used to 504 the gateway
  // while the shop was already closed — staff saw "ปิดไม่สำเร็จ" and stuck UI.
  let summary: ShiftSummary;
  try {
    summary = await buildShiftSummary(closed.id);
  } catch (e) {
    console.error(
      "[branch-shift] buildShiftSummary after close failed",
      closed.id,
      e instanceof Error ? e.message : e,
    );
    summary = fallbackShiftSummary(closed);
  }

  void import("@/lib/line-shift-summary")
    .then(({ sendShiftCloseLineSummary }) =>
      sendShiftCloseLineSummary(summary),
    )
    .catch((e) => {
      console.error(
        "[branch-shift] LINE shift summary failed",
        closed.id,
        e instanceof Error ? e.message : e,
      );
    });

  return { shift: closed, summary };
}

/**
 * Suggested float when opening a new round:
 * prefer last counted closingCash, else calculated drawer (opening + cash sales − cash expenses).
 */
export async function getSuggestedOpeningCash(branchId: string): Promise<{
  amount: number;
  source: "counted" | "expected" | "none";
  label: string;
  lastClosedAt: string | null;
  expectedCash: number | null;
  closingCash: number | null;
}> {
  const recent = await prisma.branchShift.findMany({
    where: { branchId, closedAt: { not: null } },
    orderBy: { closedAt: "desc" },
    take: 12,
    select: baseShiftSelect,
  });
  const withMeta = await attachCancelMeta(recent);
  const last = withMeta.find((s) => !s.cancelledAt) ?? null;
  if (!last?.closedAt) {
    return {
      amount: 0,
      source: "none",
      label: "ยังไม่มีรอบก่อนหน้า — กรอกเงินสดในลิ้นชักตอนนี้",
      lastClosedAt: null,
      expectedCash: null,
      closingCash: null,
    };
  }

  let closingCash: number | null = null;
  try {
    const rows = await prisma.$queryRaw<Array<{ closingCash: unknown }>>`
      SELECT "closingCash"
      FROM ${branchShiftTableSql()}
      WHERE id = ${last.id}
      LIMIT 1
    `;
    const raw = rows[0]?.closingCash;
    if (raw != null && Number.isFinite(Number(raw))) {
      closingCash = Math.round(Number(raw) * 100) / 100;
    }
  } catch {
    closingCash = null;
  }

  let expectedCash = Number(last.openingCash);
  try {
    const summary = await buildShiftSummary(last.id);
    expectedCash = Number(summary.expectedCash);
    const cashExp = await prisma.branchExpense.aggregate({
      where: {
        shiftId: last.id,
        payChannel: "CASH",
      },
      _sum: { amount: true },
    });
    expectedCash =
      Math.round(
        (expectedCash - Number(cashExp._sum.amount ?? 0)) * 100,
      ) / 100;
    if (expectedCash < 0) expectedCash = 0;
  } catch {
    /* keep openingCash fallback */
  }

  if (closingCash != null) {
    return {
      amount: closingCash,
      source: "counted",
      label: "ยกมาจากยอดนับเงินสดตอนปิดรอบล่าสุด (แก้ได้)",
      lastClosedAt: last.closedAt.toISOString(),
      expectedCash,
      closingCash,
    };
  }

  return {
    amount: expectedCash,
    source: "expected",
    label: "ประมาณจากรอบก่อน (ตั้งต้น + ขายสด − จ่ายสด) แก้ได้ตามที่นับได้",
    lastClosedAt: last.closedAt.toISOString(),
    expectedCash,
    closingCash: null,
  };
}

/** Minimal summary when full build fails after a successful close. */
function fallbackShiftSummary(shift: ActiveShift): ShiftSummary {
  const calendarDate = shiftCalendarDateKey(shift);
  const openingCash = Number(shift.openingCash);
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
      cancelledAt: null,
      cancelNote: null,
      isCancelled: false,
    },
    totalOrders: 0,
    cancelledOrders: 0,
    orderCount: 0,
    completedOrders: 0,
    revenueBaht: 0,
    cashRevenueBaht: 0,
    transferRevenueBaht: 0,
    cardRevenueBaht: 0,
    expectedCash: openingCash,
    totalWithOpeningCash: openingCash,
    giftQuantity: 0,
    cancelledRevenueBaht: 0,
    cancelledItemQuantity: 0,
    stockRestoredQuantity: 0,
    stockRestored: [],
    menus: [],
    channels: [],
    stockDeductions: [],
  };
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
      select: { id: true },
    });
    return null;
  }
  const { shift } = await closeActiveShift({
    branchId: params.branchId,
    closedByStaffId: null,
  });
  return shift;
}

export type CloseShiftsPastMidnightResult = {
  checked: number;
  closed: number;
  branchIds: string[];
  errors: string[];
};

/**
 * Auto-close any open shift whose calendar date is not today's Bangkok date.
 * Safe to call from cron every few minutes (fires after local midnight).
 */
export async function closeShiftsPastMidnight(
  at: Date = new Date(),
): Promise<CloseShiftsPastMidnightResult> {
  const result: CloseShiftsPastMidnightResult = {
    checked: 0,
    closed: 0,
    branchIds: [],
    errors: [],
  };

  const today = bangkokDateKey(at);
  const openShifts = await prisma.branchShift.findMany({
    where: { closedAt: null },
    select: baseShiftSelect,
  });

  for (const row of openShifts) {
    result.checked += 1;
    const shiftDay = shiftCalendarDateKey(row);
    if (shiftDay === today) continue;

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

/** @deprecated Use closeShiftsPastMidnight */
export const closeShiftsPastCutoff = closeShiftsPastMidnight;


type OrderForSummary = {
  status: string;
  awaitingPhotoKey: boolean;
  paymentMethod: PaymentMethod;
  salesChannel?: SalesChannel | string | null;
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
  let cancelledRevenueBaht = 0;
  let cancelledItemQuantity = 0;
  const menuMap = new Map<string, ShiftSummaryMenuRow>();
  const channelMap = new Map<
    string,
    { channel: string; orderCount: number; revenueBaht: number }
  >();

  for (const o of orders) {
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
    const itemQty = o.items.reduce(
      (n, item) =>
        n +
        Math.max(0, Number(item.quantity ?? 0)) +
        Math.max(0, Number(item.giftQuantity ?? 0)),
      0,
    );

    if (isCancelledStatus(o.status as never)) {
      cancelledOrders += 1;
      cancelledRevenueBaht += total;
      cancelledItemQuantity += itemQty;
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
    revenueBaht += total;

    if (o.paymentMethod === "CASH") cashRevenueBaht += total;
    else if (o.paymentMethod === "TRANSFER") transferRevenueBaht += total;
    else if (o.paymentMethod === "CARD") cardRevenueBaht += total;

    const channelKey = String(o.salesChannel || "STOREFRONT");
    const chPrev = channelMap.get(channelKey);
    if (chPrev) {
      chPrev.orderCount += 1;
      chPrev.revenueBaht += total;
    } else {
      channelMap.set(channelKey, {
        channel: channelKey,
        orderCount: 1,
        revenueBaht: total,
      });
    }

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
  const cancelledAt = shift.cancelledAt?.toISOString() ?? null;
  const cancelNote = shift.cancelNote?.trim() || null;
  const menus = [...menuMap.values()].sort(
    (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "th"),
  );
  const channels: ShiftSummaryChannelRow[] = [...channelMap.values()]
    .map((c) => ({
      channel: c.channel,
      label:
        SALES_CHANNEL_LABELS[c.channel as SalesChannel] ??
        c.channel,
      orderCount: c.orderCount,
      revenueBaht: Math.round(c.revenueBaht * 100) / 100,
    }))
    .sort(
      (a, b) =>
        b.revenueBaht - a.revenueBaht ||
        a.label.localeCompare(b.label, "th"),
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
      cancelledAt,
      cancelNote,
      isCancelled: Boolean(shift.cancelledAt),
    },
    totalOrders: orders.length,
    cancelledOrders,
    orderCount: orders.length - cancelledOrders,
    completedOrders,
    revenueBaht: Math.round(revenueBaht * 100) / 100,
    cashRevenueBaht: Math.round(cashRevenueBaht * 100) / 100,
    transferRevenueBaht: Math.round(transferRevenueBaht * 100) / 100,
    cardRevenueBaht: Math.round(cardRevenueBaht * 100) / 100,
    expectedCash: Math.round((openingCash + cashRevenueBaht) * 100) / 100,
    totalWithOpeningCash: openingCash + revenueBaht,
    giftQuantity,
    cancelledRevenueBaht: Math.round(cancelledRevenueBaht * 100) / 100,
    cancelledItemQuantity,
    stockRestoredQuantity: 0,
    stockRestored: [],
    menus,
    channels,
    stockDeductions: [],
  };
}

export async function buildShiftSummary(shiftId: string): Promise<ShiftSummary> {
  const row = await prisma.branchShift.findUnique({
    where: { id: shiftId },
    select: baseShiftSelect,
  });
  if (!row) {
    throw new ShiftGateError("ไม่พบรอบ", 404);
  }
  const shift = await attachCancelMetaOne(row);
  if (!shift) {
    throw new ShiftGateError("ไม่พบรอบ", 404);
  }

  const orders = await prisma.order.findMany({
    where: { shiftId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      awaitingPhotoKey: true,
      paymentMethod: true,
      salesChannel: true,
      deliveryFee: true,
      discountAmount: true,
      stockDeducted: true,
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

  const base = computeShiftSummaryFromOrders(shift, orders);
  const deductedOrders = orders
    .filter((o) => o.stockDeducted)
    .map((o) => ({ id: o.id, orderNumber: o.orderNumber }));
  const cancelledOrderRefs = orders
    .filter((o) => isCancelledStatus(o.status as never))
    .map((o) => ({ id: o.id, orderNumber: o.orderNumber }));

  const [stockDeductions, stockRestored] = await Promise.all([
    aggregateBranchMenuStockSalesByOrders(shift.branchId, deductedOrders),
    aggregateBranchMenuStockSalesByOrders(shift.branchId, cancelledOrderRefs),
  ]);

  const stockRestoredQuantity = stockRestored.reduce(
    (n, row) => n + row.quantity,
    0,
  );

  return {
    ...base,
    stockDeductions,
    stockRestored,
    stockRestoredQuantity,
  };
}

export async function listShiftsForBranchDate(
  branchId: string,
  calendarDateKey: string,
) {
  const calendarDate = queueBusinessDateFromKey(calendarDateKey);
  const rows = await prisma.branchShift.findMany({
    where: { branchId, calendarDate },
    select: baseShiftSelect,
    orderBy: { roundNumber: "asc" },
  });
  const shifts = await attachCancelMeta(rows);
  return shifts.map(serializeShift);
}

export async function listShiftsForBranchDateRange(
  branchId: string,
  fromKey: string,
  toKey: string,
) {
  const from = fromKey <= toKey ? fromKey : toKey;
  const to = fromKey <= toKey ? toKey : fromKey;
  const rows = await prisma.branchShift.findMany({
    where: {
      branchId,
      calendarDate: {
        gte: queueBusinessDateFromKey(from),
        lte: queueBusinessDateFromKey(to),
      },
    },
    select: baseShiftSelect,
    orderBy: [{ calendarDate: "desc" }, { roundNumber: "desc" }],
  });
  const shifts = await attachCancelMeta(rows);
  return shifts.map(serializeShift);
}

export type CancelShiftResult = ActiveShift & {
  /** Orders newly marked CANCELLED in this call */
  cancelledOrderCount: number;
  /** Orders that had stock restored (stockDeducted → false) */
  restoredStockOrderCount: number;
};

/**
 * Admin: mark a shift as cancelled.
 * - If still open, closes it and sets branch closed.
 * - Cancels every non-cancelled order in the shift (encodes prior status).
 * - Restores stock for any order that still has stockDeducted=true.
 */
export async function cancelShift(params: {
  shiftId: string;
  branchId: string;
  cancelNote?: string | null;
  at?: Date;
}): Promise<CancelShiftResult> {
  const at = params.at ?? new Date();
  const cancelNote = params.cancelNote?.trim() || null;
  const orderCancelNote = (
    cancelNote || "ยกเลิกรอบขาย — ยกเลิกออเดอร์และคืนสต๊อก"
  ).slice(0, 160);

  return prisma.$transaction(
    async (tx) => {
      const row = await tx.branchShift.findFirst({
        where: { id: params.shiftId, branchId: params.branchId },
        select: baseShiftSelect,
      });
      if (!row) {
        throw new ShiftGateError("ไม่พบรอบ", 404);
      }

      const meta = await loadCancelMetaByIds([row.id]);
      if (meta.get(row.id)?.cancelledAt) {
        throw new ShiftGateError("รอบนี้ถูกยกเลิกไว้แล้ว", 409);
      }

      const wasOpen = row.closedAt == null;

      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE ${branchShiftTableSql()}
        SET
          "cancelledAt" = ${at},
          "cancelNote" = ${cancelNote},
          "closedAt" = COALESCE("closedAt", ${at})
        WHERE id = ${row.id}
          AND "branchId" = ${params.branchId}
          AND "cancelledAt" IS NULL
        RETURNING id
      `;
      if (updated.length === 0) {
        throw new ShiftGateError("ยกเลิกรอบไม่สำเร็จ", 409);
      }

      if (wasOpen) {
        await tx.branch.update({
          where: { id: params.branchId },
          data: { isOpen: false },
          select: { id: true },
        });
      }

      const openOrders = await tx.order.findMany({
        where: {
          shiftId: row.id,
          branchId: params.branchId,
          status: { not: OrderStatus.CANCELLED },
        },
        select: { id: true, status: true },
      });

      for (const o of openOrders) {
        await tx.order.update({
          where: { id: o.id },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: at,
            cancelReason: encodeShiftCancelReason(o.status, orderCancelNote),
            awaitingPhotoKey: false,
          },
        });
      }

      const deductedOrders = await tx.order.findMany({
        where: {
          shiftId: row.id,
          branchId: params.branchId,
          stockDeducted: true,
        },
        select: { id: true },
      });

      for (const o of deductedOrders) {
        await restoreStockForOrder(o.id, tx);
      }

      const refreshed = await tx.branchShift.findUnique({
        where: { id: row.id },
        select: baseShiftSelect,
      });
      if (!refreshed) {
        throw new ShiftGateError("ไม่พบรอบ", 404);
      }
      return {
        ...refreshed,
        cancelledAt: at,
        cancelNote,
        cancelledOrderCount: openOrders.length,
        restoredStockOrderCount: deductedOrders.length,
      };
    },
    {
      maxWait: 15_000,
      timeout: 120_000,
    },
  );
}

export type RestoreShiftResult = ActiveShift & {
  restoredOrderCount: number;
  restockedOrderCount: number;
};

/**
 * Admin: undo a mistaken shift cancel.
 * - Clears shift cancelled flag
 * - Restores orders that were bulk-cancelled by this shift cancel
 * - Re-deducts stock for those orders
 * Does not re-open the branch or the shift window.
 */
export async function restoreCancelledShift(params: {
  shiftId: string;
  branchId: string;
}): Promise<RestoreShiftResult> {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.branchShift.findFirst({
        where: { id: params.shiftId, branchId: params.branchId },
        select: baseShiftSelect,
      });
      if (!row) {
        throw new ShiftGateError("ไม่พบรอบ", 404);
      }

      const meta = await loadCancelMetaByIds([row.id]);
      if (!meta.get(row.id)?.cancelledAt) {
        throw new ShiftGateError("รอบนี้ไม่ได้ถูกยกเลิก", 409);
      }

      await tx.$executeRaw`
        UPDATE ${branchShiftTableSql()}
        SET "cancelledAt" = NULL, "cancelNote" = NULL
        WHERE id = ${row.id}
          AND "branchId" = ${params.branchId}
      `;

      const bulkCancelled = await tx.order.findMany({
        where: {
          shiftId: row.id,
          branchId: params.branchId,
          status: OrderStatus.CANCELLED,
        },
        select: { id: true, cancelReason: true },
      });

      const toRestore = bulkCancelled.filter((o) =>
        isShiftBulkCancelReason(o.cancelReason),
      );

      for (const o of toRestore) {
        const prev = prevStatusFromShiftCancelReason(o.cancelReason);
        await tx.order.update({
          where: { id: o.id },
          data: {
            status: prev,
            cancelledAt: null,
            cancelReason: null,
          },
        });
        await reapplyStockForOrder(o.id, tx);
      }

      const refreshed = await tx.branchShift.findUnique({
        where: { id: row.id },
        select: baseShiftSelect,
      });
      if (!refreshed) {
        throw new ShiftGateError("ไม่พบรอบ", 404);
      }
      return {
        ...refreshed,
        cancelledAt: null,
        cancelNote: null,
        restoredOrderCount: toRestore.length,
        restockedOrderCount: toRestore.length,
      };
    },
    {
      maxWait: 15_000,
      timeout: 120_000,
    },
  );
}
