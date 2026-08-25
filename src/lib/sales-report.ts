import { OrderStatus, PaymentMethod, SalesChannel, FulfillmentType } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  FULFILLMENT_LABELS,
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
  TOP_CANCEL_REASONS,
  type SalesReportBranchShare,
  type SalesReportResult,
  type SalesReportWasteBranchSlice,
  type SalesReportWasteEntry,
  type SalesReportWasteItem,
} from "@/lib/sales-report-shared";

import { BRANCH_WASTE_HISTORY_TYPES } from "@/lib/stock-outbound";

const WASTE_TYPES = BRANCH_WASTE_HISTORY_TYPES;

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
    byFulfillment: [],
    byBranch: [],
    wasteItems: [],
    cancelReasons: [],
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
          fulfillmentType: true,
          deliveryFee: true,
          discountAmount: true,
          cancelReason: true,
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
        select: { branchId: true, amount: true, payChannel: true },
      }),
      prisma.branchMenuItemStockHistory.findMany({
        where: {
          branchId: { in: branchIds },
          type: { in: [...WASTE_TYPES] },
          cancelledAt: null,
          createdAt: createdAtRange,
        },
        select: {
          id: true,
          branchId: true,
          menuItemId: true,
          quantity: true,
          type: true,
          note: true,
          imageUrl: true,
          createdAt: true,
          menuItem: { select: { name: true, price: true } },
          createdByStaff: { select: { name: true } },
        },
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
  const byFulfillment = new Map<string, SalesShareSlice>();
  const byBranchMap = new Map<string, SalesReportBranchShare>();
  const cancelReasonMap = new Map<string, number>();

  function ensureBranch(branchId: string, branchName: string) {
    let branch = byBranchMap.get(branchId);
    if (!branch) {
      branch = {
        branchId,
        branchName,
        completedRevenue: 0,
        completedCount: 0,
        openCount: 0,
        cancelledCount: 0,
        cancelledRevenue: 0,
        cashRevenue: 0,
        transferRevenue: 0,
        soldQty: 0,
        expenseTotal: 0,
        expenseCount: 0,
        wasteQty: 0,
        wasteValue: 0,
        netAfterWaste: 0,
      };
      byBranchMap.set(branchId, branch);
    }
    return branch;
  }

  if (params.branchNames) {
    for (const [id, name] of params.branchNames) {
      ensureBranch(id, name);
    }
  }

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

    const branchRow = ensureBranch(
      order.branchId,
      params.branchNames?.get(order.branchId) || order.branch.name,
    );

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
      bumpShare(
        byFulfillment,
        order.fulfillmentType,
        FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType] ??
          order.fulfillmentType,
        total,
      );

      branchRow.completedRevenue += total;
      branchRow.completedCount += 1;
      if (order.paymentMethod === PaymentMethod.CASH) {
        branchRow.cashRevenue += total;
      } else {
        branchRow.transferRevenue += total;
      }

      for (const item of order.items) {
        const qty = Math.max(0, item.quantity);
        stats.soldQty += qty;
        stats.giftQuantity += Math.max(0, Number(item.giftQuantity ?? 0));
        branchRow.soldQty += qty;
      }
    } else if (isCancelledStatus(order.status as OrderStatus)) {
      stats.cancelledCount += 1;
      stats.cancelledRevenue += total;
      branchRow.cancelledCount += 1;
      branchRow.cancelledRevenue += total;
      const reason = order.cancelReason?.trim() || "ไม่ระบุเหตุผล";
      cancelReasonMap.set(reason, (cancelReasonMap.get(reason) ?? 0) + 1);
    } else {
      stats.openCount += 1;
      branchRow.openCount += 1;
    }
  }

  const cancelReasons = [...cancelReasonMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort(
      (a, b) =>
        b.count - a.count || a.reason.localeCompare(b.reason, "th"),
    )
    .slice(0, TOP_CANCEL_REASONS);

  const expenseSummary = summarizeExpenses(
    expenses.map((row) => ({
      amount: Number(row.amount),
      payChannel: row.payChannel,
    })),
  );
  for (const row of expenses) {
    const amount = Number(row.amount);
    const branchRow = ensureBranch(
      row.branchId,
      params.branchNames?.get(row.branchId) || "สาขา",
    );
    branchRow.expenseTotal += amount;
    branchRow.expenseCount += 1;
  }

  const priceByMenuId = new Map(
    menuPrices.map((item) => [item.id, Number(item.price ?? 0)]),
  );
  const wasteByMenu = new Map<
    string,
    SalesReportWasteItem & {
      entries: SalesReportWasteEntry[];
      branchMap: Map<string, SalesReportWasteBranchSlice>;
    }
  >();
  for (const row of wasteHistory) {
    const qty = Math.abs(row.quantity);
    if (qty <= 0) continue;
    const unitPrice =
      priceByMenuId.get(row.menuItemId) ?? Number(row.menuItem.price ?? 0);
    const lineValue = qty * unitPrice;
    stats.wasteQty += qty;
    stats.wasteValue += lineValue;
    const branchName =
      params.branchNames?.get(row.branchId) || "สาขา";
    const branchRow = ensureBranch(row.branchId, branchName);
    branchRow.wasteQty += qty;
    branchRow.wasteValue += lineValue;
    const entry: SalesReportWasteEntry = {
      id: row.id,
      quantity: qty,
      value: money(lineValue),
      note: row.note?.trim() || null,
      imageUrl: row.imageUrl?.trim() || null,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByStaff?.name?.trim() || null,
      type: row.type,
      branchId: row.branchId,
      branchName,
    };
    const prev = wasteByMenu.get(row.menuItemId);
    if (prev) {
      prev.quantity += qty;
      prev.value += lineValue;
      prev.entries.push(entry);
      const slice = prev.branchMap.get(row.branchId);
      if (slice) {
        slice.quantity += qty;
        slice.value += lineValue;
      } else {
        prev.branchMap.set(row.branchId, {
          branchId: row.branchId,
          branchName,
          quantity: qty,
          value: lineValue,
        });
      }
    } else {
      const branchMap = new Map<string, SalesReportWasteBranchSlice>();
      branchMap.set(row.branchId, {
        branchId: row.branchId,
        branchName,
        quantity: qty,
        value: lineValue,
      });
      wasteByMenu.set(row.menuItemId, {
        menuItemId: row.menuItemId,
        name: row.menuItem.name?.trim() || "ไม่ระบุชื่อ",
        quantity: qty,
        value: lineValue,
        entries: [entry],
        branchMap,
      });
    }
  }
  const wasteItems = [...wasteByMenu.values()]
    .map((row) => ({
      menuItemId: row.menuItemId,
      name: row.name,
      quantity: row.quantity,
      value: money(row.value),
      entries: [...row.entries].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
      byBranch: [...row.branchMap.values()]
        .map((b) => ({ ...b, value: money(b.value) }))
        .sort((a, b) => b.quantity - a.quantity || a.branchName.localeCompare(b.branchName, "th")),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.value - a.value);

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
  stats.netAfterWaste =
    stats.completedRevenue - stats.expenseTotal - stats.wasteValue;

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
      cancelledRevenue: money(stats.cancelledRevenue),
      openingCash: money(stats.openingCash),
      expectedCash: money(stats.expectedCash),
      netAfterExpenses: money(stats.netAfterExpenses),
      netAfterWaste: money(stats.netAfterWaste),
    },
    byChannel: roundShares([...byChannel.values()]),
    byPayment: roundShares([...byPayment.values()]),
    byFulfillment: roundShares([...byFulfillment.values()]),
    byBranch: [...byBranchMap.values()]
      .map((row) => {
        const netAfterWaste =
          row.completedRevenue - row.expenseTotal - row.wasteValue;
        return {
          ...row,
          completedRevenue: money(row.completedRevenue),
          cancelledRevenue: money(row.cancelledRevenue),
          cashRevenue: money(row.cashRevenue),
          transferRevenue: money(row.transferRevenue),
          expenseTotal: money(row.expenseTotal),
          wasteValue: money(row.wasteValue),
          netAfterWaste: money(netAfterWaste),
        };
      })
      .sort((a, b) => b.completedRevenue - a.completedRevenue),
    wasteItems,
    cancelReasons,
  };
}
