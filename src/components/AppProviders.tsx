"use client";

import { ConfirmProvider } from "@/components/ConfirmDialog";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { ToastProvider } from "@/components/admin/Toast";
import { PlatformBrandingProvider } from "@/components/customer/SiteBrandingProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlatformBrandingProvider>
      <ChunkLoadRecovery />
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </PlatformBrandingProvider>
  );
}
