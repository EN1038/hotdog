import { OrderStatus, PaymentMethod, SalesChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  PAYMENT_METHOD_LABELS,
  SALES_CHANNEL_LABELS,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { summarizeExpenses } from "@/lib/branch-expense";
import {
  isCancelledStatus,
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";
import type { SalesShareSlice } from "@/lib/sales-share";
import {
  EMPTY_SALES_REPORT_STATS,
  type SalesReportBranchShare,
  type SalesReportResult,
  type SalesReportStats,
} from "@/lib/sales-report-shared";

const WASTE_TYPES = ["ISSUE", "DAMAGE", "LOST"] as const;

function channelLabel(value: string) {
  if (value === "ORDER_CUSTOMER") return "ลูกค้าสั่งออนไลน์";
  return SALES_CHANNEL_LABELS[value as SalesChannel] ?? value;
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function bumpShare(
  map: Map<string, SalesShareSlice>,
  key: string,
  label: string,
  amount: number,
) {
  const row = map.get(key) ?? {
    key,
    label,
    completedRevenue: 0,
    completedCount: 0,
  };
  row.completedRevenue += amount;
  row.completedCount += 1;
  map.set(key, row);
}

function roundShares(rows: SalesShareSlice[]) {
  return rows
    .map((row) => ({
      ...row,
      completedRevenue: money(row.completedRevenue),
    }))
    .sort((a, b) => b.completedRevenue - a.completedRevenue);
}

export async function buildSalesReport(params: {
  branchIds: string[];
  branchNames?: Map<string, string>;
  from: string;
  to: string;
}): Promise<SalesReportResult> {
  const { branchIds, from, to } = params;
  const empty: SalesReportResult = {
    stats: { ...EMPTY_SALES_REPORT_STATS },
    byChannel: [],
    byPayment: [],
    byBranch: [],
  };
  if (branchIds.length === 0) return empty;

  const createdAtRange = {
    gte: new Date(`${from}T00:00:00+07:00`),
    lte: new Date(`${to}T23:59:59.999+07:00`),
  };
  const dateRange = {
    gte: queueBusinessDateFromKey(from),
    lte: queueBusinessDateFromKey(to),
  };

  const [orders, expenses, wasteHistory, menuPrices, shifts] =
    await Promise.all([
      prisma.order.findMany({
        where: {
          branchId: { in: branchIds },
          queueBusinessDate: dateRange,
        },
        select: {
          status: true,
          awaitingPhotoKey: true,
          salesChannel: true,
          paymentMethod: true,
          deliveryFee: true,
          discountAmount: true,
          branchId: true,
          branch: { select: { name: true } },
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              optionsPrice: true,
              giftQuantity: true,
            },
          },
        },
        take: 5000,
      }),
      prisma.branchExpense.findMany({
        where: {
          branchId: { in: branchIds },
          expenseDate: dateRange,
        },
        select: { amount: true, payChannel: true },
      }),
      prisma.branchMenuItemStockHistory.findMany({
        where: {
          branchId: { in: branchIds },
          type: { in: [...WASTE_TYPES] },
          cancelledAt: null,
          createdAt: createdAtRange,
        },
        select: { menuItemId: true, quantity: true },
      }),
      prisma.branchMenuItem.findMany({
        where: { branchId: { in: branchIds } },
        select: { id: true, price: true },
      }),
      prisma.branchShift.findMany({
        where: {
          branchId: { in: branchIds },
          calendarDate: dateRange,
          cancelledAt: null,
        },
        select: { openingCash: true },
      }),
    ]);

  const stats = { ...EMPTY_SALES_REPORT_STATS };
  const byChannel = new Map<string, SalesShareSlice>();
  const byPayment = new Map<string, SalesShareSlice>();
  const byBranchMap = new Map<string, SalesReportBranchShare>();

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
    stats.totalOrders += 1;

    if (isOrderCountableRevenue(order)) {
      stats.completedRevenue += total;
      stats.completedCount += 1;
      stats.discountTotal += Math.max(0, Number(order.discountAmount));
      if (order.paymentMethod === PaymentMethod.CASH) stats.cashRevenue += total;
      else stats.transferRevenue += total;

      bumpShare(
        byChannel,
        order.salesChannel,
        channelLabel(order.salesChannel),
        total,
      );
      bumpShare(
        byPayment,
        order.paymentMethod,
        PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ??
          order.paymentMethod,
        total,
      );

      let branch = byBranchMap.get(order.branchId);
      if (!branch) {
        branch = {
          branchId: order.branchId,
          branchName:
            params.branchNames?.get(order.branchId) || order.branch.name,
          completedRevenue: 0,
          completedCount: 0,
        };
        byBranchMap.set(order.branchId, branch);
      }
      branch.completedRevenue += total;
      branch.completedCount += 1;

      for (const item of order.items) {
        stats.soldQty += Math.max(0, item.quantity);
        stats.giftQuantity += Math.max(0, Number(item.giftQuantity ?? 0));
      }
    } else if (isCancelledStatus(order.status as OrderStatus)) {
      stats.cancelledCount += 1;
    } else {
      stats.openCount += 1;
    }
  }

  const expenseSummary = summarizeExpenses(
    expenses.map((row) => ({
      amount: Number(row.amount),
      payChannel: row.payChannel,
    })),
  );
  const priceByMenuId = new Map(
    menuPrices.map((item) => [item.id, Number(item.price ?? 0)]),
  );
  for (const row of wasteHistory) {
    const qty = Math.abs(row.quantity);
    if (qty <= 0) continue;
    stats.wasteQty += qty;
    stats.wasteValue += qty * (priceByMenuId.get(row.menuItemId) ?? 0);
  }

  stats.openingCash = shifts.reduce(
    (sum, shift) => sum + Number(shift.openingCash),
    0,
  );
  stats.expenseTotal = expenseSummary.total;
  stats.expenseCount = expenseSummary.count;
  stats.cashExpense = expenseSummary.cash;
  stats.transferExpense = expenseSummary.transfer;
  stats.customerCount = stats.completedCount;
  stats.expectedCash =
    stats.openingCash + stats.cashRevenue - stats.cashExpense;
  stats.netAfterExpenses = stats.completedRevenue - stats.expenseTotal;

  return {
    stats: {
      ...stats,
      completedRevenue: money(stats.completedRevenue),
      cashRevenue: money(stats.cashRevenue),
      transferRevenue: money(stats.transferRevenue),
      discountTotal: money(stats.discountTotal),
      expenseTotal: money(stats.expenseTotal),
      cashExpense: money(stats.cashExpense),
      transferExpense: money(stats.transferExpense),
      wasteValue: money(stats.wasteValue),
      openingCash: money(stats.openingCash),
      expectedCash: money(stats.expectedCash),
      netAfterExpenses: money(stats.netAfterExpenses),
    },
    byChannel: roundShares([...byChannel.values()]),
    byPayment: roundShares([...byPayment.values()]),
    byBranch: [...byBranchMap.values()]
      .map((row) => ({
        ...row,
        completedRevenue: money(row.completedRevenue),
      }))
      .sort((a, b) => b.completedRevenue - a.completedRevenue),
  };
}
