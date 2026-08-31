/**
 * Simulate live store activity for the malawaiwai-demo brand.
 *
 * Cron mode (`runDemoActivityTick`): every ~15 min during 10:00–23:00 Bangkok —
 * open shift once, drip sales/stock/expenses through the day with real timestamps.
 *
 * Batch mode (`runDemoDailyActivityBatch`): backfill a whole business day at once.
 */
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
  SalesChannel,
  FulfillmentType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  bangkokDateKey,
  generateOrderNumber,
  queueBusinessDateFromKey,
  startOfBangkokDayFromKey,
} from "@/lib/constants";
import { expenseDateFromKey } from "@/lib/branch-expense";
import { EXPENSE_QUICK_TITLES } from "@/lib/branch-expense-ui";
import {
  closeActiveShift,
  getActiveShift,
  openShift,
  shiftCalendarDateKey,
} from "@/lib/branch-shift";
import { createOrderWithDailyQueue } from "@/lib/order-queue";
import {
  deductBranchMenuStockForOrder,
  deductStockForOrder,
} from "@/lib/stock";
import { isPromoMenuItem } from "@/lib/staff-key-order";
import { MALAWAIWAI_DEMO_BRAND_CODE } from "@/lib/malawaiwai-demo-setup";
import {
  simulateDemoConsumablesBatch,
  simulateDemoConsumablesTick,
} from "@/lib/malawaiwai-demo-consumables";

const DEMO_AUTO_NOTE = "[demo-auto]";

/** Bangkok business hours for demo sales simulation. */
export const DEMO_BUSINESS_OPEN_HOUR = 10;
export const DEMO_BUSINESS_CLOSE_HOUR = 23;

export type DemoDailyActivityOptions = {
  /** Bangkok YYYY-MM-DD — default today */
  dateKey?: string;
  /** Batch only: skip branches that already have demo-auto orders on this date */
  skipIfRan?: boolean;
  /** Tick only: override "now" (tests / manual replay) */
  now?: Date;
};

export type DemoDailyBranchResult = {
  branchId: string;
  branchName: string;
  skipped?: boolean;
  phase?: "before_hours" | "sales" | "closing" | "after_hours";
  shiftOpened?: boolean;
  shiftClosed?: boolean;
  stockIns?: number;
  orders?: number;
  expenses?: number;
  wasteEvents?: number;
  consumableStockIns?: number;
  consumableIssues?: number;
  equipmentStockIns?: number;
  error?: string;
};

export type DemoDailyActivityResult = {
  brandCode: string;
  dateKey: string;
  mode: "tick" | "batch";
  bangkokHour?: number;
  branches: DemoDailyBranchResult[];
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)]!;
}

function randomPickN<T>(items: T[], n: number): T[] {
  const copy = [...items];
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = randomInt(0, copy.length - 1);
    out.push(copy[idx]!);
    copy.splice(idx, 1);
  }
  return out;
}

/** Current hour (0–23) in Asia/Bangkok. */
export function bangkokHour(now = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return Number.parseInt(hour, 10);
}

/** Random Date on a Bangkok calendar day between startHour and endHour inclusive. */
function randomTimeOnDay(dateKey: string, startHour: number, endHour: number) {
  const hour = randomInt(startHour, endHour);
  const minute = randomInt(0, 59);
  const second = randomInt(0, 59);
  return new Date(
    `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+07:00`,
  );
}

/** Timestamp within the last `maxMinutesBack` minutes (for drip orders). */
function randomRecentTime(now: Date, maxMinutesBack: number) {
  const backMs =
    randomInt(0, maxMinutesBack) * 60_000 + randomInt(0, 59) * 1000;
  return new Date(now.getTime() - backMs);
}

