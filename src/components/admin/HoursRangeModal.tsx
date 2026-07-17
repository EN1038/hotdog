"use client";

import { useEffect, useState } from "react";
import {
  WheelTimePicker,
  snapWheelHhmm,
  WHEEL_MINUTES_HALF,
} from "@/components/WheelTimePicker";

export type HoursRangeDraft = {
  opensAt: string;
  closesAt: string;
  is24Hours: boolean;
};

type HoursRangeModalProps = {
  open: boolean;
  title?: string;
  initial: HoursRangeDraft;
  /** Hide 24h toggle when editing an extra slot */
  show24HoursToggle?: boolean;
  onClose: () => void;
  onConfirm: (draft: HoursRangeDraft) => void;
};

export function HoursRangeModal({
  open,
  title = "ตั้งเวลาเปิด–ปิด",
  initial,
  show24HoursToggle = true,
  onClose,
  onConfirm,
}: HoursRangeModalProps) {
  const [opensAt, setOpensAt] = useState(initial.opensAt);
  const [closesAt, setClosesAt] = useState(initial.closesAt);
  const [is24Hours, setIs24Hours] = useState(initial.is24Hours);

  useEffect(() => {
    if (!open) return;
    setOpensAt(snapWheelHhmm(initial.opensAt, "09:00"));
    setClosesAt(snapWheelHhmm(initial.closesAt, "17:00"));
    setIs24Hours(initial.is24Hours);
  }, [open, initial.opensAt, initial.closesAt, initial.is24Hours]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
      >
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>

        {!is24Hours && (
          <div className="mt-4 space-y-4">
            <WheelTimePicker
              label="เวลาเปิด"
              value={opensAt}
              onChange={setOpensAt}
              minuteOptions={[...WHEEL_MINUTES_HALF]}
            />
            <WheelTimePicker
              label="เวลาปิด"
              value={closesAt}
              onChange={setClosesAt}
              minuteOptions={[...WHEEL_MINUTES_HALF]}
            />
          </div>
        )}

        {is24Hours && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-6 text-center text-sm font-medium text-emerald-800">
            เปิดตลอด 24 ชั่วโมง — ไม่ต้องเลือกช่วงเวลา
          </p>
        )}

        {show24HoursToggle && (
          <label className="mt-5 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-3">
            <span className="text-sm font-medium text-gray-800">
              เปิด 24 ชั่วโมง
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={is24Hours}
              onClick={() => setIs24Hours((v) => !v)}
              className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
                is24Hours ? "bg-orange-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  is24Hours ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                opensAt: snapWheelHhmm(opensAt, "09:00"),
                closesAt: snapWheelHhmm(closesAt, "17:00"),
                is24Hours,
              })
            }
            className="cursor-pointer rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600"
          >
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer importing from `@/components/WheelTimePicker` */
export { WheelTimePicker } from "@/components/WheelTimePicker";
