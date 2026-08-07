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
import {
  SKEWER_ORDER_STATUS_LABELS,
} from "@/lib/skewer-order";
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

type PageProps = { params: Promise<{ branchId: string }> };

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
  const [selectedDate, setSelectedDate] = useState(() => bangkokDateKey());
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState("");

  // Always land on today when opening this page
  useEffect(() => {
    setSelectedDate(bangkokDateKey());
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      branchId,
      date: selectedDate,
    });
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
  }, [branchId, selectedDate]);

  return (
    <SkewerAppShell branchId={branchId} active="history" meta={meta}>
      <div className="space-y-4 px-4 pb-6 pt-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">ประวัติการสั่ง</h1>
          <p className="mt-1 text-sm text-gray-600">
            หลังแอดมินยืนยัน จะเห็นจำนวนไม้ที่ได้ในแต่ละรายการ
          </p>
        </div>

        <div>
          <label
            htmlFor="skewer-history-date"
            className="text-sm font-medium text-gray-800"
          >
            วันที่ต้องการ
          </label>
          <DateInput
            id="skewer-history-date"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            value={selectedDate}
            onChange={(v) => {
              if (v) setSelectedDate(v);
            }}
            required
            openPickerOnClick
            placeholder="เลือกวันที่"
          />
        </div>

        {loading ? (
          <LoadingState className="border-0 bg-transparent shadow-none" />
        ) : error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">
            ไม่มีประวัติวันที่ {formatDateLabel(selectedDate)}
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
