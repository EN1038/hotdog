"use client";

import { ConfirmProvider } from "@/components/ConfirmDialog";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { PlatformBrandingProvider } from "@/components/customer/SiteBrandingProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlatformBrandingProvider>
      <ChunkLoadRecovery />
      <ConfirmProvider>{children}</ConfirmProvider>
    </PlatformBrandingProvider>
  );
}
