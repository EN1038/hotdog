/** Sole-operator start: shop floor vs owner office */

export type OwnerStartPreference = "auto" | "shop" | "office";

export const OWNER_START_STORAGE_KEY = "skillsale_owner_start_v1";
/** Session-only: user opened บัญชีร้าน — don't bounce back to staff this tab */
export const OWNER_START_SKIP_SHOP_KEY = "skillsale_owner_skip_shop_v1";

export function isOwnerStartPreference(
  value: unknown,
): value is OwnerStartPreference {
  return value === "auto" || value === "shop" || value === "office";
}

export function getOwnerStartPreference(): OwnerStartPreference {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(OWNER_START_STORAGE_KEY);
    if (isOwnerStartPreference(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function setOwnerStartPreference(value: OwnerStartPreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OWNER_START_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function markSkipAutoShopFloor() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(OWNER_START_SKIP_SHOP_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearSkipAutoShopFloor() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(OWNER_START_SKIP_SHOP_KEY);
  } catch {
    /* ignore */
  }
}

export function shouldSkipAutoShopFloor(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(OWNER_START_SKIP_SHOP_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Prefer landing on staff sell home only when the owner explicitly chose
 * "เริ่มที่หน้าร้านเสมอ". Auto mode stays on /owner after login.
 */
export function shouldPreferShopFloor(
  preference: OwnerStartPreference = getOwnerStartPreference(),
): boolean {
  if (preference === "office") return false;
  if (shouldSkipAutoShopFloor()) return false;
  return preference === "shop";
}

export const OWNER_START_LABELS: Record<OwnerStartPreference, string> = {
  auto: "เริ่มที่หลังบ้าน (ค่าเริ่มต้น)",
  shop: "เริ่มที่หน้าร้านเสมอ",
  office: "เริ่มที่หลังบ้านเสมอ",
};
