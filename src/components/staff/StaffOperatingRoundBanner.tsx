"use client";

import { useEffect, useState } from "react";
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

export function StaffOperatingRoundBanner({
  operatingDay,
  businessDayCutoffTime,
  lateEntryUntilTime,
  compact = false,
}: StaffRoundBannerProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const branch: BranchOperatingDaySettings = {
    businessDayCutoffTime,
    lateEntryUntilTime,
  };
  const status = getOperatingRoundStatus(branch, now);
  // Prefer server operatingDay if still current; recompute from settings for countdown
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
          <>
            ปิดรอบคีย์แล้ว · รอบใหม่เริ่ม {status.cutoffTime} น.
          </>
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
