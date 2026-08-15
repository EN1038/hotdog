import { Suspense } from "react";
import { ToastProvider } from "@/components/admin/Toast";
import { StaffBrandingShell } from "@/components/staff/StaffBrandingShell";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <ToastProvider>
        <StaffBrandingShell>{children}</StaffBrandingShell>
      </ToastProvider>
    </Suspense>
  );
}
