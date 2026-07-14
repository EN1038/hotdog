"use client";

import { useState } from "react";
import {
  DAY_LABELS_TH,
  DAY_ORDER_MON_FIRST,
  copyDayToWeek,
  type WeeklySchedule,
} from "@/lib/branch-hours";
import {
  HoursRangeModal,
  type HoursRangeDraft,
} from "@/components/admin/HoursRangeModal";
import { btnOutline, btnPrimary } from "@/components/admin/AdminShell";

type Props = {
  title: string;
  description?: string;
  value: WeeklySchedule;
  onChange: (next: WeeklySchedule) => void;
  extraActions?: React.ReactNode;
  /** Start expanded (default collapsed to keep settings short) */
  defaultExpanded?: boolean;
};

type EditTarget =
  | { kind: "day24" }
  | { kind: "slot"; index: number }
  | { kind: "newSlot" };

function updateDay(
  schedule: WeeklySchedule,
  dayOfWeek: number,
  patch: Partial<WeeklySchedule[number]>,
): WeeklySchedule {
  return schedule.map((d) =>
    d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d,
  );
}

function slotLabel(opensAt: string, closesAt: string) {
  return `${opensAt} – ${closesAt}`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 text-gray-500 transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BranchHoursEditor({
  title,
  description,
  value,
  onChange,
  extraActions,
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editDow, setEditDow] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const editingDay =
    editDow != null ? value.find((d) => d.dayOfWeek === editDow) : null;

  const openDays = value.filter((d) => d.isOpen).length;

  const modalInitial: HoursRangeDraft = (() => {
    if (!editingDay || !editTarget) {
      return { opensAt: "09:00", closesAt: "17:00", is24Hours: false };
    }
    if (editTarget.kind === "day24" || editingDay.is24Hours) {
      return {
        opensAt: editingDay.slots[0]?.opensAt ?? "09:00",
        closesAt: editingDay.slots[0]?.closesAt ?? "17:00",
        is24Hours: true,
      };
    }
    if (editTarget.kind === "newSlot") {
      return { opensAt: "16:00", closesAt: "21:00", is24Hours: false };
    }
    const slot = editingDay.slots[editTarget.index];
    return {
      opensAt: slot?.opensAt ?? "09:00",
      closesAt: slot?.closesAt ?? "17:00",
      is24Hours: false,
    };
  })();

  function openEditor(dow: number, target: EditTarget) {
    setEditDow(dow);
    setEditTarget(target);
  }

  function closeEditor() {
    setEditDow(null);
    setEditTarget(null);
  }

  function confirmEditor(draft: HoursRangeDraft) {
    if (editDow == null || !editTarget) return;

    if (draft.is24Hours) {
      onChange(
        updateDay(value, editDow, {
          isOpen: true,
          is24Hours: true,
          slots: value.find((d) => d.dayOfWeek === editDow)?.slots.length
            ? value.find((d) => d.dayOfWeek === editDow)!.slots
            : [{ opensAt: draft.opensAt, closesAt: draft.closesAt }],
        }),
      );
      closeEditor();
      return;
    }

    if (editTarget.kind === "newSlot") {
      const day = value.find((d) => d.dayOfWeek === editDow)!;
      onChange(
        updateDay(value, editDow, {
          is24Hours: false,
          slots: [
            ...day.slots,
            { opensAt: draft.opensAt, closesAt: draft.closesAt },
          ],
        }),
      );
    } else if (editTarget.kind === "slot" || editTarget.kind === "day24") {
      const day = value.find((d) => d.dayOfWeek === editDow)!;
      const idx = editTarget.kind === "slot" ? editTarget.index : 0;
      const slots =
        day.slots.length === 0
          ? [{ opensAt: draft.opensAt, closesAt: draft.closesAt }]
          : day.slots.map((s, i) =>
              i === idx
                ? { opensAt: draft.opensAt, closesAt: draft.closesAt }
                : s,
            );
      onChange(
        updateDay(value, editDow, {
          is24Hours: false,
          slots,
        }),
      );
    }
    closeEditor();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-start justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          ) : null}
          {!expanded && (
            <p className="mt-1 text-xs text-gray-400">
              เปิด {openDays}/7 วัน · กดเพื่อแก้ไข
            </p>
          )}
        </div>
        <Chevron open={expanded} />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnOutline}
              onClick={() => onChange(copyDayToWeek(value, 1))}
            >
              คัดลอกจันทร์ → ทั้งสัปดาห์
            </button>
            {extraActions}
          </div>

          <div className="space-y-3">
            {DAY_ORDER_MON_FIRST.map((dow) => {
              const day = value.find((d) => d.dayOfWeek === dow)!;
              return (
                <div
                  key={dow}
                  className="rounded-xl border border-gray-200 bg-gray-50/50 p-3"
                >
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <input
                      type="checkbox"
                      checked={day.isOpen}
                      onChange={(e) =>
                        onChange(
                          updateDay(value, dow, {
                            isOpen: e.target.checked,
                            ...(e.target.checked &&
                            !day.is24Hours &&
                            day.slots.length === 0
                              ? {
                                  slots: [
                                    { opensAt: "10:00", closesAt: "22:00" },
                                  ],
                                }
                              : {}),
                          }),
                        )
                      }
                    />
                    {DAY_LABELS_TH[dow]}
                  </label>

                  {day.isOpen && day.is24Hours && (
                    <button
                      type="button"
                      onClick={() => openEditor(dow, { kind: "day24" })}
                      className="mt-3 flex w-full cursor-pointer items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      <span>เปิด 24 ชั่วโมง</span>
                      <span className="text-xs font-medium text-emerald-700">
                        แตะเพื่อแก้ไข
                      </span>
                    </button>
                  )}

                  {day.isOpen && !day.is24Hours && (
                    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                      {day.slots.map((slot, idx) => (
                        <div key={idx} className="flex items-stretch gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEditor(dow, { kind: "slot", index: idx })
                            }
                            className="flex min-w-0 flex-1 cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-orange-300 hover:bg-orange-50/40"
                          >
                            <span className="text-sm font-semibold tabular-nums text-gray-900">
                              {slotLabel(slot.opensAt, slot.closesAt)}
                            </span>
                            <span className="shrink-0 text-xs text-gray-500">
                              แก้ไขเวลา
                            </span>
                          </button>
                          {day.slots.length > 1 && (
                            <button
                              type="button"
                              className="shrink-0 cursor-pointer rounded-xl px-3 text-sm text-red-600 hover:bg-red-50"
                              onClick={() => {
                                const slots = day.slots.filter(
                                  (_, i) => i !== idx,
                                );
                                onChange(updateDay(value, dow, { slots }));
                              }}
                            >
                              ลบ
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className={`${btnPrimary} w-full text-sm sm:w-auto`}
                        onClick={() => openEditor(dow, { kind: "newSlot" })}
                      >
                        + เพิ่มช่วงเวลา
                      </button>
                    </div>
                  )}

                  {!day.isOpen && (
                    <p className="mt-2 text-xs text-gray-500">ปิดวันนี้</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <HoursRangeModal
        open={editDow != null && editTarget != null}
        title={
          editDow != null
            ? `เวลา${DAY_LABELS_TH[editDow]}`
            : "ตั้งเวลาเปิด–ปิด"
        }
        initial={modalInitial}
        show24HoursToggle={
          editTarget?.kind !== "newSlot" &&
          !(editTarget?.kind === "slot" && (editingDay?.slots.length ?? 0) > 1)
        }
        onClose={closeEditor}
        onConfirm={confirmEditor}
      />
    </div>
  );
}
