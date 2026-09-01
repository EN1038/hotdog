"use client";

import { useState, type RefObject } from "react";
import { IconQrScan } from "@/components/icons";
import { StaffQrCameraScanner } from "@/components/staff/StaffQrCameraScanner";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  busy?: boolean;
  placeholder?: string;
  hint?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  scannerTitle?: string;
};

export function StaffMenuScanField({
  label,
  value,
  onChange,
  onSubmit,
  busy = false,
  placeholder = "กรอกรหัสสินค้า หรือแตะไอคอนเพื่อสแกน QR",
  hint,
  inputRef,
  autoFocus,
  scannerTitle,
}: Props) {
  const [scannerOpen, setScannerOpen] = useState(false);

  function submitCurrent() {
    onSubmit(value);
  }

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-[12px] font-semibold text-slate-600">
          {label}
        </span>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            disabled={busy}
            className="flex w-12 shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50 text-teal-700 transition hover:bg-teal-50 active:bg-teal-100 disabled:opacity-50"
            aria-label="เปิดกล้องสแกน QR"
          >
            <IconQrScan size={22} aria-hidden />
          </button>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitCurrent();
              }
            }}
            placeholder={placeholder}
            disabled={busy}
            autoFocus={autoFocus}
            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[15px] font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 disabled:opacity-60"
            autoComplete="off"
            inputMode="text"
          />
        </div>
      </label>

      {hint ? (
        <p className="mt-1.5 text-[11px] font-medium text-slate-500">{hint}</p>
      ) : null}

      <StaffQrCameraScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(scanned) => {
          setScannerOpen(false);
          onChange(scanned);
          onSubmit(scanned);
        }}
        title={scannerTitle ?? label}
      />
    </>
  );
}