/** ~1 in 4 calendar days per branch — waste is occasional, not daily. */
function shouldDemoWasteToday(dateKey: string, branchId: string): boolean {
  const key = `${dateKey}:${branchId}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 4 === 0;
}

async function demoWasteAlreadyToday(
  branchId: string,
  dateKey: string,
): Promise<boolean> {
  const count = await prisma.branchMenuItemStockHistory.count({
    where: {
      branchId,
      type: "DAMAGE",
      note: { contains: DEMO_AUTO_NOTE },
      createdAt: { gte: startOfBangkokDayFromKey(dateKey) },
    },
  });
  return count > 0;
}

/** How many orders to create on this cron tick (lunch/dinner peaks). */
function ordersForTick(hour: number): number {
  if (hour >= 11 && hour <= 13) return randomInt(1, 3);
  if (hour >= 17 && hour <= 20) return randomInt(2, 4);
  if (hour >= 21 && hour <= 22) return randomInt(0, 2);
  return randomInt(0, 2);
}

async function loadDemoStoreBranches() {
  const brand = await prisma.brand.findUnique({
    where: { code: MALAWAIWAI_DEMO_BRAND_CODE },
    select: { id: true, code: true },
  });
  if (!brand) {
    throw new Error(`ไม่พบแบรนด์ ${MALAWAIWAI_DEMO_BRAND_CODE}`);
  }

  const branches = await prisma.branch.findMany({
    where: {
      brandId: brand.id,
      kind: "STORE",
      isHidden: false,
      operatingMode: { not: "SKEWER" },
      staff: { some: { isActive: true } },
    },
    select: {
      id: true,
      name: true,
      code: true,
      staff: {
        where: { isActive: true },
        take: 1,
        select: { id: true, phone: true, name: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return { brand, branches };
}

async function loadTrackableMenu(branchId: string) {
  const menuItems = await prisma.branchMenuItem.findMany({
    where: { branchId, isHidden: false },
    include: {
      category: { select: { stockExempt: true } },
      optionGroupLinks: { include: { group: { select: { mode: true } } } },
      stock: { select: { quantity: true } },
    },
  });
  return menuItems.filter((m) => !isPromoMenuItem(m));
}

async function stockInMenuItem(opts: {
  branchId: string;
  menuItemId: string;
  quantity: number;
  staffId: string;
  note: string;
  at: Date;
  dateKey: string;
}) {
  const { branchId, menuItemId, quantity, staffId, note, at, dateKey } = opts;
  const menuItem = await prisma.branchMenuItem.findFirst({
    where: { id: menuItemId, branchId },
    include: { stock: true },
  });
  if (!menuItem) return;

  const oldQty = menuItem.stock?.quantity ?? 0;
  const newQty = oldQty + quantity;
  const receiveAt = startOfBangkokDayFromKey(dateKey);

  await prisma.$transaction(async (tx) => {
    await tx.branchMenuItemStock.upsert({
      where: { menuItemId },
      update: { quantity: newQty },
      create: { branchId, menuItemId, quantity: newQty },
    });
    await tx.branchMenuItem.update({
      where: { id: menuItemId },
      data: { isOutOfStock: newQty <= 0 },
    });
    await tx.branchMenuItemStockHistory.create({
      data: {
        branchId,
        menuItemId,
        quantity,
        type: "STOCK_IN",
        note,
        receivedAt: receiveAt,
        createdAt: at,
        createdByStaffId: staffId,
      },
    });
  });
}

async function recordWaste(opts: {
  branchId: string;
  menuItemId: string;
  quantity: number;
  staffId: string;
  at: Date;
}) {
  const { branchId, menuItemId, quantity, staffId, at } = opts;
  const menuItem = await prisma.branchMenuItem.findFirst({
    where: { id: menuItemId, branchId },
    include: { stock: true },
  });
  if (!menuItem) return;

  const oldQty = menuItem.stock?.quantity ?? 0;
  const newQty = Math.max(0, oldQty - quantity);
  const actualDiff = newQty - oldQty;
  if (actualDiff === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.branchMenuItemStock.upsert({
      where: { menuItemId },
      update: { quantity: newQty },
      create: { branchId, menuItemId, quantity: newQty },
    });
    await tx.branchMenuItem.update({
      where: { id: menuItemId },
      data: { isOutOfStock: newQty <= 0 },
    });
    await tx.branchMenuItemStockHistory.create({
      data: {
        branchId,
        menuItemId,
        quantity: actualDiff,
        type: "DAMAGE",
        note: `${DEMO_AUTO_NOTE} ของเสียจำลอง`,
        createdAt: at,
        createdByStaffId: staffId,
      },
    });
  });
}

async function createDemoSaleOrder(opts: {
  branchId: string;
  staffId: string;
  shiftId: string;
  menuItem: { id: string; name: string; price: Prisma.Decimal };
  at: Date;
  dateKey: string;
  branchCode: string;
}) {
  const { branchId, staffId, shiftId, menuItem, at, dateKey, branchCode } =
    opts;

  const qty = randomInt(1, 4);
  const unitPrice = Number(menuItem.price);
  const paymentMethod =
    Math.random() < 0.75 ? PaymentMethod.CASH : PaymentMethod.TRANSFER;
  const salesChannels = [
    SalesChannel.STOREFRONT,
    SalesChannel.STOREFRONT,
    SalesChannel.FACEBOOK,
    SalesChannel.OTHER,
  ] as const;

  let customer = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const customerPhone = `089${String(Date.now() % 100000000).padStart(8, "0")}${randomInt(0, 9)}`;
    try {
      customer = await prisma.customer.create({
        data: {
          phone: customerPhone,
          name: randomPick(["ลูกค้าหน้าร้าน", "ลูกค้า Demo", "คุณลูกค้า"]),
        },
      });
      break;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }
  if (!customer) return null;

  let order = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const orderNumber = `DA-${branchCode}-${generateOrderNumber()}`;
    try {
      order = await createOrderWithDailyQueue(
        branchId,
        (queue) => ({
          data: {
            orderNumber,
            queueNumber: queue.queueNumber,
            queueBusinessDate: queue.queueBusinessDate,
            customerId: customer.id,
            branchId,
            shiftId,
            fulfillmentType: FulfillmentType.PICKUP,
            customerName: "ลูกค้าหน้าร้าน",
            customerPhone: customer.phone,
            paymentMethod,
            salesChannel: randomPick([...salesChannels]),
            deliveryFee: new Prisma.Decimal(0),
            discountAmount: new Prisma.Decimal(0),
            status: OrderStatus.COMPLETED,
            stockDeducted: true,
            note: DEMO_AUTO_NOTE,
            createdByStaffId: staffId,
            createdAt: at,
            updatedAt: at,
            items: {
              create: [
                {
                  branchMenuItemId: menuItem.id,
                  itemName: menuItem.name,
                  quantity: qty,
                  unitPrice: new Prisma.Decimal(unitPrice),
                  optionsPrice: new Prisma.Decimal(0),
                },
              ],
            },
          },
        }),
        {
          at,
          queueBusinessDate: queueBusinessDateFromKey(dateKey),
        },
      );
      break;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }
  if (!order) return null;

  try {
    await deductStockForOrder(order.id);
    await deductBranchMenuStockForOrder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      branchId,
      staffId,
      lines: [{ branchMenuItemId: menuItem.id, quantity: qty }],
    });
  } catch {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: at,
        cancelReason: `${DEMO_AUTO_NOTE} สต๊อกไม่พอ`,
      },
    });
    return null;
  }

  return order;
}

async function closeDanglingShiftFromPriorDay(
  branchId: string,
  staffId: string,
  dateKey: string,
  at: Date,
) {
  const dangling = await getActiveShift(branchId);
  if (!dangling) return false;
  if (shiftCalendarDateKey(dangling) === dateKey) return false;
  await closeActiveShift({
    branchId,
    closedByStaffId: staffId,
    at,
  });
  return true;
}

async function morningStockIn(
  branchId: string,
  staffId: string,
  trackable: Awaited<ReturnType<typeof loadTrackableMenu>>,
  dateKey: string,
  at: Date,
) {
  let count = 0;
  for (const item of randomPickN(trackable, randomInt(4, 10))) {
    await stockInMenuItem({
      branchId,
      menuItemId: item.id,
      quantity: randomInt(8, 35),
      staffId,
      note: `${DEMO_AUTO_NOTE} รับเข้าเช้า`,
      at,
      dateKey,
    });
    count += 1;
  }
  return count;
}

/** Incremental tick — called every ~15 min during business hours. */
async function simulateBranchTick(
  branch: {
    id: string;
    name: string;
    code: string | null;
    staff: { id: string; phone: string; name: string | null }[];
  },
  dateKey: string,
  now: Date,
): Promise<DemoDailyBranchResult> {
  const result: DemoDailyBranchResult = {
    branchId: branch.id,
    branchName: branch.name,
    stockIns: 0,
    orders: 0,
    expenses: 0,
    wasteEvents: 0,
  };

  const staff = branch.staff[0];
  if (!staff) {
    result.error = "ไม่พบพนักงาน";
    return result;
  }

  const hour = bangkokHour(now);
  const branchCode = branch.code ?? "demo";

  if (hour < DEMO_BUSINESS_OPEN_HOUR) {
    result.skipped = true;
    result.phase = "before_hours";
    return result;
  }

  try {
    if (hour >= DEMO_BUSINESS_CLOSE_HOUR) {
      result.phase = "closing";
      const active = await getActiveShift(branch.id);
      if (active) {
        await closeActiveShift({
          branchId: branch.id,
          closedByStaffId: staff.id,
          at: now,
        });
        result.shiftClosed = true;
      } else {
        result.skipped = true;
        result.phase = "after_hours";
      }
      return result;
    }

    result.phase = "sales";
    await closeDanglingShiftFromPriorDay(branch.id, staff.id, dateKey, now);

    let activeShift = await getActiveShift(branch.id);
    const openedThisTick = !activeShift;

    if (!activeShift) {
      await openShift({
        branchId: branch.id,
        openingCash: randomInt(800, 2500),
        note: `${DEMO_AUTO_NOTE} เปิดร้าน`,
        openedByStaffId: staff.id,
        at: now,
      });
      result.shiftOpened = true;
      activeShift = await getActiveShift(branch.id);
    }

    if (!activeShift) {
      result.error = "เปิดรอบไม่สำเร็จ";
      return result;
    }

    const trackable = await loadTrackableMenu(branch.id);
    if (trackable.length === 0) {
      result.error = "ไม่มีเมนูที่ติดสต๊อก";
      return result;
    }

    if (openedThisTick) {
      result.stockIns = await morningStockIn(
        branch.id,
        staff.id,
        trackable,
        dateKey,
        now,
      );
    }

    const orderCount = ordersForTick(hour);
    for (let i = 0; i < orderCount; i++) {
      const item = randomPick(trackable);
      const created = await createDemoSaleOrder({
        branchId: branch.id,
        staffId: staff.id,
        shiftId: activeShift.id,
        menuItem: item,
        at: randomRecentTime(now, 14),
        dateKey,
        branchCode,
      });
      if (created) result.orders! += 1;
    }

    if (!openedThisTick && Math.random() < 0.1) {
      const item = randomPick(trackable);
      await stockInMenuItem({
        branchId: branch.id,
        menuItemId: item.id,
        quantity: randomInt(5, 20),
        staffId: staff.id,
        note: `${DEMO_AUTO_NOTE} รับเข้าเติม`,
        at: randomRecentTime(now, 10),
        dateKey,
      });
      result.stockIns! += 1;
    }

    const expenseToday = await prisma.branchExpense.count({
      where: {
        branchId: branch.id,
        note: DEMO_AUTO_NOTE,
        expenseDate: expenseDateFromKey(dateKey),
      },
    });
    if (expenseToday < 3 && Math.random() < 0.06) {
      await prisma.branchExpense.create({
        data: {
          branchId: branch.id,
          shiftId: activeShift.id,
          title: randomPick([...EXPENSE_QUICK_TITLES]),
          amount: new Prisma.Decimal(randomInt(80, 1200)),
          payChannel: Math.random() < 0.8 ? "CASH" : "TRANSFER",
          expenseDate: expenseDateFromKey(dateKey),
          note: DEMO_AUTO_NOTE,
          createdByStaffId: staff.id,
          createdAt: randomRecentTime(now, 12),
        },
      });
      result.expenses! += 1;
    }

    if (
      shouldDemoWasteToday(dateKey, branch.id) &&
      hour >= 16 &&
      hour <= 21 &&
      !(await demoWasteAlreadyToday(branch.id, dateKey)) &&
      Math.random() < 0.18
    ) {
      const wasteItem = randomPick(trackable);
      await recordWaste({
        branchId: branch.id,
        menuItemId: wasteItem.id,
        quantity: randomInt(1, 2),
        staffId: staff.id,
        at: randomRecentTime(now, 10),
      });
      result.wasteEvents! += 1;
    }

    const consumables = await simulateDemoConsumablesTick({
      branchId: branch.id,
      branchCode,
      staffId: staff.id,
      dateKey,
      now,
      openedThisTick,
      ordersCreated: result.orders ?? 0,
      hour,
    });
    result.consumableStockIns = consumables.consumableStockIns;
    result.consumableIssues = consumables.consumableIssues;
    result.equipmentStockIns = consumables.equipmentStockIns;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}

/** Batch backfill — simulate a full business day in one run (manual / recovery). */
async function simulateBranchDay(
  branch: {
    id: string;
    name: string;
    code: string | null;
    staff: { id: string; phone: string; name: string | null }[];
  },
  dateKey: string,
  skipIfRan: boolean,
): Promise<DemoDailyBranchResult> {
  const result: DemoDailyBranchResult = {
    branchId: branch.id,
    branchName: branch.name,
    phase: "sales",
    stockIns: 0,
    orders: 0,
    expenses: 0,
    wasteEvents: 0,
  };

  const staff = branch.staff[0];
  if (!staff) {
    result.error = "ไม่พบพนักงาน";
    return result;
  }

  if (skipIfRan) {
    const existing = await prisma.order.count({
      where: {
        branchId: branch.id,
        note: DEMO_AUTO_NOTE,
        queueBusinessDate: queueBusinessDateFromKey(dateKey),
      },
    });
    if (existing >= 5) {
      result.skipped = true;
      return result;
    }
  }

  const branchCode = branch.code ?? "demo";

  try {
    await closeDanglingShiftFromPriorDay(
      branch.id,
      staff.id,
      dateKey,
      randomTimeOnDay(dateKey, 8, 9),
    );

    await openShift({
      branchId: branch.id,
      openingCash: randomInt(800, 2500),
      note: `${DEMO_AUTO_NOTE} เปิดร้าน`,
      openedByStaffId: staff.id,
      at: randomTimeOnDay(dateKey, DEMO_BUSINESS_OPEN_HOUR, DEMO_BUSINESS_OPEN_HOUR),
    });
    result.shiftOpened = true;

    const activeShift = await getActiveShift(branch.id);
    if (!activeShift) {
      result.error = "เปิดรอบไม่สำเร็จ";
      return result;
    }

    const trackable = await loadTrackableMenu(branch.id);
    if (trackable.length === 0) {
      result.error = "ไม่มีเมนูที่ติดสต๊อก";
      return result;
    }

    result.stockIns = await morningStockIn(
      branch.id,
      staff.id,
      trackable,
      dateKey,
      randomTimeOnDay(dateKey, DEMO_BUSINESS_OPEN_HOUR, DEMO_BUSINESS_OPEN_HOUR + 1),
    );

    const orderCount = randomInt(18, 45);
    for (let i = 0; i < orderCount; i++) {
      const item = randomPick(trackable);
      const span = DEMO_BUSINESS_CLOSE_HOUR - DEMO_BUSINESS_OPEN_HOUR - 1;
      const hour =
        DEMO_BUSINESS_OPEN_HOUR +
        Math.floor((i / orderCount) * span);
      const created = await createDemoSaleOrder({
        branchId: branch.id,
        staffId: staff.id,
        shiftId: activeShift.id,
        menuItem: item,
        at: randomTimeOnDay(
          dateKey,
          Math.min(hour, DEMO_BUSINESS_CLOSE_HOUR - 2),
          Math.min(hour + 1, DEMO_BUSINESS_CLOSE_HOUR - 1),
        ),
        dateKey,
        branchCode,
      });
      if (created) result.orders! += 1;
    }

    const expenseCount = randomInt(1, 3);
    for (let i = 0; i < expenseCount; i++) {
      await prisma.branchExpense.create({
        data: {
          branchId: branch.id,
          shiftId: activeShift.id,
          title: randomPick([...EXPENSE_QUICK_TITLES]),
          amount: new Prisma.Decimal(randomInt(80, 1200)),
          payChannel: Math.random() < 0.8 ? "CASH" : "TRANSFER",
          expenseDate: expenseDateFromKey(dateKey),
          note: DEMO_AUTO_NOTE,
          createdByStaffId: staff.id,
          createdAt: randomTimeOnDay(dateKey, 12, 20),
        },
      });
      result.expenses! += 1;
    }

    if (shouldDemoWasteToday(dateKey, branch.id)) {
      const wasteItem = randomPick(trackable);
      await recordWaste({
        branchId: branch.id,
        menuItemId: wasteItem.id,
        quantity: randomInt(1, 2),
        staffId: staff.id,
        at: randomTimeOnDay(dateKey, 18, 21),
      });
      result.wasteEvents! += 1;
    }

    const consumables = await simulateDemoConsumablesBatch({
      branchId: branch.id,
      branchCode,
      staffId: staff.id,
      dateKey,
      ordersCreated: result.orders ?? 0,
      at: randomTimeOnDay(dateKey, DEMO_BUSINESS_OPEN_HOUR, 12),
    });
    result.consumableStockIns = consumables.consumableStockIns;
    result.consumableIssues = consumables.consumableIssues;
    result.equipmentStockIns = consumables.equipmentStockIns;

    await closeActiveShift({
      branchId: branch.id,
      closedByStaffId: staff.id,
      at: randomTimeOnDay(
        dateKey,
        DEMO_BUSINESS_CLOSE_HOUR,
        DEMO_BUSINESS_CLOSE_HOUR,
      ),
    });
    result.shiftClosed = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}

/** Cron entry — drip activity during 10:00–23:00 Bangkok. */
export async function runDemoActivityTick(
  options?: DemoDailyActivityOptions,
): Promise<DemoDailyActivityResult> {
  const now = options?.now ?? new Date();
  const dateKey = options?.dateKey ?? bangkokDateKey(now);
  const { brand, branches } = await loadDemoStoreBranches();

  const branchResults: DemoDailyBranchResult[] = [];
  for (const branch of branches) {
    branchResults.push(await simulateBranchTick(branch, dateKey, now));
  }

  return {
    brandCode: brand.code,
    dateKey,
    mode: "tick",
    bangkokHour: bangkokHour(now),
    branches: branchResults,
  };
}

/** Manual backfill — one-shot full-day simulation. */
export async function runDemoDailyActivityBatch(
  options?: DemoDailyActivityOptions,
): Promise<DemoDailyActivityResult> {
  const dateKey = options?.dateKey ?? bangkokDateKey();
  const skipIfRan = options?.skipIfRan !== false;
  const { brand, branches } = await loadDemoStoreBranches();

  const branchResults: DemoDailyBranchResult[] = [];
  for (const branch of branches) {
    branchResults.push(
      await simulateBranchDay(branch, dateKey, skipIfRan),
    );
  }

  return {
    brandCode: brand.code,
    dateKey,
    mode: "batch",
    branches: branchResults,
  };
}

/** @deprecated Use runDemoActivityTick (cron) or runDemoDailyActivityBatch (backfill). */
export async function runDemoDailyActivity(
  options?: DemoDailyActivityOptions,
): Promise<DemoDailyActivityResult> {
  return runDemoActivityTick(options);
}

export function isDemoDailyActivityEnabled() {
  return process.env.MALAWAIWAI_DEMO_DAILY_ENABLED === "1";
}
