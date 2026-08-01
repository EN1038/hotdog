"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

type CloseSummary = {
  shift: {
    id: string;
    calendarDate: string;
    roundNumber: number;
    openedAt: string;
    closedAt: string | null;
    openingCash: number;
    note: string | null;
    code: string;
  };
  orderCount: number;
  cancelledOrders: number;
  revenueBaht: number;
  cashRevenueBaht: number;
  transferRevenueBaht: number;
  totalWithOpeningCash: number;
  giftQuantity: number;
  menus: Array<{ name: string; quantity: number; revenueBaht: number }>;
};

type Props = {
  canToggleStore: boolean;
  canSell: boolean;
  activeShift: ActiveShiftInfo | null;
  busy?: boolean;
  onOpened: () => void;
  onClosed: (summaryMessage: string) => void;
  onError: (title: string, detail?: string) => void;
  /** Called before open modal when viewing another round — e.g. jump to current */
  onBeforeOpen?: () => void;
  /** Hide the "เปิดรอบขาย" trigger (e.g. when shown as overlay elsewhere) */
  hideClosedButton?: boolean;
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

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function useShiftElapsed(openedAt: string | null | undefined) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!openedAt) {
      setElapsedMs(0);
      return;
    }
    const start = new Date(openedAt).getTime();
    if (!Number.isFinite(start)) {
      setElapsedMs(0);
      return;
    }
    const tick = () => setElapsedMs(Date.now() - start);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [openedAt]);

  return elapsedMs;
}

function formatShiftDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
    return `${date} เวลา ${formatShiftTime(iso)} น.`;
  } catch {
    return "—";
  }
}

