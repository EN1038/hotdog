"use client";

import BranchDetailPage from "@/app/admin/branches/[id]/page";
import { AdminBranchShellProvider } from "@/components/admin/AdminBranchShellContext";
import { OwnerBranchShell } from "@/components/owner/OwnerBranchShell";
import { useSearchParams } from "next/navigation";

export default function OwnerBranchAdminPage() {
  const searchParams = useSearchParams();
  const focusMode = searchParams.get("focus") === "1";

  return (
    <OwnerBranchShell
      backHref={focusMode ? "/owner/settings" : "/owner"}
      backLabel={focusMode ? "กลับตั้งค่า" : "กลับหน้าแรก"}
      focusMode={focusMode}
    >
      <AdminBranchShellProvider embeddedInOwnerShell>
        <BranchDetailPage />
      </AdminBranchShellProvider>
    </OwnerBranchShell>
  );
}
