"use client";

import { useEffect, useState } from "react";
import { DateInput } from "@/components/DateInput";
import {
  formatMinutesRemainingTh,
  formatOperatingDayLabel,
  formatOperatingRoundWindow,
  getOperatingRoundStatus,
  type BranchOperatingDaySettings,
} from "@/lib/operating-day";

export type StaffRoundSelectorProps = {
  /** Selected operating-round key (YYYY-MM-DD), null until first load */
  viewRound: string | null;
  /** Current live operating round */
  currentRound: string;
  businessDayCutoffTime: string;
  lateEntryUntilTime: string | null;
  isViewingCurrent: boolean;
  onChangeRound: (roundKey: string) => void;
  onGoToCurrent: () => void;
};

export function StaffRoundSelector({
  viewRound,
  currentRound,
  businessDayCutoffTime,
  lateEntryUntilTime,
  isViewingCurrent,
  onChangeRound,
  onGoToCurrent,
}: StaffRoundSelectorProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!isViewingCurrent) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [isViewingCurrent]);

  const branch: BranchOperatingDaySettings = {
    businessDayCutoffTime,
    lateEntryUntilTime,
  };
  const live = getOperatingRoundStatus(branch, now);
  const roundKey = viewRound ?? currentRound;
  const dayLabel = formatOperatingDayLabel(roundKey);
  const windowLabel = formatOperatingRoundWindow(
    roundKey,
    businessDayCutoffTime,
  );
  const remaining = formatMinutesRemainingTh(live.minutesRemaining);

  return (
    <div className="w-[9.75rem] text-right" role="group" aria-label="เลือกรอบทำงาน">
      <label
        htmlFor="staff-round-picker"
        className="text-[10px] font-medium uppercase tracking-wide text-gray-400"
      >
        เลือกรอบ
      </label>
      <DateInput
        id="staff-round-picker"
        value={roundKey}
        max={currentRound || undefined}
        onChange={(next) => {
          if (next) onChangeRound(next);
        }}
        showCalendar={false}
        className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-900"
        aria-label="เลือกรอบ"
      />
      <p className="mt-1 text-[11px] font-semibold leading-snug text-gray-800">
        รอบ {dayLabel}
      </p>
      {windowLabel ? (
        <p className="mt-0.5 text-[10px] leading-snug text-gray-600">
          {windowLabel}
        </p>
      ) : null}
      {isViewingCurrent ? (
        <p
          className={`mt-0.5 text-[10px] leading-snug ${
            live.tone === "locked"
              ? "text-red-700"
              : live.tone === "warn"
                ? "text-amber-800"
                : "text-gray-600"
          }`}
        >
          {live.entryLocked ? (
            <>ปิดรอบคีย์แล้ว · เริ่มใหม่ {live.cutoffTime} น.</>
          ) : (
            <>
              ถึง {live.entryDeadlineHm} น. · {remaining}
            </>
          )}
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-[10px] leading-snug text-gray-600">
            ดูย้อนหลัง
          </p>
          <button
            type="button"
            onClick={onGoToCurrent}
            className="mt-1 cursor-pointer text-[11px] font-semibold text-site-primary underline"
          >
            กลับรอบปัจจุบัน
          </button>
        </>
      )}
    </div>
  );
}
