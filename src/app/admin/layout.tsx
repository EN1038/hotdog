import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminSessionProvider } from "@/components/admin/AdminSessionProvider";
import { ToastProvider } from "@/components/admin/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { SiteBrandingProvider } from "@/components/customer/SiteBrandingProvider";
import { PageLoadingScreen } from "@/components/PageLoadingScreen";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiteBrandingProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AdminSessionProvider>
            <Suspense fallback={<PageLoadingScreen label="กำลังเปิดหน้า…" />}>
              <AdminShell>{children}</AdminShell>
            </Suspense>
          </AdminSessionProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SiteBrandingProvider>
  );
}
