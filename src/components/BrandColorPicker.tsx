"use client";

import {
  BRAND_COLOR_PRESETS,
  DEFAULT_BRAND_COLOR,
  normalizePrimaryColor,
} from "@/lib/color";

type Props = {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  /** Extra class for the hex text input */
  inputClassName?: string;
};

/** Color picker + presets for brand theme (default = SkillSale navy). */
export function BrandColorPicker({
  value,
  onChange,
  disabled = false,
  inputClassName = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm",
}: Props) {
  const current = normalizePrimaryColor(value, DEFAULT_BRAND_COLOR);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          value={current}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="เลือกสีแบรนด์"
        />
        <input
          className={`${inputClassName} max-w-[8rem] font-mono text-xs disabled:opacity-60`}
          value={value || current}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={DEFAULT_BRAND_COLOR}
          spellCheck={false}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(DEFAULT_BRAND_COLOR)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-60"
        >
          คืนค่า SkillSale
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {BRAND_COLOR_PRESETS.map((preset) => {
          const selected = current === preset.toLowerCase();
          return (
            <button
              key={preset}
              type="button"
              title={preset}
              disabled={disabled}
              onClick={() => onChange(preset)}
              className={`h-8 w-8 rounded-full border-2 disabled:opacity-60 ${
                selected
                  ? "border-slate-900 ring-2 ring-slate-300"
                  : "border-transparent ring-1 ring-slate-200"
              }`}
              style={{ backgroundColor: preset }}
            />
          );
        })}
      </div>
      <p className="text-xs text-slate-500">
        สีนี้ใช้หัวหน้าพนักงาน / เจ้าของร้าน / ปุ่มหลักของแบรนด์
        (ค่าเริ่มต้นตามโลโก้ SkillSale)
      </p>
    </div>
  );
}
