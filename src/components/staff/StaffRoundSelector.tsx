"use client";

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
  /** โหมดสั้น — ใช้ในหัวหน้าออเดอร์ */
  compact?: boolean;
};

export function StaffRoundSelector({
  viewRound,
  currentRound,
  isViewingCurrent,
  onChangeRound,
  onGoToCurrent,
  compact = false,
}: StaffRoundSelectorProps) {
  const roundKey = viewRound ?? currentRound;
  const dayLabel = formatOperatingDayLabel(roundKey || currentRound || "");

  return (
    <div
      className={compact ? "text-right" : "max-w-[12rem] text-right"}
      role="group"
      aria-label="เลือกรอบทำงาน"
    >
      {!compact ? (
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
          รอบทำงาน
        </p>
      ) : null}

      <div
        className={`relative inline-flex max-w-full ${compact ? "" : "mt-1"}`}
      >
        <div
          className={`inline-flex max-w-full items-center justify-end gap-1.5 rounded-lg border border-site-primary/30 bg-site-primary-soft/60 text-right shadow-sm ${
            compact ? "px-2.5 py-2" : "px-2 py-1.5"
          }`}
          aria-hidden
        >
          <span
            className={`min-w-0 truncate font-bold leading-snug text-site-primary ${
              compact ? "text-[12px]" : "text-[11px]"
            }`}
          >
            {compact ? dayLabel || "…" : `เลือกรอบ ${dayLabel || "…"}`}
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
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </div>
        <input
          type="date"
          value={isBangkokDateKey(roundKey) ? roundKey : ""}
          max={currentRound || undefined}
          aria-label={`เลือกรอบ — รอบ ${dayLabel || "…"}`}
          onChange={(e) => {
            const next = e.target.value;
            if (next) onChangeRound(next);
          }}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          style={{ fontSize: 16 }}
        />
      </div>

      {!isViewingCurrent ? (
        <button
          type="button"
          onClick={onGoToCurrent}
          className="mt-1 text-[10px] font-semibold text-site-primary underline-offset-2 hover:underline"
        >
          กลับรอบปัจจุบัน
        </button>
      ) : null}
    </div>
  );
}
