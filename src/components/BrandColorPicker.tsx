"use client";

import {
  BRAND_COLOR_PRESETS,
  DEFAULT_BRAND_COLOR,
  normalizePrimaryColor,
} from "@/lib/color";

const PRESET_LABELS: Record<string, string> = {
  [DEFAULT_BRAND_COLOR]: "น้ำเงิน",
  "#dc2626": "แดง",
  "#ea580c": "ส้ม",
  "#d97706": "เหลือง",
  "#059669": "เขียว",
  "#0284c7": "ฟ้า",
  "#7c3aed": "ม่วง",
  "#db2777": "ชมพู",
  "#334155": "เทา",
};

type Props = {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  /** @deprecated Hex typing removed — kept for call-site compatibility */
  inputClassName?: string;
  /** false = hide usage hint (caller can place it under a heading) */
  showHint?: boolean;
  /** Compact row of swatches for mobile onboarding */
  compact?: boolean;
};

/** Theme color picker — presets + native picker, no hex typing. */
export function BrandColorPicker({
  value,
  onChange,
  disabled = false,
  showHint = true,
  compact = false,
}: Props) {
  const current = normalizePrimaryColor(value, DEFAULT_BRAND_COLOR);
  const matchesPreset = BRAND_COLOR_PRESETS.some(
    (p) => p.toLowerCase() === current,
  );

  if (compact) {
    // Single full-width row: 9 presets + custom
    return (
      <div className="space-y-2">
        <div className="flex w-full items-center justify-between gap-1">
          {BRAND_COLOR_PRESETS.map((preset) => {
            const hex = preset.toLowerCase();
            const selected = current === hex;
            const label = PRESET_LABELS[hex] ?? PRESET_LABELS[preset] ?? "สี";
            return (
              <button
                key={preset}
                type="button"
                title={label}
                aria-label={label}
                disabled={disabled}
                onClick={() => onChange(preset)}
                className={`aspect-square min-w-0 flex-1 rounded-full transition active:scale-95 disabled:opacity-60 ${
                  selected
                    ? "ring-2 ring-slate-900 ring-offset-1"
                    : "ring-1 ring-black/10"
                }`}
                style={{ backgroundColor: preset }}
              />
            );
          })}
          <label
            title="เลือกสีเอง"
            className={`relative aspect-square min-w-0 flex-1 cursor-pointer overflow-hidden rounded-full border border-dashed border-slate-300 bg-white ${
              disabled ? "pointer-events-none opacity-60" : ""
            } ${!matchesPreset ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}
          >
            <span
              className="absolute inset-[2px] rounded-full"
              style={{
                background: matchesPreset
                  ? "conic-gradient(#dc2626, #ea580c, #eab308, #22c55e, #3b82f6, #a855f7, #dc2626)"
                  : current,
              }}
              aria-hidden
            />
            <input
              type="color"
              value={current}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="เลือกสีเอง"
            />
          </label>
        </div>
        {showHint ? (
          <p className="text-xs text-slate-500">
            สีหลักของร้าน เช่น สีปุ่มและหัวหน้าจอ
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        {BRAND_COLOR_PRESETS.map((preset) => {
          const hex = preset.toLowerCase();
          const selected = current === hex;
          const label = PRESET_LABELS[hex] ?? PRESET_LABELS[preset] ?? "สี";
          return (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset)}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-2.5 transition active:scale-[0.98] disabled:opacity-60 ${
                selected
                  ? "border-slate-900 bg-slate-50 shadow-sm ring-2 ring-slate-200"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span
                className={`h-10 w-10 rounded-full shadow-inner ring-1 ring-black/10 ${
                  selected ? "ring-2 ring-offset-2 ring-slate-900" : ""
                }`}
                style={{ backgroundColor: preset }}
                aria-hidden
              />
              <span
                className={`text-[12px] font-semibold ${
                  selected ? "text-slate-900" : "text-slate-600"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`relative inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-800 shadow-sm active:bg-slate-50 ${
            disabled ? "pointer-events-none opacity-60" : ""
          } ${!matchesPreset ? "ring-2 ring-slate-300" : ""}`}
        >
          <span
            className="h-7 w-7 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: current }}
            aria-hidden
          />
          <span>{matchesPreset ? "เลือกสีเอง" : "สีที่เลือกเอง"}</span>
          <input
            type="color"
            value={current}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="เลือกสีเอง"
          />
        </label>

        {current !== DEFAULT_BRAND_COLOR ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(DEFAULT_BRAND_COLOR)}
            className="min-h-[2.75rem] rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-60"
          >
            กลับเป็นสีน้ำเงิน
          </button>
        ) : null}
      </div>

      {showHint ? (
        <p className="text-xs text-slate-500">
          สีหลักของร้าน เช่น สีปุ่มและหัวหน้าจอ
        </p>
      ) : null}
    </div>
  );
}
