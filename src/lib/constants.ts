import { OrderStatus } from "@prisma/client";

export type StaffRole = "SELLER" | "DELIVERY" | "BOTH";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  QUEUED: "รอคิว",
  PREPARING: "กำลังทำ",
  READY_FOR_DELIVERY: "รอการจัดส่ง",
  DELIVERING: "กำลังจัดส่ง",
  DELIVERED: "ส่งเสร็จ",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  QUEUED: "bg-yellow-100 border-yellow-400",
  PREPARING: "bg-orange-100 border-orange-400",
  READY_FOR_DELIVERY: "bg-blue-100 border-blue-400",
  DELIVERING: "bg-purple-100 border-purple-400",
  DELIVERED: "bg-green-100 border-green-400",
};

export const SELLER_STATUSES: OrderStatus[] = [
  OrderStatus.QUEUED,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_DELIVERY,
];

export const DELIVERY_STATUSES: OrderStatus[] = [
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.DELIVERING,
  OrderStatus.DELIVERED,
];

export function getStaffRoles(
  phone: string,
  sellerPhone: string | null,
  deliveryPhone: string | null,
): StaffRole[] {
  const roles: StaffRole[] = [];
  if (sellerPhone === phone) roles.push("SELLER");
  if (deliveryPhone === phone) roles.push("DELIVERY");
  if (roles.includes("SELLER") && roles.includes("DELIVERY")) return ["BOTH"];
  return roles;
}

export function canStaffUpdateStatus(
  roles: StaffRole[],
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
): boolean {
  const hasSeller = roles.includes("SELLER") || roles.includes("BOTH");
  const hasDelivery = roles.includes("DELIVERY") || roles.includes("BOTH");

  if (hasSeller && SELLER_STATUSES.includes(newStatus)) {
    if (!hasDelivery && DELIVERY_STATUSES.includes(newStatus) && newStatus !== OrderStatus.READY_FOR_DELIVERY) {
      return false;
    }
    return isValidSellerTransition(currentStatus, newStatus, hasDelivery);
  }

  if (hasDelivery && !hasSeller) {
    return isValidDeliveryTransition(currentStatus, newStatus);
  }

  if (roles.includes("BOTH")) {
    return (
      isValidSellerTransition(currentStatus, newStatus, true) ||
      isValidDeliveryTransition(currentStatus, newStatus)
    );
  }

  return false;
}

function isValidSellerTransition(
  current: OrderStatus,
  next: OrderStatus,
  hasDelivery: boolean,
): boolean {
  const transitions: Record<OrderStatus, OrderStatus[]> = {
    QUEUED: [OrderStatus.PREPARING],
    PREPARING: [OrderStatus.READY_FOR_DELIVERY, OrderStatus.QUEUED],
    READY_FOR_DELIVERY: hasDelivery
      ? [OrderStatus.DELIVERING, OrderStatus.PREPARING]
      : [OrderStatus.PREPARING],
    DELIVERING: hasDelivery ? [OrderStatus.DELIVERED, OrderStatus.READY_FOR_DELIVERY] : [],
    DELIVERED: [],
  };
  return transitions[current]?.includes(next) ?? false;
}

function isValidDeliveryTransition(
  current: OrderStatus,
  next: OrderStatus,
): boolean {
  const transitions: Record<OrderStatus, OrderStatus[]> = {
    QUEUED: [],
    PREPARING: [],
    READY_FOR_DELIVERY: [OrderStatus.DELIVERING],
    DELIVERING: [OrderStatus.DELIVERED, OrderStatus.READY_FOR_DELIVERY],
    DELIVERED: [],
  };
  return transitions[current]?.includes(next) ?? false;
}

export function getAllowedNextStatuses(
  roles: StaffRole[],
  currentStatus: OrderStatus,
): OrderStatus[] {
  const all = Object.values(OrderStatus);
  return all.filter((status) =>
    canStaffUpdateStatus(roles, currentStatus, status),
  );
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function formatPrice(price: number | string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  return num.toLocaleString("th-TH", { minimumFractionDigits: 0 });
}
