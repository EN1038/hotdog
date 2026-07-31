export type StaffOrderMode = "normal" | "instant";

export const STAFF_ORDER_MODE_KEY = "staff-order-mode";

export function parseStaffOrderMode(raw: string | null | undefined): StaffOrderMode {
  return raw === "normal" ? "normal" : "instant";
}

export function readStaffOrderMode(): StaffOrderMode {
  if (typeof window === "undefined") return "instant";
  try {
    return parseStaffOrderMode(window.localStorage.getItem(STAFF_ORDER_MODE_KEY));
  } catch {
    return "instant";
  }
}

export function writeStaffOrderMode(mode: StaffOrderMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STAFF_ORDER_MODE_KEY, mode);
  } catch {
    // ignore
  }
}
