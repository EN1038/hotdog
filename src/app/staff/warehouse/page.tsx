"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { OwnerStockInner } from "@/components/owner/OwnerStockWorkspace";
import { LoadingState } from "@/components/LoadingState";

export default function StaffWarehousePage() {
  const router = useRouter();
  const [brandId, setBrandId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff/branding", { cache: "no-store" })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/staff/login");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then(
        (
          data: { branchKind?: string; brandId?: string | null } | null,
        ) => {
          if (cancelled || !data) return;
          if (data.branchKind !== "WAREHOUSE" || !data.brandId) {
            router.replace("/staff");
            return;
          }
          setBrandId(data.brandId);
          setReady(true);
        },
      )
      .catch(() => {
        if (!cancelled) router.replace("/staff");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready || !brandId) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" recoveryAfterMs={8000} />
      </main>
    );
  }

  return (
    <StaffAppShell active="stock">
      <OwnerStockInner
        brandId={brandId}
        stockApiBase="/api/staff/warehouse"
        canManageSettings={false}
        canEnableStock={false}
      />
    </StaffAppShell>
  );
}
