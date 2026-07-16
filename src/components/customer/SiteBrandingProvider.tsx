"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PlatformSettingsData } from "@/lib/platform-branding";
import { PLATFORM_SETTINGS_DEFAULTS } from "@/lib/platform-branding";
import { DEFAULT_BRAND_COLOR, parseHexColor, normalizePrimaryColor } from "@/lib/color";

export type BrandingOverride = {
  siteName?: string;
  siteTitle?: string | null;
  siteDescription?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
};

type SiteBrandingContextValue = PlatformSettingsData & {
  loaded: boolean;
  isBrandOverride: boolean;
};

const PlatformBrandingContext = createContext<PlatformSettingsData>(
  PLATFORM_SETTINGS_DEFAULTS,
);

const SiteBrandingContext = createContext<SiteBrandingContextValue>({
  ...PLATFORM_SETTINGS_DEFAULTS,
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
    ...platform,
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
    primaryColor: normalizePrimaryColor(
      override.primaryColor,
      platform.primaryColor,
    ),
  };
}

/** Loads platform shell branding once at the app root — does not touch --site-primary. */
export function PlatformBrandingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [platform, setPlatform] = useState<PlatformSettingsData>(
    PLATFORM_SETTINGS_DEFAULTS,
  );

  useEffect(() => {
    fetch("/api/site-settings")
      .then((res) => (res.ok ? res.json() : PLATFORM_SETTINGS_DEFAULTS))
      .then((data: PlatformSettingsData) => {
        setPlatform({
          ...PLATFORM_SETTINGS_DEFAULTS,
          ...data,
          iconUrl: data.iconUrl || PLATFORM_SETTINGS_DEFAULTS.iconUrl,
          logoUrl: data.logoUrl || PLATFORM_SETTINGS_DEFAULTS.logoUrl,
          faviconUrl: data.faviconUrl || PLATFORM_SETTINGS_DEFAULTS.faviconUrl,
          siteName: data.siteName || PLATFORM_SETTINGS_DEFAULTS.siteName,
          siteTitle: data.siteTitle || PLATFORM_SETTINGS_DEFAULTS.siteTitle,
          primaryColor:
            data.primaryColor || PLATFORM_SETTINGS_DEFAULTS.primaryColor,
          markSidebar:
            data.markSidebar || PLATFORM_SETTINGS_DEFAULTS.markSidebar,
          markLogin: data.markLogin || PLATFORM_SETTINGS_DEFAULTS.markLogin,
          markHome: data.markHome || PLATFORM_SETTINGS_DEFAULTS.markHome,
          markOrder: data.markOrder || PLATFORM_SETTINGS_DEFAULTS.markOrder,
          markFavicon:
            data.markFavicon || PLATFORM_SETTINGS_DEFAULTS.markFavicon,
        });
      })
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  return (
    <PlatformBrandingContext.Provider value={platform}>
      {children}
    </PlatformBrandingContext.Provider>
  );
}

export function SiteBrandingProvider({
  children,
  brandOverride = null,
}: {
  children: React.ReactNode;
  /** When set (brand storefront), overrides platform shell branding */
  brandOverride?: BrandingOverride | null;
}) {
  const platform = useContext(PlatformBrandingContext);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(true);
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


