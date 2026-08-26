"use client";

import { useEffect, useState } from "react";
import type { OwnerBranchActiveShift } from "@/lib/owner-dashboard";
import {
  formatBangkokShiftTime,
  formatShiftElapsedMs,
  shiftElapsedMs,
} from "@/lib/shift-display";

type Props = {
  shift: OwnerBranchActiveShift;
  compact?: boolean;
};

export function OwnerBranchShiftLine({ shift, compact = false }: Props) {
  const [elapsedMs, setElapsedMs] = useState(() =>
    shiftElapsedMs(shift.openedAt),
  );

  useEffect(() => {
    const tick = () => setElapsedMs(shiftElapsedMs(shift.openedAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [shift.openedAt]);

  const openTime = formatBangkokShiftTime(shift.openedAt);
  const elapsed = formatShiftElapsedMs(elapsedMs);

  return (
    <div
      className={`mt-0.5 font-semibold text-emerald-700 ${
        compact ? "text-[10px]" : "text-[11px]"
      }`}
      role="status"
    >
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
          aria-hidden
        />
        เปิดรอบที่ {shift.roundNumber}
      </span>
      {openTime ? (
        <>
          {" · "}
          เปิด {openTime} น.
        </>
      ) : null}
      {" · "}
      เปิดมา {elapsed}
    </div>
  );
}
