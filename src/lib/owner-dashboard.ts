import type { SalesShareSlice } from "@/lib/sales-share";
import type {
  SalesReportCancelReason,
  SalesReportStats,
  SalesReportWasteItem,
} from "@/lib/sales-report-shared";
import type { ShopAgingAttention } from "@/lib/shop-aging-summary";
import type {
  ShopHourlyPoint,
  ShopWeekdayPoint,
} from "@/lib/shop-overview-metrics";

export type OwnerPeriod = "day" | "month";

export type OwnerBranchActiveShift = {
  roundNumber: number;
  openedAt: string;
  calendarDate: string;
};

export type OwnerBranchLastClosedShift = {
  roundNumber: number;
  closedAt: string;
};

export type OwnerBranchRow = {
  id: string;
  name: string;
  code: string | null;
  isOpen: boolean;
  isTest: boolean;
  isHidden: boolean;
  kind?: "STORE" | "WAREHOUSE";
  /** รอบขายที่เปิดอยู่ตอนนี้ (null = ไม่มีรอบเปิด) */
  activeShift?: OwnerBranchActiveShift | null;
  /** รอบขายที่ปิดล่าสุด (เมื่อไม่มีรอบเปิด) */
  lastClosedShift?: OwnerBranchLastClosedShift | null;
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

export type OwnerSubscriptionInfo = {
  status: string;
  effectiveStatus?: string;
  statusLabel: string;
  effectiveStatusLabel?: string;
  plan: string;
  planLabel: string;
  planPrice?: number | null;
  planHint?: string | null;
  maxBranches: number;
  maxStaff: number;
  branchCount: number;
  staffCount: number;
  stockEnabled: boolean;
  kitchenEnabled: boolean;
  bbqEnabled: boolean;
  skewerEnabled: boolean;
  trialEndsAt: string | null;
  nextDueAt: string | null;
  expiresAt?: string | null;
  nearExpiry?: boolean;
  warningDays?: number;
  daysLeft?: number | null;
  writeAllowed?: boolean;
  writeBlockedReason?: string | null;
};

export type OwnerDayStats = SalesReportStats;

export type OwnerBranchShare = {
  branchId: string;
  branchName: string;
  completedRevenue: number;
  completedCount: number;
  openCount: number;
  cancelledCount: number;
  cancelledRevenue: number;
  cashRevenue: number;
  transferRevenue: number;
  soldQty?: number;
  expenseTotal?: number;
  expenseCount?: number;
  wasteQty?: number;
  wasteValue?: number;
  netAfterWaste?: number;
  saleStockQty?: number;
  saleStockValue?: number;
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

export type OwnerTopSeller = {
  name: string;
  quantity: number;
  revenueBaht: number;
};

export type OwnerDailyPoint = {
  date: string;
  label: string;
  revenueBaht: number;
  orderCount: number;
};

export type OwnerDashboardPayload = {
  brand: OwnerBrandRow | null;
  subscription: OwnerSubscriptionInfo | null;
  branches: OwnerBranchRow[];
  hasTestBranch?: boolean;
  includeTest?: boolean;
  /** null = รวมทุกสาขา */
  filterBranchId?: string | null;
  operatingDay: string;
  period: OwnerPeriod;
  from: string;
  to: string;
  stats: OwnerDayStats;
  byBranch: OwnerBranchShare[];
  byChannel: SalesShareSlice[];
  byPayment: SalesShareSlice[];
  byFulfillment: SalesShareSlice[];
  orders: OwnerTodayOrder[];
  /** Brand + any scoped branch has stock enabled */
  stockEnabled: boolean;
  saleStockQty: number;
  saleStockValue: number;
  topSellers: OwnerTopSeller[];
  days: OwnerDailyPoint[];
  hours: ShopHourlyPoint[];
  weekdays: ShopWeekdayPoint[];
  cancelReasons: SalesReportCancelReason[];
  aging: ShopAgingAttention | null;
  wasteItems: SalesReportWasteItem[];
  /** เอกสารยอดนับรอ Convert (IN_PROGRESS) ในขอบเขตสาขาที่เลือก — นับเฉพาะ ≤3 วันสำหรับ badge */
  pendingStockConvertCount?: number;
  /** แม่ค้าคนเดียว · สาขาเดียว — แนะนำเริ่มที่หน้าร้าน */
  soleOperator?: boolean;
  soleBranchId?: string | null;
};
