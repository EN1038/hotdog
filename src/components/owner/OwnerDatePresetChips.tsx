"use client";

import type { ReactNode } from "react";
import { bangkokDateKey } from "@/lib/constants";
import { SalesDateRangeBar } from "@/components/merchant/SalesSummaryView";

export type MobileDatePresetId =
  | "today"
  | "yesterday"
  | "7d"
  | "15d"
  | "month"
  | "lastMonth"
  | "custom";

/** @deprecated use MobileDatePresetId */
export type OwnerDatePresetId = MobileDatePresetId;

export const MOBILE_DATE_PRESETS: Array<{
  id: Exclude<MobileDatePresetId, "custom">;
  label: string;
}> = [
  { id: "today", label: "วันนี้" },
  { id: "yesterday", label: "เมื่อวาน" },
  { id: "7d", label: "7" },
  { id: "15d", label: "15" },
  { id: "month", label: "เดือนนี้" },
  { id: "lastMonth", label: "เดือนที่แล้ว" },
];

/** @deprecated use MOBILE_DATE_PRESETS */
export const OWNER_DATE_PRESETS = MOBILE_DATE_PRESETS;

function shiftDay(key: string, days: number) {
  const d = new Date(`${key}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return bangkokDateKey(d);
}

function monthStartKey(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function lastMonthRange(todayKey: string) {
  const to = shiftDay(monthStartKey(todayKey), -1);
  return { from: monthStartKey(to), to };
}

export function mobileRangeForPreset(
  kind: Exclude<MobileDatePresetId, "custom">,
  todayKey: string,
): { from: string; to: string } {
  if (kind === "today") return { from: todayKey, to: todayKey };
  if (kind === "yesterday") {
    const y = shiftDay(todayKey, -1);
    return { from: y, to: y };
  }
  if (kind === "month") {
    return { from: monthStartKey(todayKey), to: todayKey };
  }
  if (kind === "lastMonth") return lastMonthRange(todayKey);
  const days = Number(kind.replace("d", ""));
  return { from: shiftDay(todayKey, -(days - 1)), to: todayKey };
}

/** @deprecated use mobileRangeForPreset */
export const ownerRangeForPreset = mobileRangeForPreset;

export function matchMobileDatePreset(
  from: string,
  to: string,
  todayKey: string,
): Exclude<MobileDatePresetId, "custom"> | null {
  for (const p of MOBILE_DATE_PRESETS) {
    const range = mobileRangeForPreset(p.id, todayKey);
    if (range.from === from && range.to === to) return p.id;
  }
  return null;
}

/** @deprecated use matchMobileDatePreset */
export const matchOwnerDatePreset = matchMobileDatePreset;

export function formatMobileRangeLabel(from: string, to: string) {
  try {
    const fmt = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
    });
    if (from === to) return fmt.format(new Date(`${from}T12:00:00+07:00`));
    return `${fmt.format(new Date(`${from}T12:00:00+07:00`))}–${fmt.format(
      new Date(`${to}T12:00:00+07:00`),
    )}`;
  } catch {
    return from === to ? from : `${from}–${to}`;
  }
}

export function mobilePresetLabel(
  preset: MobileDatePresetId | null,
  from: string,
  to: string,
): string {
  if (preset && preset !== "custom") {
    return MOBILE_DATE_PRESETS.find((p) => p.id === preset)?.label ?? "ช่วงที่เลือก";
  }
  return formatMobileRangeLabel(from, to);
}

/**
 * ชิปช่วงวันมือถือ + 「กำหนดเอง」แล้วค่อยโชว์ช่องวันที่
 * ใช้ร่วม owner / staff
 */
export function MobileDateRangeControl({
  todayKey,
  from,
  to,
  preset,
  maxDate,
  onChange,
  trailing,
  className = "",
}: {
  todayKey: string;
  from: string;
  to: string;
  preset: MobileDatePresetId | null;
  maxDate?: string;
  onChange: (next: {
    from: string;
    to: string;
    preset: MobileDatePresetId;
  }) => void;
  /** เช่น ไอคอนกรองสาขา วางท้ายแถวชิป */
  trailing?: ReactNode;
  className?: string;
}) {
  const isCustom = preset === "custom" || preset === null;

  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MOBILE_DATE_PRESETS.map((p) => {
            const range = mobileRangeForPreset(p.id, todayKey);
            const active = !isCustom && preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  onChange({ from: range.from, to: range.to, preset: p.id })
                }
                className={`shrink-0 rounded-full px-3 py-2 text-[13px] font-bold ${
                  active
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChange({ from, to, preset: "custom" })}
            className={`shrink-0 rounded-full px-3 py-2 text-[13px] font-bold ${
              isCustom
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            กำหนดเอง
          </button>
        </div>
        {trailing}
      </div>

      {isCustom ? (
        <SalesDateRangeBar
          from={from}
          to={to}
          maxDate={maxDate ?? todayKey}
          onFromChange={(next) => {
            onChange({
              from: next,
              to: next > to ? next : to,
              preset: "custom",
            });
          }}
          onToChange={(next) => {
            onChange({ from, to: next, preset: "custom" });
          }}
        />
      ) : null}
    </div>
  );
}

/** @deprecated use MobileDateRangeControl */
export function OwnerDatePresetChips({
  todayKey,
  from,
  to,
  preset,
  onSelect,
}: {
  todayKey: string;
  from: string;
  to: string;
  preset: MobileDatePresetId | null;
  onSelect: (
    id: MobileDatePresetId,
    range: { from: string; to: string },
  ) => void;
}) {
  return (
    <MobileDateRangeControl
      todayKey={todayKey}
      from={from}
      to={to}
      preset={preset}
      onChange={({ from: f, to: t, preset: p }) => onSelect(p, { from: f, to: t })}
    />
  );
}
