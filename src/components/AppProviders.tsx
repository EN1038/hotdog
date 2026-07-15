"use client";

import { ConfirmProvider } from "@/components/ConfirmDialog";
import { SiteBrandingProvider } from "@/components/customer/SiteBrandingProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SiteBrandingProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </SiteBrandingProvider>
  );
}
