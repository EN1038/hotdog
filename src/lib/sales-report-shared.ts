import type { SalesShareSlice } from "@/lib/sales-share";

export type SalesReportStats = {
  completedRevenue: number;
  completedCount: number;
  cancelledCount: number;
  /** มูลค่าบิลที่ยกเลิก (ไม่นับเป็นยอดขาย) */
  cancelledRevenue: number;
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

export type SalesReportCancelReason = {
  reason: string;
  count: number;
};

export type SalesReportBranchShare = {
  branchId: string;
  branchName: string;
  completedRevenue: number;
  completedCount: number;
  openCount: number;
  cancelledCount: number;
  cancelledRevenue: number;
  cashRevenue: number;
  transferRevenue: number;
  soldQty: number;
  expenseTotal: number;
  expenseCount: number;
  wasteQty: number;
  wasteValue: number;
  netAfterWaste: number;
  /** คงเหลือขายปัจจุบัน (ไม่ผูกช่วงวัน) — เติมจาก API รวม */
  saleStockQty?: number;
  saleStockValue?: number;
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
  branchId?: string;
  branchName?: string;
};

export type SalesReportWasteBranchSlice = {
  branchId: string;
  branchName: string;
  quantity: number;
  value: number;
};

export type SalesReportWasteItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  value: number;
  entries: SalesReportWasteEntry[];
  byBranch?: SalesReportWasteBranchSlice[];
};

export type SalesReportResult = {
  stats: SalesReportStats;
  byChannel: SalesShareSlice[];
  byPayment: SalesShareSlice[];
  byFulfillment: SalesShareSlice[];
  byBranch: SalesReportBranchShare[];
  wasteItems: SalesReportWasteItem[];
  cancelReasons: SalesReportCancelReason[];
};

export const EMPTY_SALES_REPORT_STATS: SalesReportStats = {
  completedRevenue: 0,
  completedCount: 0,
  cancelledCount: 0,
  cancelledRevenue: 0,
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

export const TOP_CANCEL_REASONS = 5;
