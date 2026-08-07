"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SkewerAppShell,
  useSkewerBranchMeta,
} from "@/components/skewer/SkewerAppShell";
import { DateInput } from "@/components/DateInput";
import { LoadingState } from "@/components/LoadingState";
import { bangkokDateKey } from "@/lib/constants";
import { addDaysToDateKey } from "@/lib/operating-day";
import { SKEWER_ORDER_STATUS_LABELS } from "@/lib/skewer-order";
import type { SkewerOrderStatus } from "@prisma/client";

type OrderRow = {
  id: string;
  orderNumber: string;
  requestedDate: string;
  status: SkewerOrderStatus;
  addressText: string;
  items: {
    itemName: string;
    requestedQuantity: number;
    confirmedQuantity: number | null;
  }[];
  createdAt: string;
};

type StatusFilter = SkewerOrderStatus | "ALL";

type PageProps = { params: Promise<{ branchId: string }> };

function defaultDateRange() {
  const today = bangkokDateKey();
  return {
    from: addDaysToDateKey(today, -3),
    to: addDaysToDateKey(today, 3),
  };
}

function formatDateLabel(ymd: string) {
  try {
    return new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

function statusClass(status: SkewerOrderStatus) {
  if (status === "PENDING_CONFIRM") return "bg-amber-100 text-amber-900";
  if (status === "CONFIRMED") return "bg-emerald-100 text-emerald-900";
  return "bg-gray-100 text-gray-600";
}

export default function SkewerHistoryPage({ params }: PageProps) {
  const { branchId } = use(params);
  const pathname = usePathname();
  const meta = useSkewerBranchMeta(branchId);
  const [dateFrom, setDateFrom] = useState(() => defaultDateRange().from);
  const [dateTo, setDateTo] = useState(() => defaultDateRange().to);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState("");

  // Reset to default window (±3 days) whenever opening this page
  useEffect(() => {
    const range = defaultDateRange();
    setDateFrom(range.from);
    setDateTo(range.to);
    setStatusFilter("ALL");
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      branchId,
      dateFrom,
      dateTo,
    });
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    fetch(`/api/skewer/orders?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "โหลดประวัติไม่สำเร็จ");
        if (!cancelled) setOrders(Array.isArray(data) ? data : []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, dateFrom, dateTo, statusFilter]);

  return (
    <SkewerAppShell branchId={branchId} active="history" meta={meta}>
      <div className="space-y-4 px-4 pb-6 pt-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">ประวัติการสั่ง</h1>
          <p className="mt-1 text-sm text-gray-600">
            หลังแอดมินยืนยัน จะเห็นจำนวนไม้ที่ได้ในแต่ละรายการ
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="skewer-history-from"
                className="text-sm font-medium text-gray-800"
              >
                วันที่เริ่ม
              </label>
              <DateInput
                id="skewer-history-from"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                value={dateFrom}
                onChange={(v) => {
                  if (!v) return;
                  setDateFrom(v);
                  if (v > dateTo) setDateTo(v);
                }}
                max={dateTo}
                required
                openPickerOnClick
                placeholder="เริ่ม"
              />
            </div>
            <div>
              <label
                htmlFor="skewer-history-to"
                className="text-sm font-medium text-gray-800"
              >
                วันที่สิ้นสุด
              </label>
              <DateInput
                id="skewer-history-to"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                value={dateTo}
                onChange={(v) => {
                  if (!v) return;
                  setDateTo(v);
                  if (v < dateFrom) setDateFrom(v);
                }}
                min={dateFrom}
                required
                openPickerOnClick
                placeholder="สิ้นสุด"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="skewer-history-status"
              className="text-sm font-medium text-gray-800"
            >
              สถานะ
            </label>
            <select
              id="skewer-history-status"
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as StatusFilter)
              }
            >
              <option value="ALL">ทั้งหมด</option>
              <option value="PENDING_CONFIRM">
                {SKEWER_ORDER_STATUS_LABELS.PENDING_CONFIRM}
              </option>
              <option value="CONFIRMED">
                {SKEWER_ORDER_STATUS_LABELS.CONFIRMED}
              </option>
              <option value="CANCELLED">
                {SKEWER_ORDER_STATUS_LABELS.CANCELLED}
              </option>
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingState className="border-0 bg-transparent shadow-none" />
        ) : error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">
            ไม่มีประวัติ {formatDateLabel(dateFrom)} –{" "}
            {formatDateLabel(dateTo)}
            {statusFilter !== "ALL"
              ? ` · ${SKEWER_ORDER_STATUS_LABELS[statusFilter]}`
              : ""}
          </p>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li
                key={order.id}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <Link
                  href={`/skewer/${branchId}/history/${order.id}`}
                  className="block"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">
                        #{order.orderNumber}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-600">
                        ต้องการ {formatDateLabel(order.requestedDate)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(order.status)}`}
                    >
                      {SKEWER_ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-1 text-xs text-gray-500">
                    {order.items
                      .map((i) => {
                        if (order.status === "CONFIRMED") {
                          return `${i.itemName} ×${i.confirmedQuantity ?? i.requestedQuantity}`;
                        }
                        return `${i.itemName} ×${i.requestedQuantity}`;
                      })
                      .join(" · ")}
                  </p>
                </Link>
                {order.status === "CONFIRMED" ? (
                  <Link
                    href={`/skewer/${branchId}/order?reorder=${order.id}`}
                    className="mt-3 flex w-full items-center justify-center rounded-xl bg-site-primary px-3 py-2.5 text-sm font-bold text-white"
                  >
                    สั่งซ้ำ
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SkewerAppShell>
  );
}
