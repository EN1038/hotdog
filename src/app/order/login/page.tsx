"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CustomerLoginScreen } from "@/components/customer/CustomerLoginScreen";
import { useCustomer } from "@/components/customer/CustomerProvider";
import { LoadingState } from "@/components/LoadingState";
import { loadActiveBrand } from "@/lib/customer-brand-session";
import { syncActiveBrandFromApi } from "@/components/customer/OrderBrandingShell";

function safeReturnPath(path: string | null): string {
  if (!path || !path.startsWith("/order")) return "/order";
  return path;
}

type BranchApiRow = {
  id?: string;
  imageUrl?: string | null;
  brand?: {
    code?: string | null;
    name?: string | null;
    nameTh?: string | null;
    nameEn?: string | null;
    logoUrl?: string | null;
    coverImageUrl?: string | null;
    color?: string | null;
    contactPhone?: string | null;
  } | null;
};

function OrderLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  const { cartBranchId } = useCustomer();
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const storeMatch = returnTo.match(/^\/order\/store\/([^/?#]+)/);
    const branchIdFromReturn = storeMatch?.[1] ?? null;
    const branchId = branchIdFromReturn || cartBranchId;
    const active = loadActiveBrand();

    // แสดงรูปปกจาก session ทันที แล้วค่อยอัปเดตจาก API
    if (active?.coverImageUrl) setHeroImageUrl(active.coverImageUrl);
    if (active?.logoUrl) setBrandLogoUrl(active.logoUrl);

    const url = active?.code
      ? `/api/customer/branches?brand=${encodeURIComponent(active.code)}`
      : "/api/customer/branches";

    fetch(url)
      .then((res) => res.json())
      .then((data: unknown) => {
        const branches = Array.isArray(data) ? (data as BranchApiRow[]) : [];
        const branch = branchId
          ? branches.find((b) => b.id === branchId)
          : branches[0];
        const brand = branch?.brand ?? branches[0]?.brand;
        if (!brand) return;

        syncActiveBrandFromApi(brand);

        const brandLogo =
          typeof brand.logoUrl === "string" && brand.logoUrl.trim()
            ? brand.logoUrl.trim()
            : null;
        const brandCover =
          typeof brand.coverImageUrl === "string" && brand.coverImageUrl.trim()
            ? brand.coverImageUrl.trim()
            : null;
        const branchImage =
          typeof branch?.imageUrl === "string" && branch.imageUrl.trim()
            ? branch.imageUrl.trim()
            : null;

        setBrandLogoUrl(brandLogo);

        // ลิงก์กลับไปหน้าร้าน → รูปสาขา (แบบเข้าจากลิงก์สาขา)
        // ตะกร้า/checkout/ประวัติ → รูปปกแบรนด์ (แบบตอนเข้า /order)
        if (branchIdFromReturn) {
          setHeroImageUrl(branchImage || brandCover);
        } else {
          setHeroImageUrl(brandCover || branchImage);
        }
      })
      .catch(() => {
        /* keep session fallback */
      });
  }, [returnTo, cartBranchId]);

  return (
    <CustomerLoginScreen
      showBrowseOption={false}
      brandLogoUrl={brandLogoUrl}
      heroImageUrl={heroImageUrl}
      onBack={() => router.replace(returnTo)}
      onSuccess={() => router.replace(returnTo)}
    />
  );
}

export default function OrderLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f5f5f6] px-4">
          <LoadingState className="w-full max-w-sm border-0 bg-transparent shadow-none" />
        </main>
      }
    >
      <OrderLoginContent />
    </Suspense>
  );
}
