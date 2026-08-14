"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  formatPrice,
} from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";
import { formatQueueNumber } from "@/lib/order-queue-format";
import { StaffOrderHistoryDetail } from "@/components/staff/StaffOrderHistoryDetail";
import { IconClose, IconSearch } from "@/components/icons";

type ShiftRow = {
  id: string;
  calendarDate: string;
  roundNumber: number;
  openedAt: string;
  closedAt: string | null;
  isCancelled?: boolean;
  cancelledAt?: string | null;
  orderCount: number;
  completedCount: number;
  revenueBaht: number;
};

type HistoryOrderRow = {
  id: string;
  orderNumber: string;
  queueNumber: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customerName: string | null;
  createdAt: string;
  itemCount: number;
  total: number;
  shiftRound?: number | null;
  calendarDate?: string | null;
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "ทุกสถานะ" },
  { value: OrderStatus.WAITING_FOR_STORE_ACCEPTANCE, label: "รอรับ" },
  { value: OrderStatus.PREPARING, label: "กำลังเตรียม" },
  { value: OrderStatus.READY_FOR_PICKUP, label: "พร้อมรับ" },
  { value: OrderStatus.READY_FOR_DELIVERY, label: "รอจัดส่ง" },
  { value: OrderStatus.DELIVERING, label: "กำลังจัดส่ง" },
  { value: OrderStatus.COMPLETED, label: "เสร็จสิ้น" },
  { value: OrderStatus.CANCELLED, label: "ยกเลิก" },
];

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "ทุกการชำระ" },
  { value: PaymentMethod.CASH, label: "เงินสด" },
  { value: PaymentMethod.TRANSFER, label: "โอน" },
];

const selectClass =
  "w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-8 text-[14px] font-bold text-slate-900 outline-none focus:border-site-primary";

