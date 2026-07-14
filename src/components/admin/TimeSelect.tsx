"use client";

import { normalizeClockTime } from "@/lib/constants";
import { adminInputClass, adminLabelClass } from "@/components/admin/AdminShell";

const HOURS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);

type TimeSelectProps = {
  value: string;
  onChange: (hhmm: string) => void;
  id?: string;
  className?: string;
  /** allow clearing the time */
  allowEmpty?: boolean;
  emptyLabel?: string;
};

function splitTime(value: string): { hour: string; minute: string } | null {
  const normalized = normalizeClockTime(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":");
  return { hour, minute };
}

/** Use stored minute as-is when valid */
function resolveMinute(minute: string): string {
  if (MINUTES.includes(minute)) return minute;
  return "00";
}

export function TimeSelect({
  value,
  onChange,
  id,
  className = "",
  allowEmpty = true,
  emptyLabel = "— ไม่ระบุ —",
}: TimeSelectProps) {
  const parts = splitTime(value);
  const hour = parts?.hour ?? "";
  const minute = parts ? resolveMinute(parts.minute) : "";

  function emit(nextHour: string, nextMinute: string) {
    if (!nextHour || !nextMinute) {
      onChange("");
      return;
    }
    onChange(`${nextHour}:${nextMinute}`);
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <select
        id={id}
        className={`${adminInputClass} max-w-[7rem]`}
        value={hour}
        onChange={(e) => {
          const h = e.target.value;
          if (!h) {
            onChange("");
            return;
          }
          emit(h, minute || "00");
        }}
        aria-label="ชั่วโมง"
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-sm font-semibold text-gray-500">:</span>
      <select
        className={`${adminInputClass} max-w-[7rem]`}
        value={hour ? minute || "00" : ""}
        disabled={!hour}
        onChange={(e) => emit(hour, e.target.value)}
        aria-label="นาที"
      >
        {!hour && <option value="">—</option>}
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TimeSelectField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className={adminLabelClass}>{label}</label>
      <TimeSelect value={value} onChange={onChange} />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {value && (
        <p className="mt-1 text-xs font-medium text-gray-700">
          เลือกแล้ว {value}
        </p>
      )}
    </div>
  );
}
