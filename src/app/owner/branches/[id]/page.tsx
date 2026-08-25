"use client";

import BranchDetailPage from "@/app/admin/branches/[id]/page";
import { AdminBranchShellProvider } from "@/components/admin/AdminBranchShellContext";
import { OwnerBranchShell } from "@/components/owner/OwnerBranchShell";

export default function OwnerBranchAdminPage() {
  return (
    <OwnerBranchShell backHref="/owner" backLabel="กลับหน้าแรก">
      <AdminBranchShellProvider embeddedInOwnerShell>
        <BranchDetailPage />
      </AdminBranchShellProvider>
    </OwnerBranchShell>
  );
}
