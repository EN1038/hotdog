"use client";

import { useEffect, useId, useState } from "react";
import { isBangkokDateKey } from "@/lib/constants";

/** YYYY-MM-DD → DD/MM/YYYY */
export function isoToDmy(iso: string): string {
  if (!isBangkokDateKey(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** DD/MM/YYYY (or D/M/YYYY) → YYYY-MM-DD, or null if invalid */
export function dmyToIso(dmy: string): string | null {
  const match = dmy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const probe = new Date(`${iso}T12:00:00+07:00`);
  if (Number.isNaN(probe.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(probe);
  if (parts !== iso) return null;
  return iso;
}

function digitsToDmy(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function withinRange(iso: string, min?: string, max?: string): boolean {
  if (min && isBangkokDateKey(min) && iso < min) return false;
  if (max && isBangkokDateKey(max) && iso > max) return false;
  return true;
}

export type DateInputProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (isoYmd: string) => void;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Show calendar icon (default true) */
  showCalendar?: boolean;
  /**
   * Prefer native picker when tapping the field (default true).
   * Uses a full-size transparent `type="date"` overlay — works on iOS/Android
   * where `showPicker()` on a 0×0 hidden input does nothing.
   * Set false to allow free typing DD/MM/YYYY instead.
   */
  openPickerOnClick?: boolean;
  "aria-label"?: string;
};

/**
 * Date field shown as วัน/เดือน/ปี (DD/MM/YYYY).
 * Value in/out is always YYYY-MM-DD (empty string allowed).
 */
export function DateInput({
  id,
  name,
  value,
  onChange,
  min,
  max,
  className = "",
  disabled,
  required,
  placeholder = "วว/ดด/ปปปป",
  showCalendar = true,
  openPickerOnClick = true,
  "aria-label": ariaLabel,
}: DateInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState(() => (value ? isoToDmy(value) : ""));
  const pickerMode = openPickerOnClick !== false;

  useEffect(() => {
    setText(value ? isoToDmy(value) : "");
  }, [value]);

  function commit(iso: string) {
    if (!withinRange(iso, min, max)) {
      setText(value ? isoToDmy(value) : "");
      return;
    }
    onChange(iso);
    setText(isoToDmy(iso));
  }

  function handleTextChange(raw: string) {
    const next = digitsToDmy(raw);
    setText(next);
    if (next.length === 10) {
      const iso = dmyToIso(next);
      if (iso) commit(iso);
    }
  }

  function handleBlur() {
    if (!text.trim()) {
      if (!required) {
        onChange("");
        setText("");
      } else {
        setText(value ? isoToDmy(value) : "");
      }
      return;
    }
    const iso = dmyToIso(text);
    if (iso && withinRange(iso, min, max)) {
      commit(iso);
      return;
    }
    setText(value ? isoToDmy(value) : "");
  }

  const displayClass = [
    className,
    showCalendar ? "pr-9" : "",
    pickerMode ? "cursor-pointer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`relative w-full ${pickerMode && !disabled ? "cursor-pointer" : ""}`}>
      <input
        id={inputId}
        name={name}
        type="text"
        inputMode={pickerMode ? undefined : "numeric"}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        readOnly={pickerMode}
        aria-label={ariaLabel}
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={pickerMode ? undefined : handleBlur}
        tabIndex={pickerMode ? -1 : undefined}
        className={displayClass}
      />

      {/* Full-field native picker — reliable on mobile (iOS/Android) */}
      <input
        type="date"
        tabIndex={pickerMode ? 0 : -1}
        aria-label={ariaLabel ? `${ariaLabel} — เลือกจากปฏิทิน` : "เลือกวันที่จากปฏิทิน"}
        disabled={disabled}
        min={min || undefined}
        max={max || undefined}
        value={isBangkokDateKey(value) ? value : ""}
        onChange={(e) => {
          const next = e.target.value;
          if (next) commit(next);
        }}
        className={
          pickerMode
            ? "absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            : "pointer-events-none absolute h-0 w-0 opacity-0"
        }
        style={pickerMode ? { fontSize: 16 } : undefined}
      />

      {showCalendar ? (
        <span
          className="pointer-events-none absolute top-1/2 right-2 z-10 -translate-y-1/2 text-slate-400"
          aria-hidden
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}
