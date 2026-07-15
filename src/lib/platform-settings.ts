import { prisma } from "@/lib/db";
import {
  SKILLSALE_ICON_URL,
  SKILLSALE_LOGO_URL,
} from "@/lib/brand-assets";
import {
  normalizeMarkKind,
  PLATFORM_SETTINGS_DEFAULTS,
  type PlatformSettingsData,
} from "@/lib/platform-branding";

export type {
  MarkAssetKind,
  MarkPlacement,
  PlatformSettingsData,
  SiteSettingsData,
} from "@/lib/platform-branding";

export {
  normalizeMarkKind,
  resolvePlatformMarkUrl,
  resolvePlatformMarkForPlacement,
  PLATFORM_SETTINGS_DEFAULTS,
} from "@/lib/platform-branding";

type SiteSettingsRow = {
  siteName: string;
  siteTitle: string;
  siteDescription: string | null;
  iconUrl: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  markSidebar: string;
  markLogin: string;
  markHome: string;
  markOrder: string;
  markFavicon: string;
};

function withAssetFallbacks(row: SiteSettingsRow): PlatformSettingsData {
  const rawIcon = row.iconUrl?.trim() || null;
  const rawLogo = row.logoUrl?.trim() || null;
  const iconUrl =
    rawIcon ||
    (rawLogo === SKILLSALE_ICON_URL ? SKILLSALE_ICON_URL : null) ||
    PLATFORM_SETTINGS_DEFAULTS.iconUrl!;
  // Legacy rows stored the mark in logoUrl — promote wordmark default instead.
  const logoUrl =
    !rawLogo || rawLogo === SKILLSALE_ICON_URL
      ? PLATFORM_SETTINGS_DEFAULTS.logoUrl!
      : rawLogo;
  const markFavicon = normalizeMarkKind(
    row.markFavicon,
    PLATFORM_SETTINGS_DEFAULTS.markFavicon,
  );
  const resolvedFavicon =
    row.faviconUrl?.trim() ||
    (markFavicon === "logo" ? logoUrl : iconUrl) ||
    PLATFORM_SETTINGS_DEFAULTS.faviconUrl!;

  return {
    siteName: row.siteName || PLATFORM_SETTINGS_DEFAULTS.siteName,
    siteTitle: row.siteTitle || PLATFORM_SETTINGS_DEFAULTS.siteTitle,
    siteDescription:
      row.siteDescription ?? PLATFORM_SETTINGS_DEFAULTS.siteDescription,
    iconUrl,
    logoUrl,
    faviconUrl: resolvedFavicon,
    primaryColor: row.primaryColor || PLATFORM_SETTINGS_DEFAULTS.primaryColor,
    markSidebar: normalizeMarkKind(
      row.markSidebar,
      PLATFORM_SETTINGS_DEFAULTS.markSidebar,
    ),
    markLogin: normalizeMarkKind(
      row.markLogin,
      PLATFORM_SETTINGS_DEFAULTS.markLogin,
    ),
    markHome: normalizeMarkKind(
      row.markHome,
      PLATFORM_SETTINGS_DEFAULTS.markHome,
    ),
    markOrder: normalizeMarkKind(
      row.markOrder,
      PLATFORM_SETTINGS_DEFAULTS.markOrder,
    ),
    markFavicon,
  };
}

function faviconFromMarks(
  data: Partial<PlatformSettingsData>,
  current: PlatformSettingsData,
): string {
  const kind = normalizeMarkKind(
    data.markFavicon ?? current.markFavicon,
    current.markFavicon,
  );
  const icon = (
    data.iconUrl !== undefined ? data.iconUrl : current.iconUrl
  )?.trim();
  const logo = (
    data.logoUrl !== undefined ? data.logoUrl : current.logoUrl
  )?.trim();
  return kind === "logo"
    ? logo || SKILLSALE_LOGO_URL
    : icon || SKILLSALE_ICON_URL;
}

export async function getPlatformSettings(): Promise<PlatformSettingsData> {
  try {
    const row = await prisma.siteSettings.findUnique({
      where: { id: "default" },
    });
    if (!row) return PLATFORM_SETTINGS_DEFAULTS;
    return withAssetFallbacks(row as SiteSettingsRow);
  } catch {
    return PLATFORM_SETTINGS_DEFAULTS;
  }
}

