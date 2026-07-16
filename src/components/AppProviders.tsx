"use client";

import { ConfirmProvider } from "@/components/ConfirmDialog";
import { PlatformBrandingProvider } from "@/components/customer/SiteBrandingProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlatformBrandingProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </PlatformBrandingProvider>
  );
}
