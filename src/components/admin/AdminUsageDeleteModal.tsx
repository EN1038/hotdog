"use client";

import { useEffect } from "react";
import { IconClose } from "@/components/icons";
import { btnDanger, btnOutline } from "@/components/admin/AdminShell";

type Props = {
  open: boolean;
  title: string;
  description: string;
  items: { id: string; name: string }[];
  emptyLabel?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function AdminUsageDeleteModal({
  open,
  title,
  description,
  items,
  emptyLabel = "ไม่มีเมนูที่ใช้งาน",
  confirmLabel = "ยืนยันลบ",
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
        onClick={() => !busy && onClose()}
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              {description}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="ปิด"
          >
            <IconClose size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              {emptyLabel}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-500 shadow-sm">
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                    {item.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className={btnOutline}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={btnDanger}
          >
            {busy ? "กำลังลบ..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
