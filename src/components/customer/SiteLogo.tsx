"use client";

import { useSiteBranding } from "./SiteBrandingProvider";

type SiteLogoProps = {
  logoUrl?: string | null;
  name?: string;
  size?: number;
  className?: string;
};

function DefaultLogoSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <path d="M20 8c-4 0-7 3-7 7v3h14v-3c0-4-3-7-7-7z" fill="#ef4444" />
      <rect x="11" y="17" width="18" height="12" rx="3" fill="var(--site-primary, #dc2626)" />
      <ellipse cx="20" cy="21" rx="7" ry="3.5" fill="#fbbf24" opacity="0.9" />
      <line
        x1="14"
        y1="6"
        x2="12"
        y2="1"
        stroke="#92400e"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="11.5" cy="0.5" r="2" fill="#f87171" />
      <line
        x1="20"
        y1="5"
        x2="20"
        y2="0"
        stroke="#92400e"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="20" cy="0" r="2" fill="#4ade80" />
      <line
        x1="26"
        y1="6"
        x2="28"
        y2="2"
        stroke="#92400e"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="28.5" cy="1.5" r="2" fill="#fbbf24" />
    </svg>
  );
}

export function SiteLogo({
  logoUrl,
  name,
  size = 72,
  className = "",
}: SiteLogoProps) {
  const branding = useSiteBranding();
  const src = logoUrl ?? branding.logoUrl;
  const label = name ?? branding.siteName;

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-b from-red-50 to-orange-50 ring-1 ring-red-100 ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <DefaultLogoSvg size={Math.round(size * 0.55)} />
      )}
    </div>
  );
}
