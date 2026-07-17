"use client";

import { useEffect, useRef } from "react";

export const WHEEL_HOURS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
export const WHEEL_MINUTES_HALF = ["00", "30"] as const;

const ITEM_H = 40;

export function snapWheelHhmm(
  value: string,
  fallback = "09:00",
  minuteOptions: readonly string[] = WHEEL_MINUTES_HALF,
): string {
  const [h, m] = (value || fallback).split(":");
  const hour = WHEEL_HOURS.includes(h!) ? h! : fallback.slice(0, 2);
  const minute = minuteOptions.includes(m ?? "")
    ? (m as string)
    : (minuteOptions[0] ?? "00");
  return `${hour}:${minute}`;
}

function WheelColumn({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ignoreScroll = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, options.indexOf(value));
    ignoreScroll.current = true;
    el.scrollTop = idx * ITEM_H;
    const t = window.setTimeout(() => {
      ignoreScroll.current = false;
    }, 80);
    return () => window.clearTimeout(t);
  }, [value, options]);

  function snapToNearest() {
    const el = ref.current;
    if (!el || ignoreScroll.current) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(options.length - 1, idx));
    el.scrollTop = clamped * ITEM_H;
    const next = options[clamped]!;
    if (next !== value) onChange(next);
  }

  if (options.length === 0) {
    return (
      <div className="flex h-[120px] w-16 shrink-0 items-center justify-center text-sm text-gray-400">
        —
      </div>
    );
  }

  return (
    <div className="relative h-[120px] w-16 shrink-0 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-[40px] z-10 h-10 rounded-lg border-y border-gray-200 bg-orange-50/40"
        aria-hidden
      />
      <div
        ref={ref}
        role="listbox"
        aria-label={ariaLabel}
        className="h-full snap-y snap-mandatory overflow-y-scroll scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ paddingTop: ITEM_H, paddingBottom: ITEM_H }}
        onScroll={() => {
          if (scrollTimer.current) clearTimeout(scrollTimer.current);
          scrollTimer.current = setTimeout(snapToNearest, 80);
        }}
      >
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            role="option"
            aria-selected={opt === value}
            className={`flex h-10 w-full snap-center items-center justify-center text-lg tabular-nums transition-colors ${
              opt === value
                ? "font-bold text-gray-900"
                : "font-medium text-gray-300"
            }`}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WheelTimePicker({
  label,
  value,
  onChange,
  hourOptions = WHEEL_HOURS,
  minuteOptions = [...WHEEL_MINUTES_HALF],
}: {
  label?: string;
  value: string;
  onChange: (hhmm: string) => void;
  hourOptions?: string[];
  minuteOptions?: string[];
}) {
  const [h, m] = (value || "09:00").split(":");
  const hour = hourOptions.includes(h!) ? h! : (hourOptions[0] ?? "09");
  const minute = minuteOptions.includes(m ?? "")
    ? (m as string)
    : (minuteOptions[0] ?? "00");

  return (
    <div>
      {label ? (
        <p className="mb-2 text-sm font-bold text-gray-900">{label}</p>
      ) : null}
      <div className="flex items-center justify-center gap-1 rounded-2xl bg-gray-50 py-2">
        <WheelColumn
          options={hourOptions}
          value={hour}
          ariaLabel={`${label ?? "เวลา"} ชั่วโมง`}
          onChange={(nextH) => onChange(`${nextH}:${minute}`)}
        />
        <span className="pb-0.5 text-xl font-bold text-gray-400">:</span>
        <WheelColumn
          options={minuteOptions}
          value={minute}
          ariaLabel={`${label ?? "เวลา"} นาที`}
          onChange={(nextM) => onChange(`${hour}:${nextM}`)}
        />
      </div>
    </div>
  );
}
