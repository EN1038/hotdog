import type { SalesShareSlice } from "@/lib/sales-share";
import type { SalesReportStats } from "@/lib/sales-report-shared";

export type OwnerPeriod = "day" | "month";

export type OwnerBranchRow = {
  id: string;
  name: string;
  code: string | null;
  isOpen: boolean;
  isTest: boolean;
  isHidden: boolean;
};

export type OwnerBrandRow = {
  id: string;
  name: string;
  nameTh: string | null;
  code: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  color: string;
};

export type OwnerDayStats = SalesReportStats;

export type OwnerBranchShare = {
  branchId: string;
  branchName: string;
  completedRevenue: number;
  completedCount: number;
};

export type OwnerTodayOrder = {
  id: string;
  orderNumber: string;
  queueNumber: number | null;
  status: string;
  fulfillmentType: string;
  salesChannel: string;
  paymentMethod: string;
  customerName: string;
  createdAt: string;
  total: number;
  branchName: string;
};

export type OwnerDashboardPayload = {
  brand: OwnerBrandRow | null;
  branches: OwnerBranchRow[];
  hasTestBranch?: boolean;
  includeTest?: boolean;
  operatingDay: string;
  period: OwnerPeriod;
  from: string;
  to: string;
  stats: OwnerDayStats;
  byBranch: OwnerBranchShare[];
  byChannel: SalesShareSlice[];
  byPayment: SalesShareSlice[];
  orders: OwnerTodayOrder[];
};
