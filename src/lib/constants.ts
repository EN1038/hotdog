import { FulfillmentType, OrderStatus, PaymentMethod } from "@prisma/client";

export type StaffRole = "SELLER" | "DELIVERY" | "BOTH";

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
  DELIVERING: "bg-purple-100 border-purple-400 text-purple-800",
  COMPLETED: "bg-green-100 border-green-400 text-green-800",
  CANCELLED: "bg-gray-100 border-gray-300 text-gray-500",
};

export const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  WAITING_FOR_STORE_ACCEPTANCE: "bg-amber-50 text-amber-600",
  PREPARING: "bg-orange-50 text-orange-600",
  READY_FOR_PICKUP: "bg-teal-50 text-teal-600",
  READY_FOR_DELIVERY: "bg-blue-50 text-blue-600",
  DELIVERING: "bg-purple-50 text-purple-600",
  COMPLETED: "bg-green-50 text-green-600",
  CANCELLED: "bg-gray-100 text-gray-500",
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

/** Customers can cancel only while the store has not accepted the order yet. */
export function canCustomerCancel(status: OrderStatus): boolean {
  return status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE;
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
      WAITING_FOR_STORE_ACCEPTANCE: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      PREPARING: [OrderStatus.READY_FOR_PICKUP, OrderStatus.WAITING_FOR_STORE_ACCEPTANCE],
      READY_FOR_PICKUP: [OrderStatus.COMPLETED, OrderStatus.PREPARING],
    };
  }
  return {
    WAITING_FOR_STORE_ACCEPTANCE: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
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
