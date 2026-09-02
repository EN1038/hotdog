"use client";

import type { ReactNode } from "react";
import {
  MerchantRegisterStyleShell,
  MERCHANT_REGISTER_HEADER_BG,
} from "@/components/MerchantRegisterStyleShell";

/** @deprecated Use MERCHANT_REGISTER_HEADER_BG */
export const MERCHANT_AUTH_BG_IMAGE = MERCHANT_REGISTER_HEADER_BG;

type MerchantAuthShellProps = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  backHref?: string;
  onBack?: () => void;
  hideBack?: boolean;
  logoHeight?: number;
  showLogo?: boolean;
  logo?: ReactNode;
  headerBg?: string;
};

export function MerchantAuthShell({
  title,
  subtitle,
  children,
  backHref = "/",
  onBack,
  hideBack = false,
  logoHeight = 52,
  showLogo = true,
  logo,
  headerBg,
}: MerchantAuthShellProps) {
  return (
    <MerchantRegisterStyleShell
      title={title}
      subtitle={subtitle}
      backHref={backHref}
      onBack={onBack}
      hideBack={hideBack}
      logoHeight={logoHeight}
      showLogo={showLogo}
      logo={logo}
      headerBg={headerBg}
    >
      {children}
    </MerchantRegisterStyleShell>
  );
}
