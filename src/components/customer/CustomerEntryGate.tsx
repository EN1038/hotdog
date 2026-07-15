"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerLoginScreen } from "./CustomerLoginScreen";
import { useCustomer } from "./CustomerProvider";
import { LoadingState } from "@/components/LoadingState";
import { localizedName } from "@/lib/localized";
import { saveActiveBrand } from "@/lib/customer-brand-session";

type CustomerEntryGateProps = {
  brandCode: string;
  branchCode?: string;
};

export function CustomerEntryGate({
  brandCode,
  branchCode,
}: CustomerEntryGateProps) {
  const router = useRouter();
  const { session, sessionChecked } = useCustomer();
  const [destination, setDestination] = useState<string | null>(null);
  const [brandInfo, setBrandInfo] = useState<{
    name: string;
    logoUrl: string | null;
    heroImageUrl: string | null;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ brand: brandCode });
    if (branchCode) params.set("branch", branchCode);

    fetch(`/api/customer/branches?${params}`)
      .then((res) => res.json())
      .then((data) => {
        const branches = Array.isArray(data) ? data : [];
        const brand = branches[0]?.brand;
        const brandName = brand?.name
          ? localizedName(brand.name, brand.nameTh, brand.nameEn)
          : null;
        const brandLogo =
          typeof brand?.logoUrl === "string" && brand.logoUrl.trim()
            ? brand.logoUrl.trim()
            : null;
        const brandCover =
          typeof brand?.coverImageUrl === "string" && brand.coverImageUrl.trim()
            ? brand.coverImageUrl.trim()
            : null;

        if (brand?.code && brandName) {
          saveActiveBrand({
            code: brand.code,
            name: brandName,
            logoUrl: brandLogo,
            coverImageUrl: brandCover,
            primaryColor:
              typeof brand.color === "string" && brand.color.trim()
                ? brand.color.trim()
                : "#dc2626",
            contactPhone:
              typeof brand.contactPhone === "string" && brand.contactPhone.trim()
                ? brand.contactPhone.replace(/\D/g, "")
                : null,
          });
        }

        if (branchCode) {
          // เข้าจากลิงก์สาขา — รู้สาขาแล้ว ใช้รูปสาขาเป็นหัวภาพ
          if (branches[0]?.id) {
            const branchImage =
              typeof branches[0]?.imageUrl === "string" &&
              branches[0].imageUrl.trim()
                ? branches[0].imageUrl.trim()
                : null;
            if (brandName) {
              setBrandInfo({
                name: brandName,
                logoUrl: brandLogo,
                heroImageUrl: branchImage,
              });
            }
            setDestination(`/order/store/${branches[0].id}`);
          } else {
            setNotFound(true);
          }
        } else if (branches.length > 0) {
          // เข้าจากลิงก์แบรนด์ — ใช้รูปปกแบรนด์ (ยังไม่รู้สาขา)
          if (brandName) {
            setBrandInfo({
              name: brandName,
              logoUrl: brandLogo,
              heroImageUrl: brandCover,
            });
          }
          setDestination("/order");
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [brandCode, branchCode]);

  useEffect(() => {
    if (sessionChecked && session && destination) {
      router.replace(destination);
    }
  }, [sessionChecked, session, destination, router]);

  if (loading || !sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f6] px-4">
        <LoadingState className="w-full max-w-sm border-0 bg-transparent shadow-none" />
      </main>
    );
  }

  if (session) return null;

  if (notFound || !destination) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f5f5f6] p-6">
        <p className="text-center text-gray-500">ไม่พบร้านหรือสาขานี้</p>
      </main>
    );
  }

  return (
    <CustomerLoginScreen
      showBackButton={false}
      brandName={brandInfo?.name}
      brandLogoUrl={brandInfo?.logoUrl}
      heroImageUrl={brandInfo?.heroImageUrl}
      browseHint={
        branchCode
          ? "เข้าดูเมนูและสั่งที่สาขานี้ได้เลย โดยไม่ต้องเข้าสู่ระบบ"
          : "เลือกดูเมนูและสาขาได้ก่อน โดยไม่ต้องเข้าสู่ระบบ"
      }
      browseLabel={branchCode ? "เข้าชมสาขานี้" : "เข้าชมร้าน"}
      onBrowseShop={() => router.replace(destination)}
      onSuccess={() => router.replace(destination)}
    />
  );
}
