/** Session flag: staff is keying an order via the customer order UI (/order/store → checkout). */
export const STAFF_KEYED_ORDER_STORAGE = "skillsale_staff_keyed_order_v1";

export function enableStaffKeyedOrder() {
  try {
    sessionStorage.setItem(STAFF_KEYED_ORDER_STORAGE, "1");
  } catch {
    /* ignore */
  }
}

export function isStaffKeyedOrderActive(): boolean {
  try {
    return sessionStorage.getItem(STAFF_KEYED_ORDER_STORAGE) === "1";
  } catch {
    return false;
  }
}

export function clearStaffKeyedOrder() {
  try {
    sessionStorage.removeItem(STAFF_KEYED_ORDER_STORAGE);
  } catch {
    /* ignore */
  }
}
