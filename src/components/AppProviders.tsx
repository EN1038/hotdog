"use client";

import { ConfirmProvider } from "@/components/ConfirmDialog";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}
