import { prisma } from "@/lib/db";

export type SiteSettingsData = {
  siteName: string;
  siteTitle: string;
  siteDescription: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
};

const DEFAULTS: SiteSettingsData = {
  siteName: "HunterDog",
  siteTitle: "HunterDog - ระบบสั่งอาหาร",
  siteDescription: "ระบบสั่งอาหารและจัดการออเดอร์ร้านหมาล่า",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#dc2626",
};

export async function getSiteSettings(): Promise<SiteSettingsData> {
  try {
    const row = await prisma.siteSettings.findUnique({ where: { id: "default" } });
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

export async function upsertSiteSettings(
  data: Partial<SiteSettingsData>,
): Promise<SiteSettingsData> {
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
