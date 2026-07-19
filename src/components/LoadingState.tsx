"use client";

import { useEffect, useState } from "react";

type LoadingStateProps = {
  /** Visible label under the spinner */
  label?: string;
  /** Tighter inline row (for tabs / embedded panels) */
  compact?: boolean;
  className?: string;
  /**
   * After this many ms, show a recovery hint + refresh button.
   * Set 0 to disable. Default 10s for full loaders, off for compact.
   */
  recoveryAfterMs?: number;
};

/** ใช้ --site-primary: CMS = สีแพลตฟอร์ม, ฝั่ง order = ธีมแบรนด์ลูกค้า */
export function LoadingState({
  label = "กำลังโหลดข้อมูล",
  compact = false,
  className = "",
  recoveryAfterMs,
}: LoadingStateProps) {
  const timeoutMs =
    recoveryAfterMs ?? (compact ? 0 : 10_000);
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    if (!timeoutMs) return;
    setShowRecovery(false);
    const timer = window.setTimeout(() => setShowRecovery(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [timeoutMs, label]);

  function hardRefresh() {
    window.location.reload();
  }

  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={`flex items-center gap-3 py-3 ${className}`}
      >
        <Spinner />
        <div className="min-w-0 text-left">
          <p className="text-sm font-medium text-slate-600">{label}</p>
          {showRecovery ? (
            <button
              type="button"
              onClick={hardRefresh}
              className="mt-1 text-xs font-semibold text-site-primary underline"
            >
              โหลดใหม่
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-[0_8px_30px_rgba(15,23,42,0.06)] ${className}`}
    >
      <Spinner />

      <div className="mt-5 max-w-[16rem]">
        <p className="text-[15px] font-semibold text-slate-800">{label}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          {showRecovery
            ? "ใช้เวลานานกว่าปกติ อาจมีอัปเดตระบบหรือการเชื่อมต่อช้า"
            : "กรุณารอสักครู่"}
        </p>
      </div>

      {showRecovery ? (
        <button
          type="button"
          onClick={hardRefresh}
          className="mt-5 rounded-xl bg-site-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          โหลดหน้าใหม่
        </button>
      ) : (
        <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden>
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-site-primary/70 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-site-primary/70 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-site-primary/70 [animation-delay:300ms]" />
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center">
      <span
        className="absolute inset-0 rounded-full bg-site-primary-soft/70"
        aria-hidden
      />
      <span
        className="absolute inset-0 animate-spin rounded-full border-[2.5px] border-transparent border-t-site-primary border-r-site-primary/50"
        aria-hidden
      />
      <span
        className="h-2.5 w-2.5 animate-pulse rounded-full bg-site-primary"
        aria-hidden
      />
      <span className="sr-only">กำลังโหลด</span>
    </span>
  );
}
