"use client";

import type { CookBreakdown } from "@/lib/cook-method";

export const COOK_CHART_COLORS = {
  grill: "#d97706",
  fry: "#dc2626",
} as const;

/** Small stacked proportion bar for list rows (grill | fry). */
export function CookProportionBar({
  byCook,
  className = "",
}: {
  byCook: CookBreakdown | undefined;
  className?: string;
}) {
  if (!byCook) return null;
  const grill = byCook.grill.quantity;
  const fry = byCook.fry.quantity;
  const total = grill + fry;
  if (total <= 0) return null;
  const grillPct = Math.round((grill / total) * 100);
  const fryPct = 100 - grillPct;

  return (
    <div className={`min-w-0 ${className}`}>
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-slate-200"
        title={`ย่าง ${grill.toLocaleString("th-TH")} · ทอด ${fry.toLocaleString("th-TH")}`}
        aria-label={`สัดส่วนย่าง ${grillPct}% ทอด ${fryPct}%`}
      >
        {grillPct > 0 ? (
          <span
            className="h-full"
            style={{
              width: `${grillPct}%`,
              backgroundColor: COOK_CHART_COLORS.grill,
            }}
          />
        ) : null}
        {fryPct > 0 ? (
          <span
            className="h-full"
            style={{
              width: `${fryPct}%`,
              backgroundColor: COOK_CHART_COLORS.fry,
            }}
          />
        ) : null}
      </div>
      <p className="mt-0.5 flex justify-between gap-2 text-[10px] font-semibold tabular-nums text-slate-500">
        <span style={{ color: COOK_CHART_COLORS.grill }}>
          ย่าง {grillPct}%
        </span>
        <span style={{ color: COOK_CHART_COLORS.fry }}>ทอด {fryPct}%</span>
      </p>
    </div>
  );
}
