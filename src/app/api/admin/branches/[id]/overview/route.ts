import { prisma } from "@/lib/db";
import { requireBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  bangkokDateKey,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import {
  expenseDateFromKey,
  summarizeExpenses,
} from "@/lib/branch-expense";
import {
  isCancelledStatus,
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";

type Params = { params: Promise<{ id: string }> };

const WASTE_HISTORY_TYPES = ["ISSUE", "DAMAGE", "LOST"] as const;

function normalizeRange(fromRaw: string, toRaw: string) {
  return fromRaw <= toRaw
    ? { from: fromRaw, to: toRaw }
    : { from: toRaw, to: fromRaw };
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

function rangeCreatedAt(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00+07:00`),
    lte: new Date(`${to}T23:59:59.999+07:00`),
  };
}

/** GET — branch overview summary for a date range. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    if (
      !fromParam ||
      !toParam ||
      !isBangkokDateKey(fromParam) ||
      !isBangkokDateKey(toParam)
    ) {
      return jsonError("ต้องระบุ from/to เป็น YYYY-MM-DD");
    }

    const { from, to } = normalizeRange(fromParam, toParam);
    const createdAtRange = rangeCreatedAt(from, to);

    const [orders, expenses, menuItems, menuWaste] = await Promise.all([
      prisma.order.findMany({
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
          paymentMethod: true,
          deliveryFee: true,
          discountAmount: true,
          queueBusinessDate: true,
          items: {
            select: { quantity: true, unitPrice: true, optionsPrice: true },
          },
        },
      }),
      prisma.branchExpense.findMany({
        where: {
          branchId,
          expenseDate: {
            gte: expenseDateFromKey(from),
            lte: new Date(`${to}T23:59:59.999+07:00`),
          },
        },
        select: { amount: true, payChannel: true },
      }),
      prisma.branchMenuItem.findMany({
        where: { branchId, isHidden: false },
        select: {
          id: true,
          price: true,
          stock: { select: { quantity: true } },
          category: { select: { stockExempt: true } },
          optionGroupLinks: {
            select: { group: { select: { mode: true } } },
          },
        },
      }),
      prisma.branchMenuItemStockHistory.findMany({
        where: {
          branchId,
          type: { in: [...WASTE_HISTORY_TYPES] },
          createdAt: createdAtRange,
        },
        select: { menuItemId: true, quantity: true },
      }),
    ]);

    let completedRevenue = 0;
    let cashRevenue = 0;
    let transferRevenue = 0;
    let completedOrderCount = 0;
    let cancelledCount = 0;

    const days = buildDateRange(from, to);
    const byDay = new Map(days.map((d) => [d.date, d]));

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
      const dayKey = bangkokDateKey(order.queueBusinessDate);
      const bucket = byDay.get(dayKey);

      if (
        isOrderCountableRevenue({
          status: order.status,
          awaitingPhotoKey: order.awaitingPhotoKey,
        })
      ) {
        completedRevenue += total;
        completedOrderCount += 1;
        if (order.paymentMethod === "CASH") cashRevenue += total;
        else if (order.paymentMethod === "TRANSFER") transferRevenue += total;
        if (bucket) bucket.revenue += total;
      } else if (isCancelledStatus(order.status)) {
        cancelledCount += 1;
        if (bucket) bucket.cancelled += 1;
      }
    }

    const expenseSummary = summarizeExpenses(
      expenses.map((e) => ({
        amount: Number(e.amount),
        payChannel: e.payChannel as "CASH" | "TRANSFER",
      })),
    );

    // สต๊อกขาย (เมนู SALE_ITEM) เท่านั้น — ไม่รวมสิ้นเปลือง/อุปกรณ์ (ถุง แก้ว ซอส ฯลฯ)
    let stockValue = 0;
    let stockQty = 0;
    const priceByMenuId = new Map<string, number>();
    for (const item of menuItems) {
      const price = Number(item.price ?? 0);
      priceByMenuId.set(item.id, price);
      const isPromo = item.optionGroupLinks.some(
        (l) => l.group.mode === "FROM_MENU",
      );
      if (isPromo || item.category?.stockExempt) continue;
      const qty = Math.max(0, Number(item.stock?.quantity ?? 0));
      stockQty += qty;
      stockValue += qty * price;
    }

    // ของเสียขาย = waste ของเมนูขาย (SALE_ITEM)
    let wasteQty = 0;
    let wasteValue = 0;
    for (const row of menuWaste) {
      const qty = Math.abs(row.quantity);
      if (qty <= 0) continue;
      const unitPrice = priceByMenuId.get(row.menuItemId) ?? 0;
      wasteQty += qty;
      wasteValue += qty * unitPrice;
    }

    const netRevenue = completedRevenue - expenseSummary.total;

    return jsonOk({
      from,
      to,
      completedRevenue: Math.round(completedRevenue * 100) / 100,
      cashRevenue: Math.round(cashRevenue * 100) / 100,
      transferRevenue: Math.round(transferRevenue * 100) / 100,
      completedOrderCount,
      cancelledCount,
      stockQty,
      stockValue: Math.round(stockValue * 100) / 100,
      wasteQty,
      wasteValue: Math.round(wasteValue * 100) / 100,
      expenseTotal: expenseSummary.total,
      expenseCount: expenseSummary.count,
      cashExpense: Math.round(expenseSummary.cash * 100) / 100,
      transferExpense: Math.round(expenseSummary.transfer * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      days,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
