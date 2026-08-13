import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { queueBusinessDateFromKey } from "@/lib/constants";
import {
  expenseDateFromKey,
  summarizeExpenses,
} from "@/lib/branch-expense";
import {
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";
import {
  assignStableMenuSequence,
  sortStaffMenuItems,
} from "@/lib/staff-menu-order";

const HISTORY_TYPES = [
  "STOCK_IN",
  "ISSUE",
  "DAMAGE",
  "LOST",
  "SALE",
] as const;

/** Align with staff/branch overview: ISSUE + DAMAGE + LOST = ของเสีย */
const WASTE_TYPES = new Set(["ISSUE", "DAMAGE", "LOST"]);

export type HqStockItem = {
  branchMenuItemId: string;
  name: string;
  sequence: number;
  quantity: number;
  wasteQty: number;
  restockQty: number;
  issueQty: number;
  soldQty: number;
  /** Current on-hand stock value (quantity × unitPrice) */
  value: number;
  unitPrice: number;
};

export type HqBranchRow = {
  branchId: string;
  branchName: string;
  brandId: string | null;
  brandName: string | null;
  isTest: boolean;
  saleStockQty: number;
  saleStockValue: number;
  wasteQty: number;
  wasteValue: number;
  restockQty: number;
  restockValue: number;
  issueQty: number;
  issueValue: number;
  expenseTotal: number;
  expenseCount: number;
  cashExpense: number;
  transferExpense: number;
  completedRevenue: number;
  cashRevenue: number;
  transferRevenue: number;
  soldQty: number;
  netRevenue: number;
  stockItems: HqStockItem[];
};

export type HqOverviewResult = {
  from: string;
  to: string;
  includeTest: boolean;
  hasTestBranch: boolean;
  saleStockQty: number;
  saleStockValue: number;
  wasteQty: number;
  wasteValue: number;
  restockQty: number;
  restockValue: number;
  issueQty: number;
  issueValue: number;
  expenseTotal: number;
  expenseCount: number;
  cashExpense: number;
  transferExpense: number;
  completedRevenue: number;
  cashRevenue: number;
  transferRevenue: number;
  soldQty: number;
  netRevenue: number;
  branches: HqBranchRow[];
};

function rangeCreatedAt(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00+07:00`),
    lte: new Date(`${to}T23:59:59.999+07:00`),
  };
}

function emptyTotals() {
  return {
    saleStockQty: 0,
    saleStockValue: 0,
    wasteQty: 0,
    wasteValue: 0,
    restockQty: 0,
    restockValue: 0,
    issueQty: 0,
    issueValue: 0,
    expenseTotal: 0,
    expenseCount: 0,
    cashExpense: 0,
    transferExpense: 0,
    completedRevenue: 0,
    cashRevenue: 0,
    transferRevenue: 0,
    soldQty: 0,
  };
}

/** Aggregate sales / expenses / sale-stock for every branch the session can access. */
export async function buildHqOverview(
  session: SessionPayload,
  from: string,
  to: string,
  options?: { brandId?: string; includeTest?: boolean },
): Promise<HqOverviewResult> {
  const accessible = getAccessibleBrandIds(session);
  const branchWhere = options?.brandId
    ? { brandId: options.brandId }
    : accessible === null
      ? {}
      : { brandId: { in: accessible } };
  const includeTest = options?.includeTest === true;

  const allBranches = await prisma.branch.findMany({
    where: branchWhere,
    select: {
      id: true,
      name: true,
      brandId: true,
      isTest: true,
      brand: { select: { id: true, name: true } },
    },
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
  });
  const hasTestBranch = allBranches.some((b) => b.isTest);
  const branches = includeTest
    ? allBranches
    : allBranches.filter((b) => !b.isTest);

  const empty: HqOverviewResult = {
    from,
    to,
    includeTest,
    hasTestBranch,
    ...emptyTotals(),
    netRevenue: 0,
    branches: [],
  };

  if (branches.length === 0) return empty;

  const branchIds = branches.map((b) => b.id);
  const createdAtRange = rangeCreatedAt(from, to);

  const [orders, expenses, menuItems, stockHistory] = await Promise.all([
    prisma.order.findMany({
      where: {
        branchId: { in: branchIds },
        queueBusinessDate: {
          gte: queueBusinessDateFromKey(from),
          lte: queueBusinessDateFromKey(to),
        },
      },
      select: {
        branchId: true,
        status: true,
        awaitingPhotoKey: true,
        paymentMethod: true,
        deliveryFee: true,
        discountAmount: true,
        items: {
          select: {
            branchMenuItemId: true,
            quantity: true,
            unitPrice: true,
            optionsPrice: true,
            giftQuantity: true,
          },
        },
      },
    }),
    prisma.branchExpense.findMany({
      where: {
        branchId: { in: branchIds },
        expenseDate: {
          gte: expenseDateFromKey(from),
          lte: new Date(`${to}T23:59:59.999+07:00`),
        },
      },
      select: { branchId: true, amount: true, payChannel: true },
    }),
    prisma.branchMenuItem.findMany({
      where: { branchId: { in: branchIds }, isHidden: false },
      select: {
        id: true,
        branchId: true,
        name: true,
        price: true,
        sortOrder: true,
        stock: { select: { quantity: true } },
        category: { select: { stockExempt: true, sortOrder: true } },
        optionGroupLinks: {
          select: { group: { select: { mode: true } } },
        },
      },
    }),
    prisma.branchMenuItemStockHistory.findMany({
      where: {
        branchId: { in: branchIds },
        type: { in: [...HISTORY_TYPES] },
        createdAt: createdAtRange,
      },
      select: {
        branchId: true,
        menuItemId: true,
        quantity: true,
        type: true,
      },
    }),
  ]);

  const byBranch = new Map<string, HqBranchRow>();
  for (const b of branches) {
    byBranch.set(b.id, {
      branchId: b.id,
      branchName: b.name,
      brandId: b.brand?.id ?? b.brandId,
      brandName: b.brand?.name ?? null,
      isTest: b.isTest,
      saleStockQty: 0,
      saleStockValue: 0,
      wasteQty: 0,
      wasteValue: 0,
      restockQty: 0,
      restockValue: 0,
      issueQty: 0,
      issueValue: 0,
      expenseTotal: 0,
      expenseCount: 0,
      cashExpense: 0,
      transferExpense: 0,
      completedRevenue: 0,
      cashRevenue: 0,
      transferRevenue: 0,
      soldQty: 0,
      netRevenue: 0,
      stockItems: [],
    });
  }

  const priceByMenuId = new Map<string, number>();
  const wasteByMenuId = new Map<string, number>();
  const restockByMenuId = new Map<string, number>();
  const issueByMenuId = new Map<string, number>();

  for (const item of menuItems) {
    priceByMenuId.set(item.id, Number(item.price ?? 0));
  }

  for (const row of stockHistory) {
    const qty = Math.abs(row.quantity);
    if (qty <= 0) continue;
    const agg = byBranch.get(row.branchId);
    if (!agg) continue;
    const unitPrice = priceByMenuId.get(row.menuItemId) ?? 0;
    const value = qty * unitPrice;

    if (row.type === "STOCK_IN") {
      restockByMenuId.set(
        row.menuItemId,
        (restockByMenuId.get(row.menuItemId) ?? 0) + qty,
      );
      agg.restockQty += qty;
      agg.restockValue += value;
    } else if (row.type === "SALE") {
      // Menu sold qty comes from completed orders below (more accurate for “ขาย”)
    } else if (WASTE_TYPES.has(row.type)) {
      // ISSUE is both "จ่ายออก" and ของเสีย (staff records waste as ISSUE)
      if (row.type === "ISSUE") {
        issueByMenuId.set(
          row.menuItemId,
          (issueByMenuId.get(row.menuItemId) ?? 0) + qty,
        );
        agg.issueQty += qty;
        agg.issueValue += value;
      }
      wasteByMenuId.set(
        row.menuItemId,
        (wasteByMenuId.get(row.menuItemId) ?? 0) + qty,
      );
      agg.wasteQty += qty;
      agg.wasteValue += value;
    }
  }

  const trackedByBranch = new Map<
    string,
    {
      id: string;
      name: string;
      sortOrder: number;
      categorySortOrder: number;
    }[]
  >();

  for (const item of menuItems) {
    const price = priceByMenuId.get(item.id) ?? 0;
    const isPromo = item.optionGroupLinks.some(
      (l) => l.group.mode === "FROM_MENU",
    );
    const tracked = !isPromo && !item.category?.stockExempt;
    if (!tracked) continue;
    const list = trackedByBranch.get(item.branchId) ?? [];
    list.push({
      id: item.id,
      name: item.name,
      sortOrder: item.sortOrder ?? 0,
      categorySortOrder: item.category?.sortOrder ?? 999,
    });
    trackedByBranch.set(item.branchId, list);

    const quantity = Math.max(0, Number(item.stock?.quantity ?? 0));
    const wasteQty = wasteByMenuId.get(item.id) ?? 0;
    const restockQty = restockByMenuId.get(item.id) ?? 0;
    const issueQty = issueByMenuId.get(item.id) ?? 0;
    const value = Math.round(quantity * price * 100) / 100;
    const agg = byBranch.get(item.branchId);
    if (!agg) continue;
    agg.saleStockQty += quantity;
    agg.saleStockValue += quantity * price;
    agg.stockItems.push({
      branchMenuItemId: item.id,
      name: item.name,
      sequence: 0,
      quantity,
      wasteQty,
      restockQty,
      issueQty,
      soldQty: 0,
      value,
      unitPrice: price,
    });
  }

  for (const [branchId, tracked] of trackedByBranch) {
    const seqById = assignStableMenuSequence(sortStaffMenuItems(tracked));
    const agg = byBranch.get(branchId);
    if (!agg) continue;
    for (const row of agg.stockItems) {
      row.sequence = seqById.get(row.branchMenuItemId) ?? 0;
    }
  }

  const soldFromOrdersByMenuId = new Map<string, number>();

  for (const order of orders) {
    const countable = isOrderCountableRevenue({
      status: order.status,
      awaitingPhotoKey: order.awaitingPhotoKey,
    });
    if (!countable) continue;

    const total = orderGrandTotal(
      order.items.map((it) => ({
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        optionsPrice: Number(it.optionsPrice),
      })),
      Number(order.deliveryFee),
      Number(order.discountAmount),
    );
    const agg = byBranch.get(order.branchId);
    if (agg) {
      agg.completedRevenue += total;
      if (order.paymentMethod === "CASH") agg.cashRevenue += total;
      else if (order.paymentMethod === "TRANSFER") agg.transferRevenue += total;
    }

    for (const it of order.items) {
      if (!it.branchMenuItemId) continue;
      const soldUnits = Math.max(0, it.quantity - (it.giftQuantity ?? 0));
      if (soldUnits <= 0) continue;
      if (agg) agg.soldQty += soldUnits;
      soldFromOrdersByMenuId.set(
        it.branchMenuItemId,
        (soldFromOrdersByMenuId.get(it.branchMenuItemId) ?? 0) + soldUnits,
      );
    }
  }

  for (const agg of byBranch.values()) {
    for (const row of agg.stockItems) {
      row.soldQty = soldFromOrdersByMenuId.get(row.branchMenuItemId) ?? 0;
    }
  }

  const expensesByBranch = new Map<string, typeof expenses>();
  for (const e of expenses) {
    const list = expensesByBranch.get(e.branchId) ?? [];
    list.push(e);
    expensesByBranch.set(e.branchId, list);
  }
  for (const [branchId, list] of expensesByBranch) {
    const agg = byBranch.get(branchId);
    if (!agg) continue;
    const summary = summarizeExpenses(
      list.map((e) => ({
        amount: Number(e.amount),
        payChannel: e.payChannel as "CASH" | "TRANSFER",
      })),
    );
    agg.expenseTotal = summary.total;
    agg.expenseCount = summary.count;
    agg.cashExpense = summary.cash;
    agg.transferExpense = summary.transfer;
  }

  for (const agg of byBranch.values()) {
    agg.saleStockValue = Math.round(agg.saleStockValue * 100) / 100;
    agg.wasteValue = Math.round(agg.wasteValue * 100) / 100;
    agg.restockValue = Math.round(agg.restockValue * 100) / 100;
    agg.issueValue = Math.round(agg.issueValue * 100) / 100;
    agg.cashExpense = Math.round(agg.cashExpense * 100) / 100;
    agg.transferExpense = Math.round(agg.transferExpense * 100) / 100;
    agg.completedRevenue = Math.round(agg.completedRevenue * 100) / 100;
    agg.cashRevenue = Math.round(agg.cashRevenue * 100) / 100;
    agg.transferRevenue = Math.round(agg.transferRevenue * 100) / 100;
    agg.netRevenue =
      Math.round((agg.completedRevenue - agg.expenseTotal) * 100) / 100;
    agg.stockItems.sort(
      (a, b) =>
        a.sequence - b.sequence || a.name.localeCompare(b.name, "th"),
    );
  }

  const rows = [...byBranch.values()];
  const totals = rows.reduce((acc, b) => {
    acc.saleStockQty += b.saleStockQty;
    acc.saleStockValue += b.saleStockValue;
    acc.wasteQty += b.wasteQty;
    acc.wasteValue += b.wasteValue;
    acc.restockQty += b.restockQty;
    acc.restockValue += b.restockValue;
    acc.issueQty += b.issueQty;
    acc.issueValue += b.issueValue;
    acc.expenseTotal += b.expenseTotal;
    acc.expenseCount += b.expenseCount;
    acc.cashExpense += b.cashExpense;
    acc.transferExpense += b.transferExpense;
    acc.completedRevenue += b.completedRevenue;
    acc.cashRevenue += b.cashRevenue;
    acc.transferRevenue += b.transferRevenue;
    acc.soldQty += b.soldQty;
    return acc;
  }, emptyTotals());

  return {
    from,
    to,
    includeTest,
    hasTestBranch,
    saleStockQty: totals.saleStockQty,
    saleStockValue: Math.round(totals.saleStockValue * 100) / 100,
    wasteQty: totals.wasteQty,
    wasteValue: Math.round(totals.wasteValue * 100) / 100,
    restockQty: totals.restockQty,
    restockValue: Math.round(totals.restockValue * 100) / 100,
    issueQty: totals.issueQty,
    issueValue: Math.round(totals.issueValue * 100) / 100,
    expenseTotal: Math.round(totals.expenseTotal * 100) / 100,
    expenseCount: totals.expenseCount,
    cashExpense: Math.round(totals.cashExpense * 100) / 100,
    transferExpense: Math.round(totals.transferExpense * 100) / 100,
    completedRevenue: Math.round(totals.completedRevenue * 100) / 100,
    cashRevenue: Math.round(totals.cashRevenue * 100) / 100,
    transferRevenue: Math.round(totals.transferRevenue * 100) / 100,
    soldQty: totals.soldQty,
    netRevenue:
      Math.round((totals.completedRevenue - totals.expenseTotal) * 100) / 100,
    branches: rows,
  };
}
