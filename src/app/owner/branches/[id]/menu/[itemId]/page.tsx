"use client";

import MenuItemEditorPage from "@/app/admin/branches/[id]/menu/[itemId]/page";
import { AdminBranchShellProvider } from "@/components/admin/AdminBranchShellContext";
import { OwnerBranchShell } from "@/components/owner/OwnerBranchShell";
import { branchAdminBasePath } from "@/lib/branch-admin-path";
import { useParams } from "next/navigation";

export default function OwnerBranchMenuEditorPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <OwnerBranchShell
      backHref={`${branchAdminBasePath(id, { ownerShell: true })}?tab=menu&focus=1`}
      backLabel="กลับรายการเมนู"
      focusMode
    >
      <AdminBranchShellProvider embeddedInOwnerShell>
        <MenuItemEditorPage />
      </AdminBranchShellProvider>
    </OwnerBranchShell>
  );
}
