"use client";

import { formatPrice } from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";

export type StaffRoundBannerProps = {
  operatingDay: string;
  /** Compact strip for key-order headers */
  compact?: boolean;
  /** When false, store has no open staff shift */
  canSell?: boolean;
  activeShift?: {
    roundNumber: number;
    openedAt: string;
    openingCash: number;
  } | null;
};

function formatShiftTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function StaffOperatingRoundBanner({
  operatingDay,
  compact = false,
  canSell,
  activeShift,
}: StaffRoundBannerProps) {
  // Explicit shift-aware mode (staff dashboard / key-order gate)
  if (canSell === false) {
    return (
      <div
        className={`rounded-xl border border-red-200 bg-red-50 px-3 text-red-900 ${compact ? "py-2" : "py-2.5"}`}
        role="status"
      >
        <p className={`font-semibold ${compact ? "text-xs" : "text-sm"}`}>
          ร้านปิดรอบ
        </p>
        <p className={`mt-0.5 ${compact ? "text-[11px]" : "text-xs"} opacity-90`}>
          ปิดรอบอัตโนมัติตอนเที่ยงคืน — เปิดรอบใหม่เพื่อขาย
        </p>
      </div>
    );
  }

  if (activeShift) {
    const dayLabel = formatOperatingDayLabel(operatingDay);
    return (
      <div
        className={`rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-emerald-950 ${compact ? "py-2" : "py-2.5"}`}
        role="status"
      >
        <p className={`font-semibold ${compact ? "text-xs" : "text-sm"}`}>
          รอบที่ {activeShift.roundNumber}
          {dayLabel ? ` · ${dayLabel}` : ""}
        </p>
        <p className={`mt-0.5 ${compact ? "text-[11px]" : "text-xs"} opacity-90`}>
          เปิด {formatShiftTime(activeShift.openedAt)} น. · ตังทอน{" "}
          {formatPrice(activeShift.openingCash)}฿
        </p>
      </div>
    );
  }

  return null;
}
