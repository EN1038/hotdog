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
  /** ขาย − ค่าใช้จ่าย − มูลค่าของเสีย */
  netAfterWaste: number;
};

export type SalesReportBranchShare = {
  branchId: string;
  branchName: string;
  completedRevenue: number;
  completedCount: number;
};

export type SalesReportWasteEntry = {
  id: string;
  quantity: number;
  value: number;
  note: string | null;
  imageUrl: string | null;
  createdAt: string;
  createdByName: string | null;
  type: string;
};

export type SalesReportWasteItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  value: number;
  entries: SalesReportWasteEntry[];
};

export type SalesReportResult = {
  stats: SalesReportStats;
  byChannel: SalesShareSlice[];
  byPayment: SalesShareSlice[];
  byBranch: SalesReportBranchShare[];
  wasteItems: SalesReportWasteItem[];
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
  netAfterWaste: 0,
};
