"use client";

import { useSiteBranding } from "@/components/customer/SiteBrandingProvider";
import {
  resolvePlatformMarkForPlacement,
  type MarkPlacement,
} from "@/lib/platform-branding";
import { PlatformMarkImage } from "@/components/PlatformMarkImage";

type PlatformMarkProps = {
  placement: Exclude<MarkPlacement, "favicon">;
  height?: number;
  className?: string;
  priority?: boolean;
};

/** Logo/icon ตามการตั้งค่าแพลตฟอร์ม + ตำแหน่งที่เลือก */
export function PlatformMark({
  placement,
  height = 40,
  className = "",
  priority = false,
}: PlatformMarkProps) {
  const branding = useSiteBranding();
  const { kind, src } = resolvePlatformMarkForPlacement(branding, placement);

  return (
    <PlatformMarkImage
      src={src}
      alt={branding.siteName}
      kind={kind}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
