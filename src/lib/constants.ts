import { FulfillmentType, OrderStatus, PaymentMethod } from "@prisma/client";

export type StaffRole = "SELLER" | "DELIVERY" | "BOTH";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  SELLER: "คนขาย",
  DELIVERY: "คนส่ง",
  BOTH: "คนขาย, คนส่ง",
};

export function formatStaffRoles(roles: StaffRole[]): string {
  const unique = new Set<StaffRole>();
  for (const role of roles) {
    if (role === "BOTH") {
      unique.add("SELLER");
      unique.add("DELIVERY");
    } else {
      unique.add(role);
    }
  }
  return [...unique]
    .map((role) => STAFF_ROLE_LABELS[role] ?? role)
    .join(", ");
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  WAITING_FOR_STORE_ACCEPTANCE: "รอร้านรับออเดอร์",
  PREPARING: "กำลังเตรียม",
  READY_FOR_PICKUP: "พร้อมรับสินค้า",
  READY_FOR_DELIVERY: "รอการจัดส่ง",
  DELIVERING: "กำลังจัดส่ง",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  WAITING_FOR_STORE_ACCEPTANCE: "bg-amber-100 border-amber-400 text-amber-800",
  PREPARING: "bg-orange-100 border-orange-400 text-orange-800",
  READY_FOR_PICKUP: "bg-teal-100 border-teal-400 text-teal-800",
  READY_FOR_DELIVERY: "bg-blue-100 border-blue-400 text-blue-800",
  DELIVERING: "bg-sky-100 border-sky-400 text-sky-800",
  COMPLETED: "bg-green-100 border-green-400 text-green-800",
  CANCELLED: "bg-slate-100 border-slate-300 text-slate-500",
};

export const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  WAITING_FOR_STORE_ACCEPTANCE: "bg-amber-50 text-amber-600",
  PREPARING: "bg-orange-50 text-orange-600",
  READY_FOR_PICKUP: "bg-teal-50 text-teal-600",
  READY_FOR_DELIVERY: "bg-blue-50 text-blue-600",
  DELIVERING: "bg-sky-50 text-sky-700",
  COMPLETED: "bg-green-50 text-green-600",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  PICKUP: "รับที่ร้าน",
  DELIVERY: "จัดส่ง",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอน",
  CARD: "บัตรเครดิต",
};

/** Min length for address when delivery zone is “customer defines address”. */
export const CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH = 8;

/** Customers can cancel only while the store has not accepted the order yet. */
export function canCustomerCancel(status: OrderStatus): boolean {
  return status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE;
}

/** Staff (seller) can cancel before the order is out for delivery / completed. */
export function canStaffCancel(
  roles: StaffRole[],
  status: OrderStatus,
): boolean {
  if (!hasSellerRole(roles)) return false;
  return (
    status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE ||
    status === OrderStatus.PREPARING ||
    status === OrderStatus.READY_FOR_PICKUP ||
    status === OrderStatus.READY_FOR_DELIVERY
  );
}

/** Terminal statuses no longer need live polling. */
export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return (
    status === OrderStatus.COMPLETED || status === OrderStatus.CANCELLED
  );
}

export function isActiveOrderStatus(status: OrderStatus): boolean {
  return !isTerminalOrderStatus(status);
}

/** Poll faster while waiting for the shop to accept. */
export function orderStatusPollIntervalMs(status: OrderStatus): number {
  return status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE ? 4_000 : 10_000;
}

export function ordersListPollIntervalMs(
  orders: Array<{ status: OrderStatus }>,
): number {
  return orders.some(
    (o) => o.status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
  )
    ? 4_000
    : 10_000;
}

/** Statuses shown on the customer tracking timeline for a given fulfillment type. */
export function getTimelineStatuses(
  fulfillment: FulfillmentType,
): OrderStatus[] {
  if (fulfillment === "PICKUP") {
    return [
      OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
      OrderStatus.PREPARING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.COMPLETED,
    ];
  }
  return [
    OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
    OrderStatus.PREPARING,
    OrderStatus.READY_FOR_DELIVERY,
    OrderStatus.DELIVERING,
    OrderStatus.COMPLETED,
  ];
}

