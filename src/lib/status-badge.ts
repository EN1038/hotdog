/** Shared status colors for mobile-first badges across the app. */

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "active";

/** Soft pill background + text + ring (use with StatusBadge). */
export const STATUS_TONE_BADGE: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-950 ring-amber-300",
  danger: "bg-rose-50 text-rose-800 ring-rose-200",
  info: "bg-sky-50 text-sky-900 ring-sky-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  active: "bg-emerald-50 text-emerald-800 ring-emerald-300",
};

export const STATUS_TONE_DOT: Record<StatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
  neutral: "bg-slate-400",
  active: "bg-emerald-500",
};

/** Stronger card/chip style (borders). */
export const STATUS_TONE_CHIP: Record<StatusTone, string> = {
  success: "bg-emerald-100 text-emerald-800 border-emerald-300",
  warning: "bg-amber-100 text-amber-950 border-amber-400",
  danger: "bg-rose-100 text-rose-800 border-rose-300",
  info: "bg-sky-100 text-sky-900 border-sky-300",
  neutral: "bg-slate-100 text-slate-600 border-slate-300",
  active: "bg-emerald-100 text-emerald-800 border-emerald-400",
};

export type StockCountUiStatus =
  | "pending_convert"
  | "converted"
  | "rejected"
  | "recorded"
  | "draft";

export function resolveStockCountUiStatus(opts: {
  status?: string | null;
  pendingAdminApply?: boolean | null;
}): StockCountUiStatus {
  if (opts.status === "CANCELLED") return "rejected";
  if (
    opts.pendingAdminApply ||
    opts.status === "IN_PROGRESS" ||
    opts.status === "DRAFT"
  ) {
    return "pending_convert";
  }
  if (opts.status === "COMPLETED") return "converted";
  return "recorded";
}

export const STOCK_COUNT_STATUS_META: Record<
  StockCountUiStatus,
  { label: string; tone: StatusTone }
> = {
  pending_convert: { label: "รอเจ้าของ/ผู้จัดการปรับสต๊อก", tone: "warning" },
  converted: { label: "ปรับสต๊อกแล้ว", tone: "success" },
  rejected: { label: "ปฏิเสธแล้ว", tone: "neutral" },
  recorded: { label: "บันทึกแล้ว", tone: "success" },
  draft: { label: "ร่าง", tone: "info" },
};

export function stockCountStatusLabel(opts: {
  status?: string | null;
  pendingAdminApply?: boolean | null;
}): string {
  return STOCK_COUNT_STATUS_META[resolveStockCountUiStatus(opts)].label;
}

export function stockCountStatusTone(opts: {
  status?: string | null;
  pendingAdminApply?: boolean | null;
}): StatusTone {
  return STOCK_COUNT_STATUS_META[resolveStockCountUiStatus(opts)].tone;
}

export const ORDER_STATUS_TONE: Record<string, StatusTone> = {
  WAITING_FOR_STORE_ACCEPTANCE: "warning",
  PREPARING: "warning",
  READY_FOR_PICKUP: "info",
  READY_FOR_DELIVERY: "info",
  DELIVERING: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export function orderStatusTone(status: string): StatusTone {
  return ORDER_STATUS_TONE[status] ?? "neutral";
}
