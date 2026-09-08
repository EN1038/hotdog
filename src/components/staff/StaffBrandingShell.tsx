"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  SiteBrandingProvider,
  type BrandingOverride,
} from "@/components/customer/SiteBrandingProvider";
import { PageLoadingScreen } from "@/components/PageLoadingScreen";
import {
  loadStaffBrand,
  saveStaffBrand,
  staffBrandFromApi,
  type StaffBrandSession,
} from "@/lib/staff-brand-session";

const BRAND_UPDATED_EVENT = "skillsale-staff-brand-updated";

function toOverride(brand: StaffBrandSession): BrandingOverride {
  return {
    siteName: brand.name,
    siteTitle: brand.name,
    logoUrl: brand.logoUrl,
    primaryColor: brand.primaryColor,
  };
}

function applyBrand(brand: StaffBrandSession) {
  saveStaffBrand(brand);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BRAND_UPDATED_EVENT));
  }
}

/** โหลดธีมแบรนด์ของสาขาที่พนักงานอยู่ มาใช้ทั้งโซน /staff */
export function StaffBrandingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/staff/login";
  const [override, setOverride] = useState<BrandingOverride | null>(null);
  const [brandingReady, setBrandingReady] = useState(isAuthPage);

  useLayoutEffect(() => {
    if (isAuthPage) {
      setOverride(null);
      setBrandingReady(true);
      return;
    }
    const saved = loadStaffBrand();
    if (saved) {
      setOverride(toOverride(saved));
      setBrandingReady(true);
    }
  }, [isAuthPage]);

  useEffect(() => {
    function refreshFromCache() {
      const saved = loadStaffBrand();
      setOverride(saved ? toOverride(saved) : null);
      if (saved?.primaryColor) setBrandingReady(true);
    }
    window.addEventListener(BRAND_UPDATED_EVENT, refreshFromCache);

    if (isAuthPage) {
      return () => {
        window.removeEventListener(BRAND_UPDATED_EVENT, refreshFromCache);
      };
    }

    let cancelled = false;
    fetch("/api/staff/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { brand?: Parameters<typeof staffBrandFromApi>[0] } | null) => {
        if (cancelled) return;
        if (data?.brand) {
          const next = staffBrandFromApi(data.brand);
          if (next) {
            applyBrand(next);
            setOverride(toOverride(next));
          }
        }
        setBrandingReady(true);
      })
      .catch(() => {
        if (!cancelled) setBrandingReady(true);
      });

    return () => {
      cancelled = true;
      window.removeEventListener(BRAND_UPDATED_EVENT, refreshFromCache);
    };
  }, [isAuthPage]);

  if (!isAuthPage && !brandingReady) {
    return <PageLoadingScreen label="กำลังโหลดร้าน…" />;
  }

  return (
    <SiteBrandingProvider brandOverride={isAuthPage ? null : override}>
      {children}
    </SiteBrandingProvider>
  );
}

/** เรียกหลัง login สำเร็จ เพื่อจำธีมก่อนโหลดหน้า /staff */
export function syncStaffBrandFromLogin(brand: {
  code?: string | null;
  name?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
  logoUrl?: string | null;
  color?: string | null;
} | null | undefined) {
  const next = staffBrandFromApi(brand);
  if (!next) return;
  applyBrand(next);
}