type TransitionMap = Partial<Record<OrderStatus, OrderStatus[]>>;

function sellerTransitions(fulfillment: FulfillmentType): TransitionMap {
  if (fulfillment === "PICKUP") {
    return {
      WAITING_FOR_STORE_ACCEPTANCE: [OrderStatus.PREPARING],
      PREPARING: [OrderStatus.READY_FOR_PICKUP, OrderStatus.WAITING_FOR_STORE_ACCEPTANCE],
      READY_FOR_PICKUP: [OrderStatus.COMPLETED, OrderStatus.PREPARING],
    };
  }
  return {
    WAITING_FOR_STORE_ACCEPTANCE: [OrderStatus.PREPARING],
    PREPARING: [OrderStatus.READY_FOR_DELIVERY, OrderStatus.WAITING_FOR_STORE_ACCEPTANCE],
    READY_FOR_DELIVERY: [OrderStatus.PREPARING],
  };
}

const deliveryTransitions: TransitionMap = {
  READY_FOR_DELIVERY: [OrderStatus.DELIVERING],
  DELIVERING: [OrderStatus.COMPLETED, OrderStatus.READY_FOR_DELIVERY],
};

export function canStaffUpdateStatus(
  roles: StaffRole[],
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
  fulfillment: FulfillmentType = "DELIVERY",
): boolean {
  const hasSeller = roles.includes("SELLER") || roles.includes("BOTH");
  const hasDelivery = roles.includes("DELIVERY") || roles.includes("BOTH");

  if (
    hasSeller &&
    (sellerTransitions(fulfillment)[currentStatus] ?? []).includes(newStatus)
  ) {
    return true;
  }
  if (
    hasDelivery &&
    fulfillment === "DELIVERY" &&
    (deliveryTransitions[currentStatus] ?? []).includes(newStatus)
  ) {
    return true;
  }
  return false;
}

export function getAllowedNextStatuses(
  roles: StaffRole[],
  currentStatus: OrderStatus,
  fulfillment: FulfillmentType = "DELIVERY",
): OrderStatus[] {
  return Object.values(OrderStatus).filter((status) =>
    canStaffUpdateStatus(roles, currentStatus, status, fulfillment),
  );
}

function hasSellerRole(roles: StaffRole[]) {
  return roles.includes("SELLER") || roles.includes("BOTH");
}

function hasDeliveryRole(roles: StaffRole[]) {
  return roles.includes("DELIVERY") || roles.includes("BOTH");
}

/** คนหน้าร้านอย่างเดียว — ใช้คำสั้นแบบ Wongnai Merchant */
export function isSellerOnlyStaff(roles: StaffRole[]) {
  return hasSellerRole(roles) && !hasDeliveryRole(roles);
}

/** มีทั้งคนขายและคนส่งในบัญชีเดียว */
export function isCombinedStaff(roles: StaffRole[]) {
  return hasSellerRole(roles) && hasDeliveryRole(roles);
}

/**
 * คำสถานะฝั่งคนหน้าร้าน / สอง role (Wongnai-style):
 * ใหม่ → กำลังเตรียม → จัดส่ง → (กำลังจัดส่ง) → เสร็จสิ้น
 * (ระบบภายในยังเป็นสถานะละเอียดเหมือนเดิม)
 */
export const SELLER_ORDER_STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  WAITING_FOR_STORE_ACCEPTANCE: "ใหม่",
  PREPARING: "กำลังเตรียม",
  READY_FOR_PICKUP: "จัดส่ง",
  READY_FOR_DELIVERY: "จัดส่ง",
  DELIVERING: "กำลังจัดส่ง",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

export function getStaffStatusLabel(
  status: OrderStatus,
  roles: StaffRole[],
): string {
  if (isSellerOnlyStaff(roles) || isCombinedStaff(roles)) {
    return SELLER_ORDER_STATUS_LABELS[status] ?? ORDER_STATUS_LABELS[status];
  }
  return ORDER_STATUS_LABELS[status];
}

