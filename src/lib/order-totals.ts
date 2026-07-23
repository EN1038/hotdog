import type { OrderStatus } from "@prisma/client";

export type OrderLineForTotal = {
  quantity: number;
  unitPrice: string | number;
  optionsPrice?: string | number | null;
};

export function lineSubtotal(item: OrderLineForTotal): number {
  return (
    (Number(item.unitPrice) + Number(item.optionsPrice ?? 0)) * item.quantity
  );
}

export function orderItemsSubtotal(items: OrderLineForTotal[]): number {
  return items.reduce((sum, item) => sum + lineSubtotal(item), 0);
}

/** Grand total = items + delivery fee - discount (not below 0) */
export function orderGrandTotal(
  items: OrderLineForTotal[],
  deliveryFee: string | number = 0,
  discountAmount: string | number = 0,
): number {
  const raw =
    orderItemsSubtotal(items) + Number(deliveryFee) - Number(discountAmount);
  return Math.max(0, raw);
}

export function isRevenueStatus(status: OrderStatus): boolean {
  return status === "COMPLETED";
}

/** Photo drafts / incomplete keyed orders must not count as sales. */
export function isOrderCountableRevenue(order: {
  status: OrderStatus;
  awaitingPhotoKey?: boolean | null;
}): boolean {
  if (order.awaitingPhotoKey) return false;
  return isRevenueStatus(order.status);
}

export function isCancelledStatus(status: OrderStatus): boolean {
  return status === "CANCELLED";
}
