"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { bangkokDateKey, isBangkokDateKey } from "@/lib/constants";

type Movement = {
  id: string;
  type: string;
  quantity: number;
  note: string | null;
  createdAt: string;
  menuItem: { id: string; name: string };
  createdByStaff: { id: string; name: string } | null;
  order: { id: string; orderNumber: string } | null;
};

type ShiftOpt = {
  id: string;
  roundNumber: number;
  openedAt: string;
  closedAt: string | null;
};

const TYPE_FILTERS: Array<{ id: string; label: string }> = [
  { id: "ALL", label: "ทั้งหมด" },
  { id: "SALE", label: "ขาย (SALE)" },
  { id: "STOCK_IN", label: "รับเข้า" },
  { id: "ISSUE", label: "จ่ายออก" },
  { id: "ADJUST", label: "ปรับยอด" },
  { id: "DAMAGE", label: "เสียหาย" },
  { id: "LOST", label: "สูญหาย" },
];

function typeLabel(type: string) {
  switch (type) {
    case "SALE":
      return "ขาย";
    case "STOCK_IN":
      return "รับเข้า";
    case "ISSUE":
      return "จ่ายออก";
    case "ADJUST":
      return "ปรับยอด";
    case "DAMAGE":
      return "เสียหาย";
    case "LOST":
      return "สูญหาย";
    default:
      return type;
  }
}

function typeTone(type: string) {
  switch (type) {
    case "SALE":
      return "bg-rose-50 text-rose-800 border-rose-100";
    case "STOCK_IN":
      return "bg-emerald-50 text-emerald-800 border-emerald-100";
    case "ISSUE":
      return "bg-amber-50 text-amber-900 border-amber-100";
    case "ADJUST":
      return "bg-sky-50 text-sky-900 border-sky-100";
    default:
      return "bg-slate-50 text-slate-700 border-slate-100";
  }
}

function formatHm(iso: string) {
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

export function BranchStockMovementsView({ branchId }: { branchId: string }) {
  const toast = useToast();
  const [date, setDate] = useState(() => bangkokDateKey());
  const [type, setType] = useState("ALL");
  const [shiftId, setShiftId] = useState("");
  const [shifts, setShifts] = useState<ShiftOpt[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isBangkokDateKey(date)) return;
      try {
        const res = await fetch(
          `/api/admin/branches/${branchId}/shifts?date=${encodeURIComponent(date)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const list = Array.isArray(data.shifts)
          ? (data.shifts as ShiftOpt[])
          : [];
        setShifts(list);
        setShiftId((prev) =>
          prev && list.some((s) => s.id === prev) ? prev : "",
        );
      } catch {
        if (!cancelled) setShifts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId, date]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ date, type });
      if (shiftId) qs.set("shiftId", shiftId);
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/history?${qs}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("โหลดไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        setMovements([]);
        return;
      }
      setMovements(Array.isArray(data.movements) ? data.movements : []);
    } finally {
      setLoading(false);
    }
  }, [branchId, date, type, shiftId]); // eslint-disable-line react-hooks/exhaustive-deps -- toast stable enough

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <h2 className="text-base font-extrabold text-slate-900">
            เคลื่อนไหวสต็อก
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ดูรับเข้า จ่ายออก ขาย ปรับยอด ตามวัน และกรองตามรอบขายได้
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={adminLabelClass} htmlFor="stock-move-date">
              วันที่
            </label>
            <DateInput
              id="stock-move-date"
              className={adminInputClass}
              value={date}
              max={bangkokDateKey()}
              onChange={(v) => {
                if (v) setDate(v);
              }}
            />
          </div>
          <div>
            <label className={adminLabelClass} htmlFor="stock-move-shift">
              รอบขาย
            </label>
            <select
              id="stock-move-shift"
              className={adminInputClass}
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
            >
              <option value="">ทั้งวัน</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  รอบที่ {s.roundNumber} · {formatHm(s.openedAt)}
                  {s.closedAt ? `–${formatHm(s.closedAt)}` : "–เปิดอยู่"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminLabelClass} htmlFor="stock-move-type">
              ประเภท
            </label>
            <select
              id="stock-move-type"
              className={adminInputClass}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPE_FILTERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <AdminLoadingState className="py-8" />
      ) : movements.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          ไม่พบการเคลื่อนไหวในช่วงที่เลือก
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {movements.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${typeTone(m.type)}`}
                    >
                      {typeLabel(m.type)}
                    </span>
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {m.menuItem.name}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatHm(m.createdAt)} น.
                    {m.createdByStaff
                      ? ` · ${m.createdByStaff.name}`
                      : " · ระบบ/แอดมิน"}
                    {m.note && m.type !== "SALE" ? ` · ${m.note}` : ""}
                  </p>
                  {m.order ? (
                    <p className="mt-1 text-xs">
                      <Link
                        href={`/admin/orders/${m.order.id}`}
                        className="font-medium text-site-primary hover:underline"
                      >
                        ออเดอร์ {m.order.orderNumber || m.order.id.slice(0, 8)}
                      </Link>
                    </p>
                  ) : null}
                </div>
                <p
                  className={`shrink-0 text-base font-extrabold tabular-nums ${
                    m.quantity < 0 ? "text-red-700" : "text-emerald-700"
                  }`}
                >
                  {m.quantity > 0 ? "+" : ""}
                  {m.quantity.toLocaleString("th-TH")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
