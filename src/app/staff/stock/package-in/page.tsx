"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { StaffPackageInPanel } from "@/components/staff/StaffPackageInPanel";
import { stockMenuQrPayload } from "@/lib/stock-menu-qr";

function PackageInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillItem = useMemo(() => {
    const itemId = searchParams.get("item")?.trim();
    const code = searchParams.get("code")?.trim();
    if (!itemId && !code) return null;
    const qr = stockMenuQrPayload({
      itemId,
      productCode: code ?? "",
    });
    return qr ? { qr } : null;
  }, [searchParams]);

  return (
    <StaffPackageInPanel
      onBack={() => router.push("/staff/stock")}
      onHistory={() => router.push("/staff/stock/package-in/history")}
      initialScanQr={prefillItem?.qr ?? null}
      onSuccess={(batchId) => {
        router.push(
          `/staff/stock/package-in/history?batchId=${encodeURIComponent(batchId)}&open=1`,
        );
      }}
    />
  );
}

export default function PackageInPage() {
  return (
    <StaffAppShell active="stock">
      <Suspense fallback={<LoadingState label="กำลังโหลด…" />}>
        <PackageInContent />
      </Suspense>
    </StaffAppShell>
  );
}
