export type StaffSellMode = "mala" | "weigh";

const STORAGE_KEY = "skillsale_staff_sell_mode";

export function readStaffSellMode(
  fallback: StaffSellMode = "mala",
): StaffSellMode {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "mala" || v === "weigh") return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeStaffSellMode(mode: StaffSellMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
