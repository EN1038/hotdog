"use client";

import { useEffect, useId, useState } from "react";
import { IconClose } from "@/components/icons";

type CancelReasonModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function CancelReasonModal({
  open,
  title = "ยกเลิกออเดอร์?",
  description = "กรุณาระบุเหตุผลการยกเลิก — ลูกค้า/ร้านจะเห็นเหตุผลนี้",
  confirmLabel = "ยืนยันยกเลิก",
  busy = false,
  onClose,
  onConfirm,
}: CancelReasonModalProps) {
  const titleId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setError("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  async function submit() {
    const trimmed = reason.trim();
    if (trimmed.length < 2) {
      setError("กรุณากรอกเหตุผลการยกเลิก");
      return;
    }
    setError("");
    await onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 disabled:opacity-50"
            aria-label="ปิด"
          >
            <IconClose size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {description}
        </p>
        <label className="mt-4 block text-sm font-medium text-gray-800">
          เหตุผลการยกเลิก
          <textarea
            className="mt-1.5 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-site-primary focus:outline-none focus:ring-2 focus:ring-site-primary/30"
            rows={3}
            maxLength={200}
            value={reason}
            disabled={busy}
            placeholder="เช่น ลูกค้าขอยกเลิก / ของหมด / ร้านปิดกะทันหัน"
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </label>
        <p className="mt-1 text-right text-[11px] text-gray-400">
          {reason.length}/200
        </p>
        {error ? (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            เก็บไว้
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "กำลังยกเลิก..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
