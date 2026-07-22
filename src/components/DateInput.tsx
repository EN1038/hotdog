"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  /** Show native calendar button (default true) */
  showCalendar?: boolean;
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
  "aria-label": ariaLabel,
}: DateInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const nativeRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => (value ? isoToDmy(value) : ""));

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

  function openNativePicker() {
    const el = nativeRef.current;
    if (!el || disabled) return;
    try {
      el.showPicker();
    } catch {
      el.click();
    }
  }

  return (
    <div className={showCalendar ? "flex w-full items-center gap-1" : "w-full"}>
      <input
        id={inputId}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        className={className}
      />
      {showCalendar ? (
        <>
          <input
            ref={nativeRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            disabled={disabled}
            min={min || undefined}
            max={max || undefined}
            value={isBangkokDateKey(value) ? value : ""}
            onChange={(e) => {
              const next = e.target.value;
              if (next) commit(next);
            }}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
          <button
            type="button"
            disabled={disabled}
            aria-label="เปิดปฏิทิน"
            onClick={openNativePicker}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
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
              aria-hidden
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  );
}
