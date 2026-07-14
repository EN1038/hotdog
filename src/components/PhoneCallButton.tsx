"use client";

import { IconPhone } from "@/components/icons";
import { formatThaiPhone, normalizePhone, telHref } from "@/lib/constants";

type PhoneCallButtonProps = {
  phone: string | null | undefined;
  /** show formatted number next to icon */
  showNumber?: boolean;
  className?: string;
  size?: number;
};

export function PhoneCallButton({
  phone,
  showNumber = false,
  className = "",
  size = 16,
}: PhoneCallButtonProps) {
  const digits = normalizePhone(phone ?? "");
  if (!digits) return null;

  return (
    <a
      href={telHref(digits)}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 ${className}`}
      title={`โทร ${formatThaiPhone(digits)}`}
      onClick={(e) => e.stopPropagation()}
    >
      <IconPhone size={size} className="text-emerald-700" />
      {showNumber ? formatThaiPhone(digits) : "โทร"}
    </a>
  );
}

/** Inline clickable phone text */
export function PhoneTextLink({
  phone,
  className = "font-medium text-emerald-700 hover:underline",
}: {
  phone: string | null | undefined;
  className?: string;
}) {
  const digits = normalizePhone(phone ?? "");
  if (!digits) return <span>—</span>;
  return (
    <a href={telHref(digits)} className={className}>
      {formatThaiPhone(digits)}
    </a>
  );
}
