import { AdminShell } from "@/components/admin/AdminShell";
import { AdminSessionProvider } from "@/components/admin/AdminSessionProvider";
import { ToastProvider } from "@/components/admin/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { SiteBrandingProvider } from "@/components/customer/SiteBrandingProvider";

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
            <AdminShell>{children}</AdminShell>
          </AdminSessionProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SiteBrandingProvider>
  );
}
