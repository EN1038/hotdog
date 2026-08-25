import { Suspense } from "react";
import { AdminSessionProvider } from "@/components/admin/AdminSessionProvider";
import { ToastProvider } from "@/components/admin/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { SiteBrandingProvider } from "@/components/customer/SiteBrandingProvider";

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiteBrandingProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AdminSessionProvider>
            <Suspense fallback={null}>{children}</Suspense>
          </AdminSessionProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SiteBrandingProvider>
  );
}
