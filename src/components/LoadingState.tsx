"use client";

type LoadingStateProps = {
  /** Visible label under the spinner */
  label?: string;
  /** Tighter inline row (for tabs / embedded panels) */
  compact?: boolean;
  className?: string;
};

export function LoadingState({
  label = "กำลังโหลดข้อมูล",
  compact = false,
  className = "",
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={
        compact
          ? `flex items-center gap-3 py-3 ${className}`
          : `flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 px-6 py-16 text-center shadow-sm ${className}`
      }
    >
      <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
        <span
          className="absolute inset-0 rounded-full border-2 border-red-100"
          aria-hidden
        />
        <span
          className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-red-600 border-r-red-400/80"
          aria-hidden
        />
        <span
          className="h-2 w-2 animate-pulse rounded-full bg-red-500"
          aria-hidden
        />
      </span>

      <div className={compact ? "text-left" : "mt-4"}>
        <p
          className={
            compact
              ? "text-sm font-medium text-slate-600"
              : "text-sm font-semibold text-slate-700"
          }
        >
          {label}
        </p>
        {!compact ? (
          <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400 [animation-delay:300ms]" />
          </div>
        ) : null}
      </div>

      <span className="sr-only">กำลังโหลด</span>
    </div>
  );
}
