"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerLoginScreen } from "./CustomerLoginScreen";
import { useCustomer } from "./CustomerProvider";
import { localizedName } from "@/lib/localized";

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
        if (brand?.name) {
          setBrandInfo({
            name: localizedName(brand.name, brand.nameTh, brand.nameEn),
            logoUrl: brand.logoUrl ?? null,
          });
        }
        if (branchCode) {
          if (branches[0]?.id) {
            setDestination(`/order/store/${branches[0].id}`);
          } else {
            setNotFound(true);
          }
        } else if (branches.length > 0) {
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
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f6]">
        <p className="text-sm text-gray-400">กำลังโหลด...</p>
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
      onBrowseShop={() => router.push(destination)}
      onSuccess={() => router.replace(destination)}
    />
  );
}
