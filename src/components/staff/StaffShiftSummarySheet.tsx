"use client";

import { useEffect, useState } from "react";
import { bangkokDateKey, formatPrice, isBangkokDateKey } from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";

type ShiftListItem = {
  id: string;
  calendarDate: string;
  roundNumber: number;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  note?: string | null;
};

type ShiftSummary = {
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
  totalOrders: number;
  cancelledOrders: number;
  orderCount: number;
  completedOrders: number;
  revenueBaht: number;
  cashRevenueBaht: number;
  transferRevenueBaht: number;
  expectedCash: number;
  totalWithOpeningCash: number;
  giftQuantity: number;
  menus: Array<{ name: string; quantity: number; revenueBaht: number }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialDate?: string | null;
};

function formatHm(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
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
    const time = formatHm(iso);
    return `${date} เวลา ${time} น.`;
  } catch {
    return "—";
  }
}

function SummaryRow({
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
      className={`flex items-baseline justify-between gap-4 px-1 py-2.5 text-sm ${
        last ? "" : "border-b border-gray-200"
      }`}
    >
      <span className="text-gray-600">{label}</span>
      <span className="text-right font-semibold text-gray-900">{value}</span>
    </div>
  );
}

export function StaffShiftSummarySheet({
  open,
  onClose,
  initialDate,
}: Props) {
  const [date, setDate] = useState(
    () =>
      (initialDate && isBangkokDateKey(initialDate)
        ? initialDate
        : bangkokDateKey()),
  );
  const [shifts, setShifts] = useState<ShiftListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const next =
      initialDate && isBangkokDateKey(initialDate)
        ? initialDate
        : bangkokDateKey();
    setDate(next);
    setSelectedId(null);
    setSummary(null);
  }, [open, initialDate]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      setError("");
      try {
        const res = await fetch(
          `/api/staff/shifts?date=${encodeURIComponent(date)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "โหลดรอบไม่สำเร็จ");
          setShifts([]);
          return;
        }
        const list = Array.isArray(data.shifts)
          ? (data.shifts as ShiftListItem[])
          : [];
        setShifts(list);
        setSelectedId((prev) => {
          if (prev && list.some((s) => s.id === prev)) return prev;
          return list.length > 0 ? list[list.length - 1]!.id : null;
        });
      } catch {
        if (!cancelled) setError("โหลดรอบไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, date]);

  useEffect(() => {
    if (!open || !selectedId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSummary(true);
      setError("");
      try {
        const res = await fetch(`/api/staff/shifts/${selectedId}/summary`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "โหลดสรุปไม่สำเร็จ");
          setSummary(null);
          return;
        }
        setSummary((data.summary as ShiftSummary) ?? null);
      } catch {
        if (!cancelled) setError("โหลดสรุปไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="สรุปยอดรอบ"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-base font-bold text-gray-900">สรุปก่อนปิดรอบ</p>
            <p className="text-xs text-gray-500">
              เลือกวันและรอบเพื่อดูยอดขาย
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-50"
          >
            ปิด
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <label className="block text-xs font-medium text-gray-600">
            วันที่
            <input
              type="date"
              value={date}
              max={bangkokDateKey()}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900"
            />
          </label>

          {loadingList ? (
            <p className="text-sm text-gray-500">กำลังโหลดรอบ…</p>
          ) : shifts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
              ไม่มีรอบในวันที่ {formatOperatingDayLabel(date)}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shifts.map((s) => {
                const selected = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs ${
                      selected
                        ? "border-site-primary bg-site-primary-soft font-bold text-site-primary"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    <span className="block">รอบที่ {s.roundNumber}</span>
                    <span className="mt-0.5 block opacity-80">
                      {formatHm(s.openedAt)}
                      {s.closedAt ? `–${formatHm(s.closedAt)}` : "–เปิดอยู่"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {loadingSummary ? (
            <p className="text-sm text-gray-500">กำลังโหลดสรุป…</p>
          ) : summary ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-1">
                <SummaryRow
                  label="เลขที่รอบ"
                  value={summary.shift.code}
                />
                <SummaryRow
                  label="วันที่และเวลาเปิด"
                  value={formatShiftDateTime(summary.shift.openedAt)}
                />
                <SummaryRow
                  label="วันที่และเวลาปิด"
                  value={
                    summary.shift.closedAt
                      ? formatShiftDateTime(summary.shift.closedAt)
                      : "ยังไม่ปิดรอบ"
                  }
                />
                <SummaryRow
                  label="จำนวนออเดอร์"
                  value={`${summary.orderCount.toLocaleString("th-TH")} ออเดอร์`}
                />
                {summary.cancelledOrders > 0 ? (
                  <SummaryRow
                    label="ยกเลิก"
                    value={`${summary.cancelledOrders.toLocaleString("th-TH")} ออเดอร์`}
                  />
                ) : null}
                <SummaryRow
                  label="เงินเริ่มต้น"
                  value={`${formatPrice(summary.shift.openingCash)} บาท`}
                />
                {summary.shift.note ? (
                  <SummaryRow label="หมายเหตุ" value={summary.shift.note} />
                ) : null}
                <SummaryRow
                  label="ยอดเงินสด"
                  value={`${formatPrice(summary.cashRevenueBaht)} บาท`}
                />
                <SummaryRow
                  label="ยอดเงินโอน"
                  value={`${formatPrice(summary.transferRevenueBaht)} บาท`}
                />
                <SummaryRow
                  label="ยอดขายสุทธิ"
                  value={`${formatPrice(summary.revenueBaht)} บาท`}
                />
                <SummaryRow
                  label="ยอดรวมเงินเริ่มต้น"
                  value={`${formatPrice(summary.totalWithOpeningCash)} บาท`}
                />
                <SummaryRow
                  label="จำนวนของแถม"
                  value={`${summary.giftQuantity.toLocaleString("th-TH")} ชิ้น`}
                  last
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-bold text-gray-900">
                  เมนูที่ขาย
                </p>
                {summary.menus.length === 0 ? (
                  <p className="text-sm text-gray-500">ยังไม่มีรายการที่นับยอด</p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {summary.menus.map((m) => (
                      <li
                        key={m.name}
                        className="flex items-center justify-between gap-3 px-3 py-2.5"
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
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
