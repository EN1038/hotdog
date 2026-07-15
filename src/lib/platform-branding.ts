import {
  SKILLSALE_DESCRIPTION,
  SKILLSALE_ICON_URL,
  SKILLSALE_LOGO_URL,
  SKILLSALE_NAME,
  SKILLSALE_PRIMARY,
  SKILLSALE_TITLE,
} from "@/lib/brand-assets";

/** Which uploaded asset to show at a placement. */
export type MarkAssetKind = "icon" | "logo";

export type MarkPlacement =
  | "sidebar"
  | "login"
  | "home"
  | "order"
  | "favicon";

/** Platform shell branding (not a restaurant brand). */
export type PlatformSettingsData = {
  siteName: string;
  siteTitle: string;
  siteDescription: string | null;
  iconUrl: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  markSidebar: MarkAssetKind;
  markLogin: MarkAssetKind;
  markHome: MarkAssetKind;
  markOrder: MarkAssetKind;
  markFavicon: MarkAssetKind;
};

/** @deprecated Prefer PlatformSettingsData — alias for existing imports */
export type SiteSettingsData = PlatformSettingsData;

export function normalizeMarkKind(
  value: string | null | undefined,
  fallback: MarkAssetKind,
): MarkAssetKind {
  if (value === "icon" || value === "logo") return value;
  return fallback;
}

export function resolvePlatformMarkUrl(
  settings: Pick<PlatformSettingsData, "iconUrl" | "logoUrl">,
  kind: MarkAssetKind,
): string {
  if (kind === "logo") {
    return settings.logoUrl?.trim() || SKILLSALE_LOGO_URL;
  }
  return settings.iconUrl?.trim() || SKILLSALE_ICON_URL;
}

export function resolvePlatformMarkForPlacement(
  settings: PlatformSettingsData,
  placement: MarkPlacement,
): { kind: MarkAssetKind; src: string } {
  const kind =
    placement === "sidebar"
      ? settings.markSidebar
      : placement === "login"
        ? settings.markLogin
        : placement === "home"
          ? settings.markHome
          : placement === "order"
            ? settings.markOrder
            : settings.markFavicon;
  return { kind, src: resolvePlatformMarkUrl(settings, kind) };
}

export const PLATFORM_SETTINGS_DEFAULTS: PlatformSettingsData = {
  siteName: SKILLSALE_NAME,
  siteTitle: SKILLSALE_TITLE,
  siteDescription: SKILLSALE_DESCRIPTION,
  iconUrl: SKILLSALE_ICON_URL,
  logoUrl: SKILLSALE_LOGO_URL,
  faviconUrl: SKILLSALE_ICON_URL,
  primaryColor: SKILLSALE_PRIMARY,
  markSidebar: "icon",
  markLogin: "logo",
  markHome: "logo",
  markOrder: "icon",
  markFavicon: "icon",
};
