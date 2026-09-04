"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformMark } from "@/components/PlatformMark";

export const MERCHANT_REGISTER_HEADER_BG = "/bg_top_register.webp";

type MerchantRegisterStyleShellProps = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  backHref?: string;
  onBack?: () => void;
  hideBack?: boolean;
  showLogo?: boolean;
  logoHeight?: number;
  headerBg?: string;
  logo?: ReactNode;
};

function BackChevron() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MerchantRegisterStyleShell({
  title,
  subtitle,
  children,
  backHref = "/",
  onBack,
  hideBack = false,
  showLogo = true,
  logoHeight = 56,
  headerBg = MERCHANT_REGISTER_HEADER_BG,
  logo,
}: MerchantRegisterStyleShellProps) {
  const backClass =
    "flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/20 hover:scale-105 active:scale-95 active:bg-white/25";

  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div
        className="relative shrink-0 overflow-hidden bg-cover bg-center bg-no-repeat px-4 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))]"
        style={{ backgroundImage: `url('${headerBg}')` }}
      >
        <div className="relative flex items-center gap-2">
          {!hideBack ? (
            onBack ? (
              <button
                type="button"
                onClick={onBack}
                className={backClass}
                aria-label="ย้อนกลับ"
              >
                <BackChevron />
              </button>
            ) : (
              <Link href={backHref} className={backClass} aria-label="กลับ">
                <BackChevron />
              </Link>
            )
          ) : (
            <span className="h-10 w-10" aria-hidden />
          )}
          <h1 className="flex-1 pr-10 text-center text-[17px] font-bold tracking-tight text-white">
            {title}
          </h1>
        </div>

        {showLogo || subtitle ? (
          <div className="relative mt-5 flex flex-col items-center text-center">
            {showLogo ? (
              <div className="flex min-w-[11.5rem] items-center justify-center rounded-[1.25rem] bg-white px-5 py-3.5 shadow-[0_10px_32px_-8px_rgba(0,0,0,0.28)]">
                {logo ?? (
                  <PlatformMark placement="login" height={logoHeight} priority />
                )}
              </div>
            ) : null}
            {subtitle ? (
              <p className="mt-4 text-[15px] font-medium leading-relaxed text-white/95">
                {subtitle}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 -mt-16 flex min-h-0 flex-1 flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-[1.75rem] bg-white px-5 pb-6 pt-6 shadow-[0_-4px_32px_-8px_rgba(16,94,57,0.12)] sm:px-6">
          {children}
        </div>
      </div>
    </main>
  );
}
