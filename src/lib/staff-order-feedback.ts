"use client";

const STAFF_ORDER_FEEDBACK_KEY = "staff_order_feedback";

export type StaffOrderFeedback = {
  kind: "success" | "error";
  message: string;
  orderId?: string;
  queueNumber?: number | null;
  totalAmount?: number;
};

export function saveStaffOrderFeedback(payload: StaffOrderFeedback) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    STAFF_ORDER_FEEDBACK_KEY,
    JSON.stringify(payload),
  );
}

export function takeStaffOrderFeedback(): StaffOrderFeedback | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STAFF_ORDER_FEEDBACK_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(STAFF_ORDER_FEEDBACK_KEY);
  try {
    return JSON.parse(raw) as StaffOrderFeedback;
  } catch {
    return null;
  }
}
