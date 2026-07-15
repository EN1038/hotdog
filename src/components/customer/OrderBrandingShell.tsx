"use client";

import { useEffect, useState } from "react";
import {
  SiteBrandingProvider,
  type BrandingOverride,
} from "@/components/customer/SiteBrandingProvider";
import {
  loadActiveBrand,
  saveActiveBrand,
  type ActiveBrandSession,
} from "@/lib/customer-brand-session";
import { CustomerProvider } from "@/components/customer/CustomerProvider";

const BRAND_UPDATED_EVENT = "skillsale-brand-updated";

function toOverride(brand: ActiveBrandSession): BrandingOverride {
  return {
    siteName: brand.name,
    siteTitle: brand.name,
    logoUrl: brand.logoUrl,
    primaryColor: brand.primaryColor,
  };
}

/** โหลดธีมแบรนด์ที่จำไว้จากลิงก์แบรนด์/สาขา มาใช้ทั้งโซน /order */
export function OrderBrandingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  // เริ่มด้วย null ทั้ง SSR และ client เพื่อไม่ mismatch hydrate
  // แล้วค่อยอ่าน sessionStorage ใน useEffect
  const [override, setOverride] = useState<BrandingOverride | null>(null);

  useEffect(() => {
    function refresh() {
      const saved = loadActiveBrand();
      setOverride(saved ? toOverride(saved) : null);
    }
    refresh();
    window.addEventListener(BRAND_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(BRAND_UPDATED_EVENT, refresh);
  }, []);

  return (
    <SiteBrandingProvider brandOverride={override}>
      <CustomerProvider>
        <div className="mx-auto min-h-screen w-full max-w-md overflow-hidden bg-[#f5f5f6] shadow-xl">
          {children}
        </div>
      </CustomerProvider>
    </SiteBrandingProvider>
  );
}

/** เรียกเมื่อรู้แบรนด์จาก API (เช่น หน้า store) เพื่ออัปเดตธีม */
export function syncActiveBrandFromApi(brand: {
  code?: string | null;
  name?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  color?: string | null;
  contactPhone?: string | null;
} | null | undefined) {
  if (!brand?.code?.trim() || !brand.name) return;
  const prev = loadActiveBrand();
  const next: ActiveBrandSession = {
    code: brand.code.trim(),
    name: brand.nameTh?.trim() || brand.nameEn?.trim() || brand.name,
    logoUrl: brand.logoUrl?.trim() || null,
    coverImageUrl:
      brand.coverImageUrl?.trim() ||
      (prev?.code === brand.code.trim() ? prev.coverImageUrl : null),
    primaryColor: brand.color?.trim() || "#dc2626",
    contactPhone: brand.contactPhone?.replace(/\D/g, "").trim() || null,
  };
  saveActiveBrand(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BRAND_UPDATED_EVENT));
  }
}
