"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/constants";

export type ActiveShiftInfo = {
  id: string;
  calendarDate: string;
  roundNumber: number;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  note?: string | null;
};

type Props = {
  canToggleStore: boolean;
  canSell: boolean;
  activeShift: ActiveShiftInfo | null;
  busy?: boolean;
  /** When viewing a past/other operating day — still allow open (opens current day) */
  viewingOtherRound?: boolean;
  onOpened: () => void;
  onClosed: (summaryMessage: string) => void;
  onError: (title: string, detail?: string) => void;
  /** Called before open modal when viewing another round — e.g. jump to current */
  onBeforeOpen?: () => void;
};

function formatShiftTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function StaffShiftControls({
  canToggleStore,
  canSell,
  activeShift,
  busy = false,
  viewingOtherRound = false,
  onOpened,
  onClosed,
  onError,
  onBeforeOpen,
}: Props) {
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState("0");
  const [noteInput, setNoteInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function startOpen() {
    onBeforeOpen?.();
    setOpenModal(true);
  }

  async function submitOpen() {
    const openingCash = Number(openingCashInput.replace(/,/g, ""));
    if (!Number.isFinite(openingCash) || openingCash < 0) {
      onError("ตังทอนไม่ถูกต้อง", "กรุณากรอกจำนวนเงิน ≥ 0");
      return;
    }
    setSubmitting(true);
    try {
      const note = noteInput.trim();
      const res = await fetch("/api/staff/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openingCash,
          note: note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError("เปิดร้านไม่สำเร็จ", data.error ?? "ลองใหม่");
        return;
      }
      setOpenModal(false);
      setOpeningCashInput("0");
      setNoteInput("");
      onOpened();
    } catch {
      onError("เปิดร้านไม่สำเร็จ", "ลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitClose() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/staff/shifts/current/close", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError("ปิดร้านไม่สำเร็จ", data.error ?? "ลองใหม่");
        return;
      }
      const summary = data.summary as
        | {
            revenueBaht?: number;
            totalWithOpeningCash?: number;
            giftQuantity?: number;
            orderCount?: number;
            shift?: { roundNumber?: number; code?: string };
          }
        | undefined;
      const code = summary?.shift?.code;
      const msg = [
        code ??
          (summary?.shift?.roundNumber != null
            ? `รอบที่ ${summary.shift.roundNumber}`
            : null),
        summary?.revenueBaht != null
          ? `ยอดขาย ${formatPrice(summary.revenueBaht)}฿`
          : null,
        summary?.giftQuantity != null && summary.giftQuantity > 0
          ? `ของแถม ${summary.giftQuantity} ชิ้น`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      setCloseModal(false);
      onClosed(msg || "ปิดรอบแล้ว");
    } catch {
      onError("ปิดร้านไม่สำเร็จ", "ลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        className={`rounded-xl border px-3 py-2.5 ${
          canSell
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-red-200 bg-red-50 text-red-900"
        }`}
        role="status"
      >
        {canSell && activeShift ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                รอบที่ {activeShift.roundNumber} · เปิดอยู่
              </p>
              <p className="mt-0.5 text-xs opacity-90">
                เปิด {formatShiftTime(activeShift.openedAt)} น. · ตังทอน{" "}
                {formatPrice(activeShift.openingCash)}฿
              </p>
            </div>
            {canToggleStore ? (
              <button
                type="button"
                disabled={busy || submitting}
                onClick={() => setCloseModal(true)}
                className="shrink-0 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                ปิดร้าน
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2.5">
            <div>
              <p className="text-sm font-semibold">ร้านปิด — ยังไม่เปิดรอบ</p>
              <p className="mt-0.5 text-xs opacity-90">
                {viewingOtherRound
                  ? "กำลังดูรอบอื่นอยู่ — กดเปิดรอบเพื่อเริ่มขายรอบปัจจุบัน หรือกดกลับรอบปัจจุบันก่อน"
                  : "ถึงตัดรอบระบบจะปิดให้อัตโนมัติ"}
              </p>
            </div>
            {canToggleStore ? (
              <button
                type="button"
                disabled={busy || submitting}
                onClick={startOpen}
                className="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                เปิดรอบขาย
              </button>
            ) : (
              <p className="rounded-lg bg-white/70 px-3 py-2 text-xs font-medium text-red-800">
                บัญชีนี้เปิดรอบไม่ได้ — ต้องเป็นพนักงานขาย (ตั้งค่าที่แอดมิน)
              </p>
            )}
          </div>
        )}
      </div>

      {openModal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="เปิดร้าน"
          onClick={() => !submitting && setOpenModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-base font-bold text-gray-900">
              เปิดรอบขาย
            </p>
            <p className="mt-1 text-center text-xs text-gray-500">
              กรอกตังทอนเริ่มรอบ เพื่อใช้คำนวณเงินสดตอนปิดรอบ
            </p>
            <label className="mt-4 block text-xs font-medium text-gray-600">
              ตังทอน (บาท)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                value={openingCashInput}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base font-semibold text-gray-900 outline-none focus:border-site-primary"
                autoFocus
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-gray-600">
              หมายเหตุ
              <span className="ml-1 font-normal text-gray-400">(ไม่บังคับ)</span>
              <input
                type="text"
                maxLength={500}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="เช่น เงินทอนสำหรับเปิดร้าน"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-site-primary"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setOpenModal(false)}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-600"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitOpen()}
                className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? "กำลังเปิด…" : "เปิดร้าน"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {closeModal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="ปิดร้าน"
          onClick={() => !submitting && setCloseModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-base font-bold text-gray-900">
              ปิดรอบขาย?
            </p>
            <p className="mt-1 text-center text-xs text-gray-500">
              หลังปิดแล้วลูกค้าและพนักงานจะขายต่อไม่ได้จนกว่าจะเปิดรอบใหม่
            </p>
            {activeShift ? (
              <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-center text-xs text-gray-600">
                รอบที่ {activeShift.roundNumber} · ตังทอน{" "}
                {formatPrice(activeShift.openingCash)}฿
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setCloseModal(false)}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-600"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitClose()}
                className="flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {submitting ? "กำลังปิด…" : "ปิดร้าน"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
