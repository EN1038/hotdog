"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/constants";
import {
  formatMinutesRemainingTh,
  formatOperatingDayLabel,
  getOperatingRoundStatus,
  type BranchOperatingDaySettings,
  type OperatingRoundTone,
} from "@/lib/operating-day";

export type StaffRoundBannerProps = {
  operatingDay: string;
  businessDayCutoffTime: string;
  lateEntryUntilTime: string | null;
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

function toneClasses(tone: OperatingRoundTone) {
  if (tone === "locked") {
    return "border-red-200 bg-red-50 text-red-900";
  }
  if (tone === "warn") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-950";
}

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
  businessDayCutoffTime,
  lateEntryUntilTime,
  compact = false,
  canSell,
  activeShift,
}: StaffRoundBannerProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

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
          ปิดรอบอัตโนมัติตามเวลาตัดรอบ — เปิดรอบใหม่เพื่อขาย
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

  // Legacy operating-day countdown (staff keyed flow on /order pages)
  const branch: BranchOperatingDaySettings = {
    businessDayCutoffTime,
    lateEntryUntilTime,
  };
  const status = getOperatingRoundStatus(branch, now);
  const dayLabel = formatOperatingDayLabel(status.operatingDay || operatingDay);
  const remaining = formatMinutesRemainingTh(status.minutesRemaining);

  return (
    <div
      className={`rounded-xl border px-3 ${compact ? "py-2" : "py-2.5"} ${toneClasses(status.tone)}`}
      role="status"
    >
      <p className={`font-semibold ${compact ? "text-xs" : "text-sm"}`}>
        รอบ {dayLabel}
      </p>
      <p className={`mt-0.5 ${compact ? "text-[11px]" : "text-xs"} opacity-90`}>
        {status.entryLocked ? (
          <>ปิดรอบคีย์แล้ว · รอบใหม่เริ่ม {status.cutoffTime} น.</>
        ) : (
          <>
            คีย์ได้ถึง {status.entryDeadlineHm} น. · {remaining}
            {businessDayCutoffTime !== "00:00" || lateEntryUntilTime
              ? ` · ตัดรอบ ${status.cutoffTime} น.`
              : null}
          </>
        )}
      </p>
    </div>
  );
}
