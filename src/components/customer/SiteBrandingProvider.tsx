"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SiteSettingsData } from "@/lib/site-settings";

const DEFAULTS: SiteSettingsData = {
  siteName: "HunterDog",
  siteTitle: "HunterDog - ระบบสั่งอาหาร",
  siteDescription: "ระบบสั่งอาหารและจัดการออเดอร์ร้านหมาล่า",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#dc2626",
};

type SiteBrandingContextValue = SiteSettingsData & { loaded: boolean };

const SiteBrandingContext = createContext<SiteBrandingContextValue>({
  ...DEFAULTS,
  loaded: false,
});

export function useSiteBranding() {
  return useContext(SiteBrandingContext);
}

export function SiteBrandingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<SiteSettingsData>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/site-settings")
      .then((res) => (res.ok ? res.json() : DEFAULTS))
      .then((data: SiteSettingsData) => {
        setSettings(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--site-primary",
      settings.primaryColor,
    );
  }, [settings.primaryColor]);

  const value = useMemo(
    () => ({ ...settings, loaded }),
    [settings, loaded],
  );

  return (
    <SiteBrandingContext.Provider value={value}>
      {children}
    </SiteBrandingContext.Provider>
  );
}
