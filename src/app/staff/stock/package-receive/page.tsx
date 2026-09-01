"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { StaffPackageReceivePanel } from "@/components/staff/StaffPackageReceivePanel";

function PackageReceiveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialScan = useMemo(
    () => searchParams.get("code")?.trim() ?? "",
    [searchParams],
  );

  return (
    <StaffPackageReceivePanel
      onBack={() => router.push("/staff/stock?action=stock_in")}
      initialScan={initialScan}
    />
  );
}

export default function PackageReceivePage() {
  return (
    <StaffAppShell active="stock">
      <Suspense fallback={<LoadingState label="กำลังโหลด…" />}>
        <PackageReceiveContent />
      </Suspense>
    </StaffAppShell>
  );
}
