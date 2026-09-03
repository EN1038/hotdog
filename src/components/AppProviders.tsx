"use client";

import { ConfirmProvider } from "@/components/ConfirmDialog";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { ToastProvider } from "@/components/admin/Toast";
import { PlatformBrandingProvider } from "@/components/customer/SiteBrandingProvider";
import { RouteChangeLoader } from "@/components/RouteChangeLoader";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlatformBrandingProvider>
      <ChunkLoadRecovery />
      <RouteChangeLoader />
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </PlatformBrandingProvider>
  );
}
