"use client";

import { useEffect, useState } from "react";
import { IconClose, IconShare } from "@/components/icons";

export type ShareExportAction = "share" | "save" | "copy";

type ShareExportMenuProps = {
  busy?: ShareExportAction | null;
  message?: string;
  disabled?: boolean;
  /** Compact round icon only (default). */
  className?: string;
  /** If set, render a labeled button instead of the round icon. */
  label?: string;
  sheetTitle?: string;
  sheetHint?: string;
  onShareImage: () => void | Promise<void>;
  onSaveImage: () => void | Promise<void>;
  onCopyText: () => void | Promise<void>;
};

/** Single share control → sheet to pick share image / save image / copy text. */
export function ShareExportMenu({
  busy = null,
  message = "",
  disabled = false,
  className = "",
  label,
  sheetTitle = "แชร์สรุปยอด",
  sheetHint = "เลือกสิ่งที่ต้องการทำ",
  onShareImage,
  onSaveImage,
  onCopyText,
}: ShareExportMenuProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(action: ShareExportAction) {
    setOpen(false);
    if (action === "share") await onShareImage();
    else if (action === "save") await onSaveImage();
    else await onCopyText();
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || !!busy}
        onClick={() => setOpen(true)}
        className={
          label
            ? className ||
              "relative flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-50 disabled:opacity-50"
            : `relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm active:bg-slate-50 disabled:opacity-50 ${className}`
        }
        aria-label={label || "แชร์สรุปยอด"}
        title={label || "แชร์สรุปยอด"}
      >
        {label ? (
          busy === "save"
            ? "กำลังบันทึก…"
            : busy === "copy"
              ? "กำลังคัดลอก…"
              : busy
                ? "กำลังแชร์…"
                : label
        ) : (
          <>
            <IconShare size={20} />
            {busy ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/80 text-[11px] font-bold text-slate-600">
                …
              </span>
            ) : null}
          </>
        )}
      </button>

      {message && !open ? (
        <p className="sr-only" aria-live="polite">
          {message}
        </p>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="เลือกวิธีแชร์"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-[15px] font-extrabold text-slate-900">
                  {sheetTitle}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  {sheetHint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
                aria-label="ปิด"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="space-y-2 px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void run("share")}
                className="flex w-full items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3.5 text-left text-white active:bg-emerald-700 disabled:opacity-60"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <IconShare size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold">
                    แชร์รูป
                  </span>
                  <span className="mt-0.5 block text-[12px] font-medium text-emerald-100">
                    ส่งเข้าไลน์หรือแอปอื่น
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void run("save")}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left active:bg-slate-50 disabled:opacity-60"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  ↓
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold text-slate-900">
                    บันทึกรูป
                  </span>
                  <span className="mt-0.5 block text-[12px] font-medium text-slate-500">
                    เก็บลงเครื่อง แล้วส่งเองได้
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void run("copy")}
                className="flex w-full items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3.5 text-left active:bg-sky-100 disabled:opacity-60"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-[15px] font-black text-sky-800">
                  Aa
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold text-sky-950">
                    คัดลอกข้อความ
                  </span>
                  <span className="mt-0.5 block text-[12px] font-medium text-sky-800/80">
                    วางในไลน์เป็นข้อความ
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
