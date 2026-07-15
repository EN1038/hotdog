import { AdminShell } from "@/components/admin/AdminShell";
import { AdminSessionProvider } from "@/components/admin/AdminSessionProvider";
import { ToastProvider } from "@/components/admin/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AdminSessionProvider>
          <AdminShell>{children}</AdminShell>
        </AdminSessionProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
