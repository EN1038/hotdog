import { Suspense } from "react";
import { ToastProvider } from "@/components/admin/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { StaffBrandingShell } from "@/components/staff/StaffBrandingShell";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <ToastProvider>
        <ConfirmProvider>
          <StaffBrandingShell>{children}</StaffBrandingShell>
        </ConfirmProvider>
      </ToastProvider>
    </Suspense>
  );
}
