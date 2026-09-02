/** Owner portal display preference — mobile shell vs full admin */

import { clearSkipAutoShopFloor } from "@/lib/owner-sole-start";

export type OwnerViewPreference = "auto" | "mobile" | "desktop";
export type OwnerViewMode = "mobile" | "desktop";

export const OWNER_VIEW_STORAGE_KEY = "skillsale_owner_view_v1";
export const OWNER_VIEW_PREFERENCE_EVENT = "skillsale:owner-view-preference";

/** Align with Tailwind `lg` used by AdminShell */
export const OWNER_VIEW_DESKTOP_MIN_PX = 1024;

export function isOwnerViewPreference(
  value: unknown,
): value is OwnerViewPreference {
  return value === "auto" || value === "mobile" || value === "desktop";
}

export function getOwnerViewPreference(): OwnerViewPreference {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(OWNER_VIEW_STORAGE_KEY);
    if (isOwnerViewPreference(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function setOwnerViewPreference(value: OwnerViewPreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OWNER_VIEW_STORAGE_KEY, value);
    window.dispatchEvent(new Event(OWNER_VIEW_PREFERENCE_EVENT));
  } catch {
    /* ignore */
  }
}

export function detectViewportOwnerView(): OwnerViewMode {
  if (typeof window === "undefined") return "mobile";
  return window.matchMedia(
    `(min-width: ${OWNER_VIEW_DESKTOP_MIN_PX}px)`,
  ).matches
    ? "desktop"
    : "mobile";
}

export function resolveOwnerView(
  preference: OwnerViewPreference = getOwnerViewPreference(),
): OwnerViewMode {
  if (preference === "mobile" || preference === "desktop") return preference;
  return detectViewportOwnerView();
}

export function ownerViewHomePath(view: OwnerViewMode): string {
  return view === "desktop" ? "/admin" : "/owner";
}

/**
 * After owner login — desktop → /admin; mobile → /owner.
 * Shop-floor auto-switch only happens later when preference is "shop".
 */
export async function assignOwnerViewHome() {
  if (typeof window === "undefined") return;
  clearSkipAutoShopFloor();
  const view = resolveOwnerView();
  window.location.assign(ownerViewHomePath(view));
}

export const OWNER_VIEW_LABELS: Record<OwnerViewPreference, string> = {
  auto: "อัตโนมัติตามหน้าจอ",
  mobile: "มุมมองมือถือ",
  desktop: "มุมมองเว็บไซต์",
};
