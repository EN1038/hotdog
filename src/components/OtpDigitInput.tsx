"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

export const OTP_DIGIT_LENGTH = 4;

type OtpDigitInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  className?: string;
  digitClassName?: string;
};

const defaultDigitClass =
  "h-16 w-14 sm:h-[4.25rem] sm:w-16 rounded-2xl border-2 border-gray-200 bg-white text-center text-2xl font-bold tabular-nums text-gray-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50";

export function OtpDigitInput({
  value,
  onChange,
  length = OTP_DIGIT_LENGTH,
  disabled = false,
  autoFocus = false,
  id,
  className,
  digitClassName = defaultDigitClass,
}: OtpDigitInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const groupId = useId();
  const sanitized = value.replace(/\D/g, "").slice(0, length);
  const digits = Array.from({ length }, (_, i) => sanitized[i] ?? "");

  const focusIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, length - 1));
      refs.current[clamped]?.focus();
      refs.current[clamped]?.select();
    },
    [length],
  );

  useEffect(() => {
    if (!autoFocus) return;
    focusIndex(Math.min(sanitized.length, length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once when OTP step mounts
  }, []);

  function applyDigits(nextDigits: string[]) {
    onChange(nextDigits.join("").slice(0, length));
  }

  function fillFromString(fromIndex: number, raw: string) {
    const incoming = raw.replace(/\D/g, "");
    if (!incoming) return;
    const merged = digits.slice();
    let cursor = fromIndex;
    for (const ch of incoming) {
      if (cursor >= length) break;
      merged[cursor] = ch;
      cursor += 1;
    }
    applyDigits(merged);
    focusIndex(Math.min(cursor, length - 1));
  }

  function handleChange(index: number, raw: string) {
    const incoming = raw.replace(/\D/g, "");
    if (incoming.length > 1) {
      fillFromString(index, incoming);
      return;
    }
    const merged = digits.slice();
    merged[index] = incoming;
    applyDigits(merged);
    if (incoming && index < length - 1) {
      focusIndex(index + 1);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) return;
      e.preventDefault();
      if (index === 0) return;
      const merged = digits.slice();
      merged[index - 1] = "";
      applyDigits(merged);
      focusIndex(index - 1);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusIndex(index - 1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusIndex(index + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>, index: number) {
    e.preventDefault();
    fillFromString(index, e.clipboardData.getData("text"));
  }

  return (
    <div
      className={className}
      role="group"
      aria-labelledby={id ? `${id}-label` : `${groupId}-label`}
    >
      <div className="flex justify-center gap-3 sm:gap-4">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={index === 0 ? id : undefined}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            enterKeyHint={index === length - 1 ? "done" : "next"}
            maxLength={1}
            value={digit}
            disabled={disabled}
            className={digitClassName}
            aria-label={`หลักที่ ${index + 1} จาก ${length}`}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={(e) => handlePaste(e, index)}
            onFocus={(e) => e.currentTarget.select()}
          />
        ))}
      </div>
    </div>
  );
}
