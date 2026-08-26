import type { OwnerBranchLastClosedShift } from "@/lib/owner-dashboard";
import { formatBangkokShiftDateTime } from "@/lib/shift-display";

type Props = {
  shift: OwnerBranchLastClosedShift | null | undefined;
  compact?: boolean;
};

export function OwnerBranchClosedShiftLine({ shift, compact = false }: Props) {
  const closedLabel = shift?.closedAt
    ? formatBangkokShiftDateTime(shift.closedAt)
    : "";

  return (
    <div
      className={`mt-0.5 font-semibold text-slate-500 ${
        compact ? "text-[10px]" : "text-[11px]"
      }`}
      role="status"
    >
      {closedLabel ? (
        <>
          ปิดขายล่าสุด {closedLabel}
          {shift?.roundNumber != null ? (
            <span className="font-medium text-slate-400">
              {" "}
              · รอบที่ {shift.roundNumber}
            </span>
          ) : null}
        </>
      ) : (
        "ยังไม่เคยเปิดรอบขาย"
      )}
    </div>
  );
}