/** @deprecated Prefer getPlatformSettings */
export async function getSiteSettings(): Promise<PlatformSettingsData> {
  return getPlatformSettings();
}

export async function upsertPlatformSettings(
  data: Partial<PlatformSettingsData>,
): Promise<PlatformSettingsData> {
  const current = await getPlatformSettings();
  const markSidebar = data.markSidebar
    ? normalizeMarkKind(data.markSidebar, current.markSidebar)
    : undefined;
  const markLogin = data.markLogin
    ? normalizeMarkKind(data.markLogin, current.markLogin)
    : undefined;
  const markHome = data.markHome
    ? normalizeMarkKind(data.markHome, current.markHome)
    : undefined;
  const markOrder = data.markOrder
    ? normalizeMarkKind(data.markOrder, current.markOrder)
    : undefined;
  const markFavicon = data.markFavicon
    ? normalizeMarkKind(data.markFavicon, current.markFavicon)
    : undefined;

  const shouldSyncFavicon =
    data.faviconUrl === undefined &&
    (data.iconUrl !== undefined ||
      data.logoUrl !== undefined ||
      markFavicon !== undefined);

  const syncedFavicon = shouldSyncFavicon
    ? faviconFromMarks(
        {
          ...data,
          markFavicon: markFavicon ?? current.markFavicon,
        },
        current,
      )
    : undefined;

  const row = await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {
      ...(data.siteName !== undefined && { siteName: data.siteName }),
      ...(data.siteTitle !== undefined && { siteTitle: data.siteTitle }),
      ...(data.siteDescription !== undefined && {
        siteDescription: data.siteDescription,
      }),
      ...(data.iconUrl !== undefined && { iconUrl: data.iconUrl }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      ...(data.faviconUrl !== undefined
        ? { faviconUrl: data.faviconUrl }
        : syncedFavicon !== undefined
          ? { faviconUrl: syncedFavicon }
          : {}),
      ...(data.primaryColor !== undefined && {
        primaryColor: data.primaryColor,
      }),
      ...(markSidebar !== undefined && { markSidebar }),
      ...(markLogin !== undefined && { markLogin }),
      ...(markHome !== undefined && { markHome }),
      ...(markOrder !== undefined && { markOrder }),
      ...(markFavicon !== undefined && { markFavicon }),
    },
    create: {
      id: "default",
      siteName: data.siteName ?? PLATFORM_SETTINGS_DEFAULTS.siteName,
      siteTitle: data.siteTitle ?? PLATFORM_SETTINGS_DEFAULTS.siteTitle,
      siteDescription:
        data.siteDescription ?? PLATFORM_SETTINGS_DEFAULTS.siteDescription,
      iconUrl: data.iconUrl ?? PLATFORM_SETTINGS_DEFAULTS.iconUrl,
      logoUrl: data.logoUrl ?? PLATFORM_SETTINGS_DEFAULTS.logoUrl,
      faviconUrl:
        data.faviconUrl ??
        syncedFavicon ??
        PLATFORM_SETTINGS_DEFAULTS.faviconUrl,
      primaryColor: data.primaryColor ?? PLATFORM_SETTINGS_DEFAULTS.primaryColor,
      markSidebar: markSidebar ?? PLATFORM_SETTINGS_DEFAULTS.markSidebar,
      markLogin: markLogin ?? PLATFORM_SETTINGS_DEFAULTS.markLogin,
      markHome: markHome ?? PLATFORM_SETTINGS_DEFAULTS.markHome,
      markOrder: markOrder ?? PLATFORM_SETTINGS_DEFAULTS.markOrder,
      markFavicon: markFavicon ?? PLATFORM_SETTINGS_DEFAULTS.markFavicon,
    },
  });
  return withAssetFallbacks(row as SiteSettingsRow);
}

/** @deprecated Prefer upsertPlatformSettings */
export async function upsertSiteSettings(
  data: Partial<PlatformSettingsData>,
): Promise<PlatformSettingsData> {
  return upsertPlatformSettings(data);
}