function formatHm(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function dateKeyFromShift(s: ShiftRow) {
  return (s.calendarDate ?? "").slice(0, 10);
}

function ShiftRoundListButton({
  shift,
  onSelect,
}: {
  shift: ShiftRow;
  onSelect: () => void;
}) {
  const cancelled = Boolean(shift.isCancelled || shift.cancelledAt);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-4 text-left shadow-sm transition active:scale-[0.99] ${
        cancelled
          ? "border-red-200 bg-gradient-to-r from-red-50 to-white"
          : "border-site-primary/25 bg-gradient-to-r from-orange-50 via-white to-white"
      }`}
    >
      <span
        className={`mt-0.5 flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center ${
          cancelled
            ? "bg-red-100 text-red-700"
            : "bg-site-primary text-white shadow-sm"
        }`}
      >
        <span className="text-[9px] font-bold leading-none opacity-90">รอบ</span>
        <span className="text-lg font-black leading-none tabular-nums">
          {shift.roundNumber}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-slate-500">
          {formatOperatingDayLabel(dateKeyFromShift(shift))}
        </span>
        <span className="mt-0.5 block text-[16px] font-extrabold text-slate-900">
          รอบขายที่ {shift.roundNumber}
          {cancelled ? (
            <span className="ml-1.5 text-sm font-bold text-red-600">ยกเลิก</span>
          ) : null}
        </span>
        <span className="mt-1 block text-[12px] text-slate-500">
          {formatHm(shift.openedAt)}
          {shift.closedAt ? ` – ${formatHm(shift.closedAt)}` : " – เปิดอยู่"}
          {" · "}
          {shift.completedCount}/{shift.orderCount} บิล
        </span>
      </span>
      <span className="shrink-0 pt-1 text-right">
        <span className="block text-[18px] font-black tabular-nums text-site-primary">
          ฿{formatPrice(shift.revenueBaht)}
        </span>
        <span className="text-[12px] font-semibold text-slate-500">ดูบิล ›</span>
      </span>
    </button>
  );
}

function ShiftRoundDetailHeader({ shift }: { shift: ShiftRow }) {
  const cancelled = Boolean(shift.isCancelled || shift.cancelledAt);
  return (
    <div
      className={`overflow-hidden rounded-2xl shadow-md ${
        cancelled
          ? "bg-gradient-to-br from-red-600 to-red-700"
          : "bg-gradient-to-br from-site-primary to-orange-600"
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-4 text-white">
        <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white/20 text-center backdrop-blur-sm">
          <span className="text-[9px] font-bold leading-none opacity-90">รอบ</span>
          <span className="text-xl font-black leading-none tabular-nums">
            {shift.roundNumber}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">
            สรุปรอบขาย
          </p>
          <p className="mt-0.5 text-[17px] font-extrabold leading-snug">
            รอบที่ {shift.roundNumber}
            {cancelled ? " · ยกเลิก" : ""}
          </p>
          <p className="mt-1 text-[12px] font-medium text-white/85">
            {formatOperatingDayLabel(dateKeyFromShift(shift))} ·{" "}
            {formatHm(shift.openedAt)}
            {shift.closedAt ? `–${formatHm(shift.closedAt)}` : "–เปิดอยู่"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[22px] font-black tabular-nums leading-none">
            ฿{formatPrice(shift.revenueBaht)}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-white/80">
            {shift.completedCount} บิลนับยอด
          </p>
        </div>
      </div>
    </div>
  );
}

function OrderBillRow({
  order,
  showShift,
  onOpen,
}: {
  order: HistoryOrderRow;
  showShift?: boolean;
  onOpen: () => void;
}) {
  const day = order.calendarDate?.slice(0, 10);
  const completed = order.status === OrderStatus.COMPLETED;
  const cancelled = order.status === OrderStatus.CANCELLED;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-stretch gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm active:bg-slate-50"
    >
      <span
        className={`w-1 shrink-0 ${
          cancelled
            ? "bg-slate-300"
            : completed
              ? "bg-emerald-500"
              : "bg-amber-400"
        }`}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 items-start justify-between gap-3 px-3.5 py-3">
        <span className="min-w-0">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
              บิล
            </span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
              #{order.orderNumber}
            </span>
            {order.queueNumber != null ? (
              <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-site-primary">
                คิว {formatQueueNumber(order.queueNumber)}
              </span>
            ) : null}
            <span className="text-[11px] font-semibold text-slate-400">
              {formatHm(order.createdAt)}
            </span>
          </span>
          <span className="mt-1.5 block truncate text-[15px] font-extrabold text-slate-900">
            {order.customerName || "ลูกค้าทั่วไป"}
          </span>
          <span className="mt-0.5 block text-[12px] text-slate-500">
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
            {" · "}
            {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
            {" · "}
            {order.itemCount} ชิ้น
            {showShift && order.shiftRound != null
              ? ` · รอบ ${order.shiftRound}${day ? ` ${formatOperatingDayLabel(day)}` : ""}`
              : ""}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end justify-between py-0.5">
          <span className="text-[17px] font-black tabular-nums text-slate-900">
            ฿{formatPrice(order.total)}
          </span>
          <span className="text-[11px] font-bold text-site-primary">ดูบิล ›</span>
        </span>
      </span>
    </button>
  );
}

export function StaffSalesHistoryPanel({
  from,
  to,
  brandName,
  branchName,
}: {
  from: string;
  to: string;
  brandName?: string;
  branchName?: string;
}) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ShiftRow | null>(null);
  const [orders, setOrders] = useState<HistoryOrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftPayment, setDraftPayment] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterTitleId = useId();
  const hasOrderFilters = Boolean(query.trim() || status || payment);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(null);
    setOrders([]);
    const qs = new URLSearchParams({ from, to });
    fetch(`/api/staff/shifts?${qs}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "โหลดรอบไม่สำเร็จ");
        return body as { shifts?: ShiftRow[] };
      })
      .then((body) => {
        if (!cancelled) setShifts(Array.isArray(body.shifts) ? body.shifts : []);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setShifts([]);
          setError(e instanceof Error ? e.message : "โหลดรอบไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  useEffect(() => {
    if (!hasOrderFilters && !selected) {
      setOrders([]);
      setTruncated(false);
      return;
    }
    let cancelled = false;
    setLoadingOrders(true);
    const qs = new URLSearchParams({ from, to });
    if (query.trim()) qs.set("q", query.trim());
    if (status) qs.set("status", status);
    if (payment) qs.set("payment", payment);
    if (selected && !hasOrderFilters) {
      fetch(`/api/staff/shifts/${encodeURIComponent(selected.id)}/orders`)
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? "โหลดออเดอร์ไม่สำเร็จ");
          return body as { orders?: HistoryOrderRow[] };
        })
        .then((body) => {
          if (!cancelled) {
            setOrders(Array.isArray(body.orders) ? body.orders : []);
            setTruncated(false);
          }
        })
        .catch(() => {
          if (!cancelled) setOrders([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingOrders(false);
        });
    } else {
      if (selected) qs.set("shiftId", selected.id);
      fetch(`/api/staff/orders/history?${qs}`)
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? "ค้นหาบิลไม่สำเร็จ");
          return body as { orders?: HistoryOrderRow[]; truncated?: boolean };
        })
        .then((body) => {
          if (!cancelled) {
            setOrders(Array.isArray(body.orders) ? body.orders : []);
            setTruncated(Boolean(body.truncated));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setOrders([]);
            setTruncated(false);
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingOrders(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [from, to, selected, hasOrderFilters, query, status, payment]);

  const filterCount = useMemo(() => {
    let n = 0;
    if (query.trim()) n += 1;
    if (status) n += 1;
    if (payment) n += 1;
    return n;
  }, [query, status, payment]);

  function openFilters() {
    setDraftQuery(query);
    setDraftStatus(status);
    setDraftPayment(payment);
    setFilterOpen(true);
  }

  function applyFilters() {
    setQuery(draftQuery.trim());
    setStatus(draftStatus);
    setPayment(draftPayment);
    setFilterOpen(false);
  }

  function clearFilters() {
    setQuery("");
    setStatus("");
    setPayment("");
    setDraftQuery("");
    setDraftStatus("");
    setDraftPayment("");
    setFilterOpen(false);
  }

  useEffect(() => {
    if (!filterOpen) return;
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 50);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFilterOpen(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  const showSearchResults = hasOrderFilters;
  const showShiftOrders = Boolean(selected) && !hasOrderFilters;

  return (
    <section className="mt-1">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] font-medium text-slate-500">
          {hasOrderFilters
            ? "ผลค้นหาตามตัวกรอง — กดไอคอนเพื่อแก้"
            : "กดรอบเพื่อดูออเดอร์ หรือกดค้นหาเพื่อกรองบิล"}
        </p>
        <button
          type="button"
          onClick={openFilters}
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm ${
            hasOrderFilters
              ? "bg-site-primary text-white"
              : "border border-slate-200 bg-white text-slate-700"
          }`}
          aria-label="ค้นหาบิล"
          title="ค้นหาบิล"
        >
          <IconSearch size={20} />
          {filterCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-site-primary ring-1 ring-site-primary">
              {filterCount}
            </span>
          ) : null}
        </button>
      </div>

      {hasOrderFilters ? (
        <button
          type="button"
          onClick={openFilters}
          className="mt-2 w-full truncate rounded-xl bg-orange-50 px-3 py-2 text-left text-[13px] font-semibold text-site-primary"
        >
          {[
            query.trim() ? `“${query.trim()}”` : null,
            STATUS_OPTIONS.find((o) => o.value === status && o.value)?.label,
            PAYMENT_OPTIONS.find((o) => o.value === payment && o.value)?.label,
          ]
            .filter(Boolean)
            .join(" · ")}
        </button>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {showSearchResults ? (
        <div className="mt-3">
          {selected ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mb-2 text-sm font-semibold text-site-primary"
            >
              ‹ ค้นหาทุกช่วงวันที่ (ไม่จำกัดรอบนี้)
            </button>
          ) : null}
          {loadingOrders ? (
            <p className="py-6 text-center text-sm text-slate-500">
              กำลังค้นหาบิล…
            </p>
          ) : orders.length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
              ไม่พบบิลที่ตรงกับตัวกรอง
            </p>
          ) : (
            <>
              <p className="mb-2 text-[13px] font-semibold text-slate-500">
                พบ {orders.length} บิล
                {truncated ? " (แสดง 200 รายการแรก)" : ""}
              </p>
              <ul className="space-y-2">
                {orders.map((o) => (
                  <li key={o.id}>
                    <OrderBillRow
                      order={o}
                      showShift
                      onOpen={() => setOrderId(o.id)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : showShiftOrders && selected ? (
        <div className="mt-3 space-y-3">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-sm font-semibold text-site-primary"
          >
            ‹ กลับไปรายการรอบ
          </button>

          <ShiftRoundDetailHeader shift={selected} />

          <div className="rounded-2xl border border-slate-200 bg-slate-100/90 p-3 pl-4 ring-1 ring-inset ring-slate-200/60">
            <div className="mb-2.5 flex items-center justify-between border-b border-slate-200/80 pb-2">
              <p className="flex items-center gap-2 text-[13px] font-extrabold text-slate-700">
                <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                  บิล
                </span>
                รายการในรอบนี้
              </p>
              {!loadingOrders && orders.length > 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                  {orders.length} บิล
                </span>
              ) : null}
            </div>

            {loadingOrders ? (
              <p className="py-8 text-center text-sm text-slate-500">
                กำลังโหลดบิล…
              </p>
            ) : orders.length === 0 ? (
              <p className="rounded-xl bg-white px-4 py-8 text-center text-sm text-slate-500">
                ไม่มีบิลในรอบนี้
              </p>
            ) : (
              <ul className="relative space-y-2 pl-3 before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-orange-200">
                {orders.map((o) => (
                  <li key={o.id}>
                    <OrderBillRow order={o} onOpen={() => setOrderId(o.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : loading ? (
        <p className="mt-4 py-6 text-center text-sm text-slate-500">
          กำลังโหลดรอบ…
        </p>
      ) : shifts.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
          ไม่มีรอบขายในช่วงที่เลือก
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {shifts.map((s) => (
            <li key={s.id}>
              <ShiftRoundListButton shift={s} onSelect={() => setSelected(s)} />
            </li>
          ))}
        </ul>
      )}

      {filterOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="ปิด"
            onClick={() => setFilterOpen(false)}
          />
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={filterTitleId}
            onSubmit={(e) => {
              e.preventDefault();
              applyFilters();
            }}
            className="relative z-10 w-full max-w-lg rounded-t-3xl bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-xl sm:mx-4 sm:rounded-3xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id={filterTitleId}
                  className="text-[17px] font-extrabold text-slate-900"
                >
                  ค้นหาบิล
                </h2>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  กรองเลขบิล คิว สถานะ หรือการชำระ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="rounded-full p-1.5 text-slate-500"
                aria-label="ปิด"
              >
                <IconClose size={18} />
              </button>
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                เลขบิล / คิว / ชื่อลูกค้า
              </span>
              <input
                ref={searchInputRef}
                value={draftQuery}
                onChange={(e) => setDraftQuery(e.target.value)}
                placeholder="เช่น A1234, 12, สมชาย"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[15px] font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-site-primary"
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                  สถานะบิล
                </span>
                <div className="relative">
                  <select
                    value={draftStatus}
                    onChange={(e) => setDraftStatus(e.target.value)}
                    className={selectClass}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value || "all"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span
                    className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400"
                    aria-hidden
                  >
                    ▾
                  </span>
                </div>
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                  ชำระเงิน
                </span>
                <div className="relative">
                  <select
                    value={draftPayment}
                    onChange={(e) => setDraftPayment(e.target.value)}
                    className={selectClass}
                  >
                    {PAYMENT_OPTIONS.map((opt) => (
                      <option key={opt.value || "all"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span
                    className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400"
                    aria-hidden
                  >
                    ▾
                  </span>
                </div>
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-12 flex-1 rounded-2xl bg-slate-100 px-4 text-[15px] font-bold text-slate-700"
              >
                ล้าง
              </button>
              <button
                type="submit"
                className="min-h-12 flex-[1.4] rounded-2xl bg-site-primary px-4 text-[15px] font-extrabold text-white"
              >
                ค้นหา
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <StaffOrderHistoryDetail
        open={Boolean(orderId)}
        orderId={orderId}
        onClose={() => setOrderId(null)}
        brandName={brandName}
        branchName={branchName}
      />
    </section>
  );
}
