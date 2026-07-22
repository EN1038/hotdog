"use client";

import { useEffect, useState } from "react";
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

type DayStats = {
  completedRevenue: number;
  cancelledRevenue: number;
  completedCount: number;
  cancelledCount: number;
  openCount: number;
  totalOrders: number;
};

type OrdersPayload = {
  date: string;
  isToday: boolean;
  operatingDay?: string;
  businessDayCutoffTime?: string;
  lateEntryUntilTime?: string | null;
  dayStats: DayStats;
  orders: AdminOrderRow[];
};

function money(n: number) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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

const STATUS_FILTERS: OrderStatus[] = [
  OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.DELIVERING,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

export function BranchOrdersPanel({ branchId }: { branchId: string }) {
  const [date, setDate] = useState<string>("");
  const [operatingDay, setOperatingDay] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");
  const [data, setData] = useState<OrdersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = date
      ? `?date=${encodeURIComponent(date)}`
      : "";
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
          setData(payload);
          setOperatingDay(payload.operatingDay ?? payload.date);
          if (!date) setDate(payload.date);
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

  const stats = data?.dayStats;
  const filteredOrders = data
    ? statusFilter
      ? data.orders.filter((o) => o.status === statusFilter)
      : data.orders
    : [];
  const maxDate = operatingDay || date;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">ออเดอร์</h3>
          <p className="text-sm text-gray-500">
            สรุปยอดรายวันตามรอบวันธุรกิจ · ยอด = รายการ + ค่าส่ง − ส่วนลด
            {data?.businessDayCutoffTime &&
            data.businessDayCutoffTime !== "00:00"
              ? ` · ตัดรอบ ${data.businessDayCutoffTime} น.`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem]">
            <label className={adminLabelClass} htmlFor="branch-orders-date">
              วันที่ (รอบธุรกิจ)
            </label>
            <DateInput
              id="branch-orders-date"
              className={adminInputClass}
              value={date}
              max={maxDate || undefined}
              onChange={(next) => {
                if (next) setDate(next);
              }}
            />
          </div>
          {date && operatingDay && date !== operatingDay ? (
            <button
              type="button"
              onClick={() => setDate(operatingDay)}
              className="mb-0.5 cursor-pointer text-xs font-semibold text-site-primary underline"
            >
              กลับรอบปัจจุบัน
            </button>
          ) : null}
        </div>
      </div>

      {date ? (
        <p className="text-sm font-medium text-gray-700">
          {formatDateLabel(date)}
          {data?.isToday ? (
            <span className="ml-1.5 text-xs font-normal text-emerald-700">
              (รอบปัจจุบัน)
            </span>
          ) : null}
        </p>
      ) : null}

      {stats ? (
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
      ) : null}

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
                : "ยังไม่มีออเดอร์ในรอบนี้"
          }
        />
      )}
    </div>
  );
}
