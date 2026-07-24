"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
import {
  OrdersTable,
  type AdminOrderRow,
} from "@/components/admin/OrdersTable";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import {
  isCancelledStatus,
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";

type DayStats = {
  completedRevenue: number;
  cancelledRevenue: number;
  completedCount: number;
  cancelledCount: number;
  openCount: number;
  totalOrders: number;
};

type ShiftListItem = {
  id: string;
  calendarDate: string;
  roundNumber: number;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  note?: string | null;
};

type OrderRow = AdminOrderRow & {
  shiftId?: string | null;
  shift?: {
    id: string;
    roundNumber: number;
    openedAt: string;
    closedAt: string | null;
  } | null;
  awaitingPhotoKey?: boolean;
};

type OrdersPayload = {
  date: string;
  isToday: boolean;
  operatingDay?: string;
  dayStats: DayStats;
  shifts: ShiftListItem[];
  orders: OrderRow[];
};

function money(n: number) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatShiftCodeLabel(calendarDate: string, roundNumber: number) {
  const ymd = calendarDate.slice(0, 10).replace(/-/g, "");
  return `SHIFT-${ymd}-${String(roundNumber).padStart(3, "0")}`;
}

function formatDateLabel(dateYmd: string) {
  try {
    return new Date(`${dateYmd}T12:00:00+07:00`).toLocaleDateString("th-TH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateYmd;
  }
}

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

function computeStats(orders: OrderRow[]): DayStats {
  let completedRevenue = 0;
  let cancelledRevenue = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let openCount = 0;

  for (const order of orders) {
    const total = orderGrandTotal(
      order.items.map((it) => ({
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        optionsPrice: Number(it.optionsPrice ?? 0),
      })),
      Number(order.deliveryFee ?? 0),
      Number(order.discountAmount ?? 0),
    );

    if (
      isOrderCountableRevenue({
        status: order.status,
        awaitingPhotoKey: order.awaitingPhotoKey,
      })
    ) {
      completedRevenue += total;
      completedCount += 1;
    } else if (isCancelledStatus(order.status)) {
      cancelledRevenue += total;
      cancelledCount += 1;
    } else {
      openCount += 1;
    }
  }

  return {
    completedRevenue,
    cancelledRevenue,
    completedCount,
    cancelledCount,
    openCount,
    totalOrders: orders.length,
  };
}

const STATUS_FILTERS: OrderStatus[] = [
  OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.DELIVERING,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

const SHIFT_ALL = "all";
const SHIFT_NONE = "none";

export function BranchOrdersPanel({ branchId }: { branchId: string }) {
  const searchParams = useSearchParams();
  const dateFromUrl = searchParams.get("date")?.trim() ?? "";
  const shiftFromUrl = searchParams.get("shift")?.trim() ?? "";
  const initialDate =
    /^\d{4}-\d{2}-\d{2}$/.test(dateFromUrl) ? dateFromUrl : "";
  const [date, setDate] = useState<string>(initialDate);
  const [operatingDay, setOperatingDay] = useState<string>("");
  const [shiftFilter, setShiftFilter] = useState<string>(
    shiftFromUrl || SHIFT_ALL,
  );
  const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");
  const [data, setData] = useState<OrdersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFromUrl)) {
      setDate(dateFromUrl);
    }
  }, [dateFromUrl]);

  useEffect(() => {
    if (shiftFromUrl) setShiftFilter(shiftFromUrl);
  }, [shiftFromUrl]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    fetch(`/api/admin/branches/${branchId}/orders${qs}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error ?? "โหลดไม่สำเร็จ");
        }
        return body as OrdersPayload;
      })
      .then((payload) => {
        if (!cancelled) {
          setData({
            ...payload,
            shifts: Array.isArray(payload.shifts) ? payload.shifts : [],
          });
          setOperatingDay(payload.operatingDay ?? payload.date);
          if (!date) setDate(payload.date);
          setShiftFilter((prev) => {
            if (prev === SHIFT_ALL || prev === SHIFT_NONE) return prev;
            if (payload.shifts?.some((s) => s.id === prev)) return prev;
            return SHIFT_ALL;
          });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, date]);

  const shifts = data?.shifts ?? [];
  const hasOrphanOrders = Boolean(
    data?.orders.some((o) => !o.shiftId),
  );

  const shiftScopedOrders = useMemo(() => {
    if (!data) return [];
    if (shiftFilter === SHIFT_ALL) return data.orders;
    if (shiftFilter === SHIFT_NONE) {
      return data.orders.filter((o) => !o.shiftId);
    }
    return data.orders.filter((o) => o.shiftId === shiftFilter);
  }, [data, shiftFilter]);

  const stats = useMemo(
    () => computeStats(shiftScopedOrders),
    [shiftScopedOrders],
  );

  const filteredOrders = statusFilter
    ? shiftScopedOrders.filter((o) => o.status === statusFilter)
    : shiftScopedOrders;

  const selectedShift =
    shiftFilter !== SHIFT_ALL && shiftFilter !== SHIFT_NONE
      ? shifts.find((s) => s.id === shiftFilter) ?? null
      : null;

  const maxDate = operatingDay || date;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">ออเดอร์</h3>
          <p className="text-sm text-gray-500">
            เลือกวันแล้วแยกรอบขาย · ยอด = รายการ + ค่าส่ง − ส่วนลด
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem]">
            <label className={adminLabelClass} htmlFor="branch-orders-date">
              วันที่ (วันปฏิทิน)
            </label>
            <DateInput
              id="branch-orders-date"
              className={adminInputClass}
              value={date}
              max={maxDate || undefined}
              onChange={(next) => {
                if (next) {
                  setDate(next);
                  setShiftFilter(SHIFT_ALL);
                }
              }}
            />
          </div>
          {date && operatingDay && date !== operatingDay ? (
            <button
              type="button"
              onClick={() => {
                setDate(operatingDay);
                setShiftFilter(SHIFT_ALL);
              }}
              className="mb-0.5 cursor-pointer text-xs font-semibold text-site-primary underline"
            >
              กลับวันนี้
            </button>
          ) : null}
        </div>
      </div>

      {date ? (
        <p className="text-sm font-medium text-gray-700">
          {formatDateLabel(date)}
          {data?.isToday ? (
            <span className="ml-1.5 text-xs font-normal text-emerald-700">
              (วันนี้)
            </span>
          ) : null}
        </p>
      ) : null}

      {!loading && data ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShiftFilter(SHIFT_ALL)}
            className={`rounded-xl border px-3 py-2 text-left text-xs ${
              shiftFilter === SHIFT_ALL
                ? "border-site-primary bg-site-primary-soft font-bold text-site-primary"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            <span className="block">ทั้งวัน</span>
            <span className="mt-0.5 block opacity-80">
              {data.orders.length.toLocaleString("th-TH")} ออเดอร์
            </span>
          </button>
          {shifts.map((s) => {
            const count = data.orders.filter((o) => o.shiftId === s.id).length;
            const selected = shiftFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setShiftFilter(s.id)}
                className={`rounded-xl border px-3 py-2 text-left text-xs ${
                  selected
                    ? "border-site-primary bg-site-primary-soft font-bold text-site-primary"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <span className="block">
                  รอบที่ {s.roundNumber}
                  {!s.closedAt ? " · เปิดอยู่" : ""}
                </span>
                <span className="mt-0.5 block opacity-80">
                  {formatHm(s.openedAt)}
                  {s.closedAt ? `–${formatHm(s.closedAt)}` : "–…"} · {count}{" "}
                  ออเดอร์
                </span>
              </button>
            );
          })}
          {hasOrphanOrders ? (
            <button
              type="button"
              onClick={() => setShiftFilter(SHIFT_NONE)}
              className={`rounded-xl border px-3 py-2 text-left text-xs ${
                shiftFilter === SHIFT_NONE
                  ? "border-site-primary bg-site-primary-soft font-bold text-site-primary"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              <span className="block">ไม่มีรอบ</span>
              <span className="mt-0.5 block opacity-80">
                {data.orders.filter((o) => !o.shiftId).length} ออเดอร์
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      {selectedShift ? (
        <p className="text-xs text-slate-600">
          {formatShiftCodeLabel(
            selectedShift.calendarDate || date,
            selectedShift.roundNumber,
          )}
          {" · "}
          ตังทอน {money(selectedShift.openingCash)} ฿
          {selectedShift.note ? ` · ${selectedShift.note}` : ""}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <p className="text-xs text-gray-500">ออเดอร์ทั้งหมด</p>
          <p className="text-lg font-semibold text-gray-900">
            {stats.totalOrders.toLocaleString("th-TH")}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
          <p className="text-xs text-emerald-700">รายได้</p>
          <p className="text-lg font-semibold text-emerald-800">
            {money(stats.completedRevenue)} ฿
          </p>
          <p className="text-[11px] text-emerald-600">
            {stats.completedCount.toLocaleString("th-TH")} รายการสำเร็จ
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <p className="text-xs text-gray-500">กำลังดำเนินการ</p>
          <p className="text-lg font-semibold text-amber-700">
            {stats.openCount.toLocaleString("th-TH")}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <p className="text-xs text-gray-500">ยกเลิก</p>
          <p className="text-lg font-semibold text-gray-700">
            {money(stats.cancelledRevenue)} ฿
          </p>
          <p className="text-[11px] text-gray-500">
            {stats.cancelledCount.toLocaleString("th-TH")} รายการ
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            statusFilter === ""
              ? "bg-site-primary text-white"
              : "bg-white text-gray-700 ring-1 ring-gray-200"
          }`}
        >
          ทั้งหมด
        </button>
        {STATUS_FILTERS.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              statusFilter === st
                ? "bg-site-primary text-white"
                : "bg-white text-gray-700 ring-1 ring-gray-200"
            }`}
          >
            {ORDER_STATUS_LABELS[st]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          กำลังโหลดออเดอร์…
        </p>
      ) : error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-8 text-center text-sm text-red-600">
          {error}
        </p>
      ) : (
        <OrdersTable
          orders={filteredOrders}
          emptyText={
            statusFilter === OrderStatus.CANCELLED
              ? "ไม่มีออเดอร์ที่ยกเลิกในรอบนี้"
              : statusFilter
                ? `ไม่มีออเดอร์สถานะ${ORDER_STATUS_LABELS[statusFilter]}ในรอบนี้`
                : shiftFilter === SHIFT_NONE
                  ? "ไม่มีออเดอร์ที่ไม่มีรอบ"
                  : selectedShift
                    ? "ยังไม่มีออเดอร์ในรอบนี้"
                    : "ยังไม่มีออเดอร์ในวันนี้"
          }
        />
      )}
    </div>
  );
}
