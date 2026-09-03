const STORAGE_PREFIX = "skillsale_owner_brand_setup_dismissed_";

/** When true, open brand-setup on every /owner load (QA only). */
export const OWNER_BRAND_SETUP_FORCE_SHOW_ON_LOAD = false;

export function ownerBrandSetupDismissedKey(brandId: string) {
  return `${STORAGE_PREFIX}${brandId}`;
}

export function isOwnerBrandSetupDismissed(brandId: string): boolean {
  if (OWNER_BRAND_SETUP_FORCE_SHOW_ON_LOAD) return false;
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ownerBrandSetupDismissedKey(brandId)) === "1";
  } catch {
    return false;
  }
}

export function markOwnerBrandSetupDismissed(brandId: string) {
  if (OWNER_BRAND_SETUP_FORCE_SHOW_ON_LOAD) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ownerBrandSetupDismissedKey(brandId), "1");
  } catch {
    /* ignore */
  }
}
