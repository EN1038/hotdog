"use client";

import { useRef } from "react";
import { isBangkokDateKey } from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";

export type StaffRoundSelectorProps = {
  /** Selected operating-round key (YYYY-MM-DD), null until first load */
  viewRound: string | null;
  /** Current live operating round */
  currentRound: string;
  isViewingCurrent: boolean;
  onChangeRound: (roundKey: string) => void;
  onGoToCurrent: () => void;
};

export function StaffRoundSelector({
  viewRound,
  currentRound,
  isViewingCurrent,
  onChangeRound,
  onGoToCurrent,
}: StaffRoundSelectorProps) {
  const dateRef = useRef<HTMLInputElement>(null);

  const roundKey = viewRound ?? currentRound;
  const dayLabel = formatOperatingDayLabel(roundKey || currentRound || "");

  function openRoundPicker() {
    const el = dateRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.click();
    }
  }

  return (
    <div className="max-w-[12rem] text-right" role="group" aria-label="เลือกรอบทำงาน">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
        รอบทำงาน
      </p>

      <button
        type="button"
        onClick={openRoundPicker}
        className="mt-1 inline-flex max-w-full cursor-pointer items-center justify-end gap-1.5 rounded-lg border border-site-primary/30 bg-site-primary-soft/60 px-2 py-1.5 text-right shadow-sm transition hover:border-site-primary hover:bg-site-primary-soft active:scale-[0.98]"
        aria-label={`เลือกรอบ — รอบ ${dayLabel || "…"}`}
      >
        <span className="min-w-0 truncate text-[11px] font-bold leading-snug text-site-primary">
          เลือกรอบ {dayLabel || "…"}
        </span>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-site-primary"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      <input
        ref={dateRef}
        type="date"
        value={isBangkokDateKey(roundKey) ? roundKey : ""}
        max={currentRound || undefined}
        onChange={(e) => {
          const next = e.target.value;
          if (next) onChangeRound(next);
        }}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />

      {!isViewingCurrent ? (
        <div className="mt-2.5 space-y-0.5">
          <p className="text-[10px] leading-snug text-gray-600">ดูย้อนหลัง</p>
          <button
            type="button"
            onClick={onGoToCurrent}
            className="mt-1 cursor-pointer text-[11px] font-semibold text-site-primary underline"
          >
            กลับรอบปัจจุบัน
          </button>
        </div>
      ) : null}
    </div>
  );
}
