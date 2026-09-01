"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { StaffPackageInPanel } from "@/components/staff/StaffPackageInPanel";

function PackageInContent() {
  const router = useRouter();
  return (
    <StaffPackageInPanel
      onBack={() => router.push("/staff/stock")}
      onHistory={() => router.push("/staff/stock/package-in/history")}
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
