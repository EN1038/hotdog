import type { ReactNode } from "react";
import {
  STATUS_TONE_BADGE,
  STATUS_TONE_DOT,
  type StatusTone,
} from "@/lib/status-badge";

const SIZE_CLASS = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-[12px]",
  lg: "px-3 py-1.5 text-[13px]",
} as const;

type Props = {
  label: ReactNode;
  tone: StatusTone;
  /** Show colored dot before label (default true). */
  withDot?: boolean;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  title?: string;
};

/** Colored status pill for mobile + desktop — use system-wide. */
export function StatusBadge({
  label,
  tone,
  withDot = true,
  size = "md",
  className = "",
  title,
}: Props) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-bold ring-1 ring-inset ${STATUS_TONE_BADGE[tone]} ${SIZE_CLASS[size]} ${className}`}
    >
      {withDot ? (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_TONE_DOT[tone]} ${
            tone === "warning" || tone === "active" ? "animate-pulse" : ""
          }`}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
