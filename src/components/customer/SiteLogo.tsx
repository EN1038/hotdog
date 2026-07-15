"use client";

import { useSiteBranding } from "./SiteBrandingProvider";
import {
  resolvePlatformMarkForPlacement,
  type MarkPlacement,
} from "@/lib/platform-branding";
import { SKILLSALE_ICON_URL, SKILLSALE_LOGO_URL } from "@/lib/brand-assets";

type SiteLogoProps = {
  logoUrl?: string | null;
  name?: string;
  size?: number;
  className?: string;
  /** When no explicit logoUrl and not brand override, use this placement */
  platformPlacement?: Extract<MarkPlacement, "login" | "order">;
};

export function SiteLogo({
  logoUrl,
  name,
  size = 72,
  className = "",
  platformPlacement = "order",
}: SiteLogoProps) {
  const branding = useSiteBranding();

  let src: string;
  let treatAsIcon: boolean;

  if (logoUrl?.trim()) {
    src = logoUrl.trim();
    treatAsIcon = true;
  } else if (branding.isBrandOverride && branding.logoUrl?.trim()) {
    src = branding.logoUrl.trim();
    treatAsIcon = true;
  } else {
    const resolved = resolvePlatformMarkForPlacement(
      branding,
      platformPlacement,
    );
    src = resolved.src;
    treatAsIcon = resolved.kind === "icon";
  }

  const label = name ?? branding.siteName;
  const isDefaultMark =
    src === SKILLSALE_ICON_URL || src === SKILLSALE_LOGO_URL;

  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${
        treatAsIcon
          ? isDefaultMark
            ? "rounded-2xl bg-white/80"
            : "rounded-full bg-gradient-to-b from-red-50 to-orange-50 ring-1 ring-red-100"
          : "rounded-2xl bg-transparent"
      } ${className}`}
      style={
        treatAsIcon
          ? { width: size, height: size }
          : { height: size, width: Math.round(size * 3.2) }
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        className={
          treatAsIcon
            ? isDefaultMark
              ? "h-[82%] w-[82%] object-contain"
              : "h-full w-full rounded-full object-cover"
            : "h-full w-full object-contain"
        }
      />
    </div>
  );
}