function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-1 py-2 text-sm ${
        last ? "" : "border-b border-gray-100"
      }`}
    >
      <span className="text-gray-600">{label}</span>
      <span className="text-right font-semibold text-gray-900">{value}</span>
    </div>
  );
}

/** Escape header stacking (`overflow` / `backdrop-blur`) so overlays cover the full app. */
function ShiftOverlayPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export function StaffShiftControls({
  canToggleStore,
  canSell,
  activeShift,
  busy = false,
  onOpened,
  onClosed,
  onError,
  onBeforeOpen,
  hideClosedButton = false,
}: Props) {
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState("0");
  const [noteInput, setNoteInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [closeSummary, setCloseSummary] = useState<CloseSummary | null>(null);
  const [closeSummaryLoading, setCloseSummaryLoading] = useState(false);
  const [closeSummaryError, setCloseSummaryError] = useState("");

  function startOpen() {
    window.dispatchEvent(new Event("staff-shift-before-open"));
    onBeforeOpen?.();
    setOpenModal(true);
  }

  function startClose() {
    setCloseModal(true);
  }

  function startDetail() {
    setDetailModal(true);
  }

  const summaryModalOpen = closeModal || detailModal;

  useEffect(() => {
    if (!summaryModalOpen || !activeShift?.id) {
      if (!summaryModalOpen) {
        setCloseSummary(null);
        setCloseSummaryError("");
      }
      return;
    }
    let cancelled = false;
    (async () => {
      setCloseSummaryLoading(true);
      setCloseSummaryError("");
      try {
        const res = await fetch(`/api/staff/shifts/${activeShift.id}/summary`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setCloseSummaryError(data.error ?? "โหลดสรุปไม่สำเร็จ");
          setCloseSummary(null);
          return;
        }
        setCloseSummary((data.summary as CloseSummary) ?? null);
      } catch {
        if (!cancelled) {
          setCloseSummaryError("โหลดสรุปไม่สำเร็จ");
          setCloseSummary(null);
        }
      } finally {
        if (!cancelled) setCloseSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryModalOpen, activeShift?.id]);

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
      const summary = (data.summary as CloseSummary | undefined) ?? closeSummary;
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
      setCloseSummary(null);
      onClosed(msg || "ปิดรอบแล้ว");
    } catch {
      onError("ปิดร้านไม่สำเร็จ", "ลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  const elapsedMs = useShiftElapsed(
    canSell && activeShift ? activeShift.openedAt : null,
  );

  return (
    <>
      {canSell && activeShift ? (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-emerald-950 shadow-sm"
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-sm font-bold text-emerald-950">
                  รอบที่ {activeShift.roundNumber} · เปิดขายอยู่
                </p>
              </div>
              <p className="mt-1 text-xs font-medium text-emerald-700">
                เปิดเวลา {formatShiftTime(activeShift.openedAt)} น. · เงินทอน{" "}
                {formatPrice(activeShift.openingCash)}฿
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold leading-none text-emerald-950">
                เปิดมาแล้ว
              </p>
              <p
                className="mt-1 font-mono text-xs font-bold tabular-nums text-emerald-700"
                aria-live="polite"
              >
                {formatElapsed(elapsedMs)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || submitting}
              onClick={startDetail}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300 bg-white text-emerald-900 shadow-sm hover:bg-emerald-50 disabled:opacity-60 transition active:scale-[0.98]"
              aria-label="ดูรายละเอียดรอบขาย"
              title="ดูรายละเอียดรอบขาย"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="2.75"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
            </button>
            {canToggleStore ? (
              <button
                type="button"
                disabled={busy || submitting}
                onClick={startClose}
                className="min-w-0 flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-60 transition active:scale-[0.98]"
              >
                ปิดรอบขาย
              </button>
            ) : null}
          </div>
        </div>
      ) : canToggleStore ? (
        hideClosedButton ? null : (
          <button
            type="button"
            disabled={busy || submitting}
            onClick={startOpen}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3.5 text-base font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 transition active:scale-[0.98]"
          >
            เปิดรอบขาย
          </button>
        )
      ) : hideClosedButton ? null : (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
          บัญชีนี้เปิดรอบไม่ได้ — ต้องเป็นพนักงานขาย (ตั้งค่าที่แอดมิน)
        </p>
      )}

      <ShiftOverlayPortal>
      {openModal ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 px-0 pb-0 sm:p-4 sm:items-center"
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

      {detailModal ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 px-0 pb-0 sm:p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="รายละเอียดรอบขาย"
          onClick={() => setDetailModal(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-4 py-3 text-center">
              <p className="text-base font-bold text-gray-900">
                รายละเอียดรอบขาย
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                สรุปยอดรอบนี้ — เหมือนข้อมูลตอนปิดรอบ
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {closeSummaryLoading ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  กำลังโหลดสรุปยอด…
                </p>
              ) : closeSummaryError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {closeSummaryError}
                </p>
              ) : closeSummary ? (
                <>
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-1">
                    <Row label="เลขที่รอบ" value={closeSummary.shift.code} />
                    <Row
                      label="เปิดเมื่อ"
                      value={formatShiftDateTime(closeSummary.shift.openedAt)}
                    />
                    <Row
                      label="จำนวนออเดอร์"
                      value={`${closeSummary.orderCount.toLocaleString("th-TH")} ออเดอร์`}
                    />
                    {closeSummary.cancelledOrders > 0 ? (
                      <Row
                        label="ยกเลิก"
                        value={`${closeSummary.cancelledOrders.toLocaleString("th-TH")} ออเดอร์`}
                      />
                    ) : null}
                    <Row
                      label="เงินเริ่มต้น"
                      value={`${formatPrice(closeSummary.shift.openingCash)} บาท`}
                    />
                    {closeSummary.shift.note ? (
                      <Row label="หมายเหตุ" value={closeSummary.shift.note} />
                    ) : null}
                    <Row
                      label="ยอดเงินสด"
                      value={`${formatPrice(closeSummary.cashRevenueBaht)} บาท`}
                    />
                    <Row
                      label="ยอดเงินโอน"
                      value={`${formatPrice(closeSummary.transferRevenueBaht)} บาท`}
                    />
                    <Row
                      label="ยอดขายสุทธิ"
                      value={`${formatPrice(closeSummary.revenueBaht)} บาท`}
                    />
                    <Row
                      label="ยอดรวมเงินเริ่มต้น"
                      value={`${formatPrice(closeSummary.totalWithOpeningCash)} บาท`}
                    />
                    <Row
                      label="จำนวนของแถม"
                      value={`${closeSummary.giftQuantity.toLocaleString("th-TH")} ชิ้น`}
                      last
                    />
                  </div>

                  {closeSummary.menus.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-gray-700">
                        เมนูที่ขาย
                      </p>
                      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                        {closeSummary.menus.slice(0, 12).map((m) => (
                          <li
                            key={m.name}
                            className="flex items-center justify-between gap-3 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">
                                {m.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {m.quantity.toLocaleString("th-TH")} ชิ้น
                              </p>
                            </div>
                            <p className="shrink-0 text-sm font-semibold text-gray-800">
                              {formatPrice(m.revenueBaht)}฿
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : activeShift ? (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs text-gray-600">
                  รอบที่ {activeShift.roundNumber} · ตังทอน{" "}
                  {formatPrice(activeShift.openingCash)}฿
                </p>
              ) : null}
            </div>

            <div className="border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setDetailModal(false)}
                className="w-full rounded-xl bg-site-primary px-3 py-2.5 text-sm font-bold text-white"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {closeModal ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 px-0 pb-0 sm:p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="ยืนยันปิดรอบ"
          onClick={() => !submitting && setCloseModal(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-4 py-3 text-center">
              <p className="text-base font-bold text-gray-900">ยืนยันปิดรอบ?</p>
              <p className="mt-0.5 text-xs text-gray-500">
                ดูสรุปยอดก่อนปิด — หลังปิดแล้วขายต่อไม่ได้จนกว่าจะเปิดรอบใหม่
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {closeSummaryLoading ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  กำลังโหลดสรุปยอด…
                </p>
              ) : closeSummaryError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {closeSummaryError}
                </p>
              ) : closeSummary ? (
                <>
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-1">
                    <Row label="เลขที่รอบ" value={closeSummary.shift.code} />
                    <Row
                      label="เปิดเมื่อ"
                      value={formatShiftDateTime(closeSummary.shift.openedAt)}
                    />
                    <Row
                      label="จำนวนออเดอร์"
                      value={`${closeSummary.orderCount.toLocaleString("th-TH")} ออเดอร์`}
                    />
                    {closeSummary.cancelledOrders > 0 ? (
                      <Row
                        label="ยกเลิก"
                        value={`${closeSummary.cancelledOrders.toLocaleString("th-TH")} ออเดอร์`}
                      />
                    ) : null}
                    <Row
                      label="เงินเริ่มต้น"
                      value={`${formatPrice(closeSummary.shift.openingCash)} บาท`}
                    />
                    {closeSummary.shift.note ? (
                      <Row label="หมายเหตุ" value={closeSummary.shift.note} />
                    ) : null}
                    <Row
                      label="ยอดเงินสด"
                      value={`${formatPrice(closeSummary.cashRevenueBaht)} บาท`}
                    />
                    <Row
                      label="ยอดเงินโอน"
                      value={`${formatPrice(closeSummary.transferRevenueBaht)} บาท`}
                    />
                    <Row
                      label="ยอดขายสุทธิ"
                      value={`${formatPrice(closeSummary.revenueBaht)} บาท`}
                    />
                    <Row
                      label="ยอดรวมเงินเริ่มต้น"
                      value={`${formatPrice(closeSummary.totalWithOpeningCash)} บาท`}
                    />
                    <Row
                      label="จำนวนของแถม"
                      value={`${closeSummary.giftQuantity.toLocaleString("th-TH")} ชิ้น`}
                      last
                    />
                  </div>

                  {closeSummary.menus.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-gray-700">
                        เมนูที่ขาย
                      </p>
                      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                        {closeSummary.menus.slice(0, 12).map((m) => (
                          <li
                            key={m.name}
                            className="flex items-center justify-between gap-3 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">
                                {m.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {m.quantity.toLocaleString("th-TH")} ชิ้น
                              </p>
                            </div>
                            <p className="shrink-0 text-sm font-semibold text-gray-800">
                              {formatPrice(m.revenueBaht)}฿
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : activeShift ? (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs text-gray-600">
                  รอบที่ {activeShift.roundNumber} · ตังทอน{" "}
                  {formatPrice(activeShift.openingCash)}฿
                </p>
              ) : null}

              <p className="text-center text-sm font-semibold text-gray-800">
                ปิดรอบจริงใช่ไหม?
              </p>
            </div>

            <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
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
                disabled={submitting || closeSummaryLoading}
                onClick={() => void submitClose()}
                className="flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {submitting ? "กำลังปิด…" : "ยืนยันปิดรอบ"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </ShiftOverlayPortal>
    </>
  );
}
