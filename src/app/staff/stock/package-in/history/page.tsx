"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { StaffPackageInHistoryPanel } from "@/components/staff/StaffPackageInHistoryPanel";

function HistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batchId");
  const open = searchParams.get("open") === "1";

  return (
    <StaffPackageInHistoryPanel
      onBack={() => router.push("/staff/stock/package-in")}
      highlightBatchId={batchId}
      autoOpenBatchId={open ? batchId : null}
    />
  );
}

export default function PackageInHistoryPage() {
  return (
    <StaffAppShell active="stock">
      <Suspense fallback={<LoadingState label="กำลังโหลดประวัติ…" />}>
        <HistoryContent />
      </Suspense>
    </StaffAppShell>
  );
}
