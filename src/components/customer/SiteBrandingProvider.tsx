"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PlatformSettingsData } from "@/lib/platform-settings";

export type BrandingOverride = {
  siteName?: string;
  siteTitle?: string | null;
  siteDescription?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string;
};

const PLATFORM_DEFAULTS: PlatformSettingsData = {
  siteName: "SkillSale",
  siteTitle: "SkillSale - ระบบสั่งอาหารออนไลน์",
  siteDescription: "แพลตฟอร์มจัดการร้านค้าและรับออเดอร์ออนไลน์",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#dc2626",
};

type SiteBrandingContextValue = PlatformSettingsData & {
  loaded: boolean;
  isBrandOverride: boolean;
};

const SiteBrandingContext = createContext<SiteBrandingContextValue>({
  ...PLATFORM_DEFAULTS,
  loaded: false,
  isBrandOverride: false,
});

export function useSiteBranding() {
  return useContext(SiteBrandingContext);
}

function mergeBranding(
  platform: PlatformSettingsData,
  override?: BrandingOverride | null,
): PlatformSettingsData {
  if (!override) return platform;
  return {
    siteName: override.siteName ?? platform.siteName,
    siteTitle: override.siteTitle ?? platform.siteTitle,
    siteDescription:
      override.siteDescription !== undefined
        ? override.siteDescription
        : platform.siteDescription,
    logoUrl:
      override.logoUrl !== undefined ? override.logoUrl : platform.logoUrl,
    faviconUrl:
      override.faviconUrl !== undefined
        ? override.faviconUrl
        : platform.faviconUrl,
    primaryColor: override.primaryColor ?? platform.primaryColor,
  };
}

export function SiteBrandingProvider({
  children,
  brandOverride = null,
}: {
  children: React.ReactNode;
  /** When set (brand storefront), overrides platform shell branding */
  brandOverride?: BrandingOverride | null;
}) {
  const [platform, setPlatform] =
    useState<PlatformSettingsData>(PLATFORM_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/site-settings")
      .then((res) => (res.ok ? res.json() : PLATFORM_DEFAULTS))
      .then((data: PlatformSettingsData) => {
        setPlatform(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const settings = useMemo(
    () => mergeBranding(platform, brandOverride),
    [platform, brandOverride],
  );

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--site-primary",
      settings.primaryColor,
    );
  }, [settings.primaryColor]);

  const value = useMemo(
    () => ({
      ...settings,
      loaded,
      isBrandOverride: Boolean(brandOverride),
    }),
    [settings, loaded, brandOverride],
  );

  return (
    <SiteBrandingContext.Provider value={value}>
      {children}
    </SiteBrandingContext.Provider>
  );
}
