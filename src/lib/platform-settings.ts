import { prisma } from "@/lib/db";

/** Platform shell branding (not a restaurant brand). */
export type PlatformSettingsData = {
  siteName: string;
  siteTitle: string;
  siteDescription: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
};

/** @deprecated Prefer PlatformSettingsData — alias for existing imports */
export type SiteSettingsData = PlatformSettingsData;

const DEFAULTS: PlatformSettingsData = {
  siteName: "SkillSale",
  siteTitle: "SkillSale - ระบบสั่งอาหารออนไลน์",
  siteDescription: "แพลตฟอร์มจัดการร้านค้าและรับออเดอร์ออนไลน์",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#dc2626",
};

export async function getPlatformSettings(): Promise<PlatformSettingsData> {
  try {
    const row = await prisma.siteSettings.findUnique({
      where: { id: "default" },
    });
    if (!row) return DEFAULTS;
    return {
      siteName: row.siteName,
      siteTitle: row.siteTitle,
      siteDescription: row.siteDescription,
      logoUrl: row.logoUrl,
      faviconUrl: row.faviconUrl,
      primaryColor: row.primaryColor,
    };
  } catch {
    return DEFAULTS;
  }
}

/** @deprecated Prefer getPlatformSettings */
export async function getSiteSettings(): Promise<PlatformSettingsData> {
  return getPlatformSettings();
}

export async function upsertPlatformSettings(
  data: Partial<PlatformSettingsData>,
): Promise<PlatformSettingsData> {
  const row = await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {
      ...(data.siteName !== undefined && { siteName: data.siteName }),
      ...(data.siteTitle !== undefined && { siteTitle: data.siteTitle }),
      ...(data.siteDescription !== undefined && {
        siteDescription: data.siteDescription,
      }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      ...(data.faviconUrl !== undefined && { faviconUrl: data.faviconUrl }),
      ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
    },
    create: {
      id: "default",
      siteName: data.siteName ?? DEFAULTS.siteName,
      siteTitle: data.siteTitle ?? DEFAULTS.siteTitle,
      siteDescription: data.siteDescription ?? DEFAULTS.siteDescription,
      logoUrl: data.logoUrl ?? null,
      faviconUrl: data.faviconUrl ?? null,
      primaryColor: data.primaryColor ?? DEFAULTS.primaryColor,
    },
  });
  return {
    siteName: row.siteName,
    siteTitle: row.siteTitle,
    siteDescription: row.siteDescription,
    logoUrl: row.logoUrl,
    faviconUrl: row.faviconUrl,
    primaryColor: row.primaryColor,
  };
}

/** @deprecated Prefer upsertPlatformSettings */
export async function upsertSiteSettings(
  data: Partial<PlatformSettingsData>,
): Promise<PlatformSettingsData> {
  return upsertPlatformSettings(data);
}
