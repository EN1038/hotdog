"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
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
        last ? "" : "border-b border-slate-100"
      }`}
    >
      <span className="text-slate-600">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export function BranchShiftsPanel({ branchId }: { branchId: string }) {
  const searchParams = useSearchParams();
  const dateFromUrl = searchParams.get("date")?.trim() ?? "";
  const [date, setDate] = useState(() =>
    isBangkokDateKey(dateFromUrl) ? dateFromUrl : bangkokDateKey(),
  );
  const [shifts, setShifts] = useState<ShiftListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isBangkokDateKey(dateFromUrl)) setDate(dateFromUrl);
  }, [dateFromUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/branches/${branchId}/shifts?date=${encodeURIComponent(date)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "โหลดรอบไม่สำเร็จ");
          setShifts([]);
          setSelectedId(null);
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
  }, [branchId, date]);

  useEffect(() => {
    if (!selectedId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSummary(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/branches/${branchId}/shifts/${selectedId}/summary`,
        );
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
  }, [branchId, selectedId]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              สรุปรอบขาย
            </h3>
            <p className="mt-0.5 text-sm text-slate-600">
              เลือกวันและรอบเพื่อดูยอดขาย เงินเริ่มต้น ของแถม และเมนูที่ขาย
            </p>
          </div>
          <div className="w-full max-w-xs sm:w-44">
            <label className={adminLabelClass} htmlFor="shift-summary-date">
              วันที่
            </label>
            <DateInput
              id="shift-summary-date"
              className={adminInputClass}
              value={date}
              max={bangkokDateKey()}
              onChange={(v) => {
                if (v) setDate(v);
              }}
            />
          </div>
        </div>

        <div className="mt-4">
          {loadingList ? (
            <p className="text-sm text-slate-500">กำลังโหลดรอบ…</p>
          ) : shifts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              ไม่มีรอบในวันที่ {formatOperatingDayLabel(date) || date}
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
                    className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                      selected
                        ? "border-site-primary bg-site-primary-soft font-bold text-site-primary"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
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
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loadingSummary ? (
        <p className="text-sm text-slate-500">กำลังโหลดสรุป…</p>
      ) : summary ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-1 shadow-sm sm:px-4">
            <SummaryRow label="เลขที่รอบ" value={summary.shift.code} />
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

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-bold text-slate-900">เมนูที่ขาย</p>
            {summary.menus.length === 0 ? (
              <p className="text-sm text-slate-500">ยังไม่มีรายการที่นับยอด</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {summary.menus.map((m) => (
                  <li
                    key={m.name}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {m.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {m.quantity.toLocaleString("th-TH")} ชิ้น
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-slate-800">
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
  );
}
