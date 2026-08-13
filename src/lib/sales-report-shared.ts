import type { SalesShareSlice } from "@/lib/sales-share";

export type SalesReportStats = {
  completedRevenue: number;
  completedCount: number;
  cancelledCount: number;
  openCount: number;
  totalOrders: number;
  cashRevenue: number;
  transferRevenue: number;
  discountTotal: number;
  giftQuantity: number;
  soldQty: number;
  customerCount: number;
  expenseTotal: number;
  expenseCount: number;
  cashExpense: number;
  transferExpense: number;
  wasteQty: number;
  wasteValue: number;
  openingCash: number;
  expectedCash: number;
  netAfterExpenses: number;
};

export type SalesReportBranchShare = {
  branchId: string;
  branchName: string;
  completedRevenue: number;
  completedCount: number;
};

export type SalesReportResult = {
  stats: SalesReportStats;
  byChannel: SalesShareSlice[];
  byPayment: SalesShareSlice[];
  byBranch: SalesReportBranchShare[];
};

export const EMPTY_SALES_REPORT_STATS: SalesReportStats = {
  completedRevenue: 0,
  completedCount: 0,
  cancelledCount: 0,
  openCount: 0,
  totalOrders: 0,
  cashRevenue: 0,
  transferRevenue: 0,
  discountTotal: 0,
  giftQuantity: 0,
  soldQty: 0,
  customerCount: 0,
  expenseTotal: 0,
  expenseCount: 0,
  cashExpense: 0,
  transferExpense: 0,
  wasteQty: 0,
  wasteValue: 0,
  openingCash: 0,
  expectedCash: 0,
  netAfterExpenses: 0,
};
