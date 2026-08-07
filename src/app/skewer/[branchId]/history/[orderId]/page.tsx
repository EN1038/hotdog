"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  SkewerAppShell,
  useSkewerBranchMeta,
} from "@/components/skewer/SkewerAppShell";
import { LoadingState } from "@/components/LoadingState";
import { IconSkewerPlaceholder } from "@/components/icons";
import { SKEWER_ORDER_STATUS_LABELS } from "@/lib/skewer-order";
import type { SkewerOrderStatus } from "@prisma/client";

type OrderDetail = {
  id: string;
  orderNumber: string;
  requestedDate: string;
  addressText: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  status: SkewerOrderStatus;
  adminNote: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
  items: {
    id: string;
    itemName: string;
    requestedQuantity: number;
    confirmedQuantity: number | null;
    imageUrl: string | null;
  }[];
};

type PageProps = {
  params: Promise<{ branchId: string; orderId: string }>;
};

function formatDateLabel(ymd: string) {
  try {
    return new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString("th-TH", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

export default function SkewerHistoryDetailPage({ params }: PageProps) {
  const { branchId, orderId } = use(params);
  const meta = useSkewerBranchMeta(branchId);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/skewer/orders/${encodeURIComponent(orderId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "โหลดออเดอร์ไม่สำเร็จ");
        if (!cancelled) setOrder(data);
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
  }, [orderId]);

  return (
    <SkewerAppShell branchId={branchId} active="history" meta={meta}>
      <div className="space-y-4 px-4 pb-6 pt-4">
        {loading ? (
          <LoadingState className="border-0 bg-transparent shadow-none" />
        ) : error || !order ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            {error || "ไม่พบออเดอร์"}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-500">#{order.orderNumber}</p>
                  <h1 className="mt-1 text-xl font-semibold text-gray-900">
                    {SKEWER_ORDER_STATUS_LABELS[order.status]}
                  </h1>
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-700">
                วันที่ต้องการ:{" "}
                <strong>{formatDateLabel(order.requestedDate)}</strong>
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                ที่อยู่: {order.addressText}
              </p>
              {order.note && (
                <p className="mt-2 text-sm text-gray-600">โน้ต: {order.note}</p>
              )}
              {order.status === "PENDING_CONFIRM" && (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  รอแอดมินโทรยืนยัน — ไม่ต้องกดยืนยันเพิ่ม
                </p>
              )}
              {order.status === "CANCELLED" && order.cancelReason && (
                <p className="mt-3 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
                  เหตุผลยกเลิก: {order.cancelReason}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-3">
              <div className="mb-1 flex items-baseline justify-between gap-2 px-0.5">
                <h2 className="text-sm font-semibold text-gray-900">
                  รายการไม้
                </h2>
                <p className="text-xs text-gray-500">
                  {order.items.length} รายการ
                </p>
              </div>
              <ul className="divide-y divide-gray-100">
                {order.items.map((item, index) => {
                  const confirmed = item.confirmedQuantity;
                  const displayQty =
                    order.status === "CONFIRMED"
                      ? (confirmed ?? 0)
                      : item.requestedQuantity;
                  const less =
                    order.status === "CONFIRMED" &&
                    confirmed != null &&
                    confirmed < item.requestedQuantity;
                  const same =
                    order.status === "CONFIRMED" &&
                    confirmed != null &&
                    confirmed === item.requestedQuantity;
                  return (
                    <li
                      key={item.id}
                      className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">
                        {index + 1}
                      </span>
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-site-primary-soft">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-400">
                            <IconSkewerPlaceholder size={28} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900 leading-tight">
                          {item.itemName}
                        </p>
                        {order.status === "CONFIRMED" ? (
                          <p className="mt-0.5 text-xs text-gray-400">
                            สั่ง {item.requestedQuantity} ไม้
                            {same
                              ? " · ได้เท่าที่สั่ง"
                              : less
                                ? " · น้อยกว่าที่สั่ง"
                                : ""}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-gray-400">ไม้</p>
                        )}
                      </div>
                      <div
                        className={`min-w-[4.5rem] rounded-xl px-3 py-2 text-center ${
                          less
                            ? "bg-amber-50 text-amber-700"
                            : order.status === "CONFIRMED"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-slate-100 text-slate-900"
                        }`}
                      >
                        <p className="text-lg font-black tabular-nums leading-none">
                          {displayQty}
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold opacity-70">
                          {order.status === "CONFIRMED" ? "ได้" : "สั่ง"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {order.status === "CONFIRMED" ? (
              <Link
                href={`/skewer/${branchId}/order?reorder=${order.id}`}
                className="flex w-full items-center justify-center rounded-xl bg-site-primary px-4 py-3.5 text-base font-bold text-white"
              >
                สั่งซ้ำออเดอร์นี้
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </SkewerAppShell>
  );
}
