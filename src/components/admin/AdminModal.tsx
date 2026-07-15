"use client";

import { useEffect, useId } from "react";
import { IconClose } from "@/components/icons";

type AdminModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** disable close while saving */
  busy?: boolean;
  maxWidthClassName?: string;
};

export function AdminModal({
  open,
  title,
  description,
  onClose,
  children,
  busy = false,
  maxWidthClassName = "max-w-3xl",
}: AdminModalProps) {
  const titleId = useId();

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
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[92vh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-5 py-4">
          <div>
            <h3 id={titleId} className="text-base font-semibold text-gray-900">
              {title}
            </h3>
            {description && (
              <p className="mt-0.5 text-sm text-gray-600">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-white/80 disabled:opacity-50"
            aria-label="ปิดหน้าต่าง"
          >
            <IconClose size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