/** สถานะในแท็บของพนักงาน — คนขาย / คนส่ง / สอง role (ไม่ซ้ำซ้อน) */
export function getStaffLegendStatuses(
  roles: StaffRole[],
  options?: { autoAcceptOrders?: boolean },
): OrderStatus[] {
  const seller = hasSellerRole(roles);
  const delivery = hasDeliveryRole(roles);
  // รับออโต้: ออเดอร์ข้าม「ใหม่」ไปเตรียมเลย — ไม่โชว์แท็บว่าง
  const showNew = !options?.autoAcceptOrders;

  // สอง role: รวมแท็บที่ไม่ซ้ำ — ใหม่ / กำลังเตรียม / จัดส่ง / กำลังจัดส่ง / เสร็จสิ้น
  if (seller && delivery) {
    return [
      ...(showNew ? [OrderStatus.WAITING_FOR_STORE_ACCEPTANCE] : []),
      OrderStatus.PREPARING,
      OrderStatus.READY_FOR_DELIVERY,
      OrderStatus.DELIVERING,
      OrderStatus.COMPLETED,
    ];
  }

  // คนหน้าร้าน: ใหม่ / กำลังเตรียม / จัดส่ง / เสร็จสิ้น
  if (seller) {
    return [
      ...(showNew ? [OrderStatus.WAITING_FOR_STORE_ACCEPTANCE] : []),
      OrderStatus.PREPARING,
      OrderStatus.READY_FOR_DELIVERY,
      OrderStatus.COMPLETED,
    ];
  }

  if (delivery) {
    return [
      OrderStatus.READY_FOR_DELIVERY,
      OrderStatus.DELIVERING,
      OrderStatus.COMPLETED,
    ];
  }

  return [];
}

/** สถานะจริงที่ตรงกับแท็บที่เลือก (“จัดส่ง” = พร้อมรับ + รอจัดส่ง) */
export function getStaffFilterStatuses(
  selected: OrderStatus,
  roles: StaffRole[],
): OrderStatus[] {
  if (
    (isSellerOnlyStaff(roles) || isCombinedStaff(roles)) &&
    selected === OrderStatus.READY_FOR_DELIVERY
  ) {
    return [OrderStatus.READY_FOR_DELIVERY, OrderStatus.READY_FOR_PICKUP];
  }
  // แท็บเสร็จสิ้น รวมออเดอร์ที่ยกเลิกวันนี้ด้วย
  if (selected === OrderStatus.COMPLETED) {
    return [OrderStatus.COMPLETED, OrderStatus.CANCELLED];
  }
  return [selected];
}

/** เริ่มต้นวันตามเวลาไทย (Asia/Bangkok) */
export function startOfTodayBangkok(now = new Date()): Date {
  const dateStr = bangkokDateKey(now);
  return new Date(`${dateStr}T00:00:00+07:00`);
}

/** `YYYY-MM-DD` in Asia/Bangkok */
export function bangkokDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function startOfBangkokDayFromKey(key: string): Date {
  return new Date(`${key}T00:00:00+07:00`);
}

/**
 * Prisma `@db.Date` value for a Bangkok business-day key (`YYYY-MM-DD`).
 * PostgreSQL stores the calendar date; use UTC midnight on that date (not +07:00 instant).
 */
export function queueBusinessDateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function isBangkokDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Keep digits only, capped for Thai numbers (max 10). */
export function phoneDigits(phone: string, max = 10): string {
  return normalizePhone(phone).slice(0, max);
}

/**
 * Format Thai phone for display as you type.
 * Mobile 10 digits → 081-234-5678
 * Shorter lengths fill groups progressively.
 */
export function formatThaiPhone(phone: string): string {
  const d = phoneDigits(phone);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export function telHref(phone: string): string {
  const d = normalizePhone(phone);
  return d ? `tel:${d}` : "#";
}

/** Accept optional HH:mm (24h). Empty string is valid (not set). */
export function isValidClockTime(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** Normalize to HH:mm or empty */
export function normalizeClockTime(value: string): string {
  const v = value.trim();
  if (!v) return "";
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return v;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return v;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function formatPrice(price: number | string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  return num.toLocaleString("th-TH", { minimumFractionDigits: 0 });
}

/** Generates a short human-friendly order number like A1048. */
export function generateOrderNumber(): string {
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${letter}${digits}`;
}
