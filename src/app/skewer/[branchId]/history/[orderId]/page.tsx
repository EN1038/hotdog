"use client";

import { use, useEffect, useMemo, useState } from "react";
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

function formatDateTimeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatBranchLabel(name: string | undefined) {
  if (!name?.trim()) return "";
  const t = name.trim();
  return t.replace(/^สาขา\s*/i, "");
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

  const summary = useMemo(() => {
    if (!order) return null;
    const itemCount = order.items.length;
    const requestedTotal = order.items.reduce(
      (sum, i) => sum + i.requestedQuantity,
      0,
    );
    const confirmedTotal = order.items.reduce(
      (sum, i) => sum + (i.confirmedQuantity ?? 0),
      0,
    );
    return { itemCount, requestedTotal, confirmedTotal };
  }, [order]);

  const brandName = meta.brandName || "";
  const branchLabel = formatBranchLabel(meta.name);

  return (
    <SkewerAppShell branchId={branchId} active="history" meta={meta}>
      <div className="space-y-4 px-4 pb-6 pt-4">
        {loading ? (
          <LoadingState className="border-0 bg-transparent shadow-none" />
        ) : error || !order || !summary ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            {error || "ไม่พบออเดอร์"}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3">
              <div className="border-b border-gray-100 pb-2.5">
                {brandName ? (
                  <p className="text-sm font-extrabold text-gray-900">
                    {brandName}
                  </p>
                ) : null}
                {branchLabel ? (
                  <p className="text-xs font-semibold text-gray-600">
                    สาขา {branchLabel}
                  </p>
                ) : null}
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <p className="min-w-0 text-xs font-bold text-gray-800">
                    #{order.orderNumber} ·{" "}
                    {SKEWER_ORDER_STATUS_LABELS[order.status]}
                  </p>
                  <p className="shrink-0 text-right text-[11px] text-gray-500">
                    {formatDateTimeLabel(
                      order.confirmedAt || order.createdAt,
                    )}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  ต้องการ {formatDateLabel(order.requestedDate)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-3.5 py-3 shadow-sm">
                  <p className="text-[11px] font-bold tracking-wide text-emerald-700/80">
                    จำนวนที่สั่ง
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-emerald-800/70">
                    รวมไม้
                  </p>
                  <div className="mt-2.5 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-500">
                        รวม
                      </span>
                      <span className="text-lg font-black tabular-nums leading-none text-slate-900">
                        {summary.requestedTotal}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-500">
                        รายการ
                      </span>
                      <span className="text-sm font-extrabold tabular-nums text-emerald-700">
                        {summary.itemCount}{" "}
                        <span className="text-[10px] font-bold">ชนิด</span>
                      </span>
                    </div>
                  </div>
                </div>

                {order.status === "CONFIRMED" ? (
                  <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white px-3.5 py-3 shadow-sm">
                    <p className="text-[11px] font-bold tracking-wide text-sky-700/80">
                      จำนวนที่ได้
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-sky-800/70">
                      หลังยืนยัน
                    </p>
                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          รวม
                        </span>
                        <span className="text-lg font-black tabular-nums leading-none text-slate-900">
                          {summary.confirmedTotal}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          ต่างจากสั่ง
                        </span>
                        <span
                          className={`text-sm font-extrabold tabular-nums ${
                            summary.confirmedTotal < summary.requestedTotal
                              ? "text-amber-700"
                              : "text-sky-700"
                          }`}
                        >
                          {summary.confirmedTotal - summary.requestedTotal === 0
                            ? "เท่ากัน"
                            : summary.confirmedTotal - summary.requestedTotal}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : order.status === "CANCELLED" ? (
                  <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white px-3.5 py-3 shadow-sm">
                    <p className="text-[11px] font-bold tracking-wide text-rose-700/80">
                      สถานะ
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-rose-800/70">
                      ยกเลิกแล้ว
                    </p>
                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          รวม
                        </span>
                        <span className="text-lg font-black tabular-nums leading-none text-slate-900">
                          0
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          รายการ
                        </span>
                        <span className="text-sm font-extrabold tabular-nums text-rose-700">
                          {summary.itemCount}{" "}
                          <span className="text-[10px] font-bold">ชนิด</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white px-3.5 py-3 shadow-sm">
                    <p className="text-[11px] font-bold tracking-wide text-amber-700/80">
                      สถานะ
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-amber-800/70">
                      รอยืนยัน
                    </p>
                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          สั่งไว้
                        </span>
                        <span className="text-lg font-black tabular-nums leading-none text-slate-900">
                          {summary.requestedTotal}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          รายการ
                        </span>
                        <span className="text-sm font-extrabold tabular-nums text-amber-700">
                          {summary.itemCount}{" "}
                          <span className="text-[10px] font-bold">ชนิด</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 px-0.5 pt-1">
                <p className="whitespace-pre-wrap text-sm text-gray-700">
                  ที่อยู่: {order.addressText}
                </p>
                {order.note ? (
                  <p className="text-sm text-gray-600">โน้ต: {order.note}</p>
                ) : null}
                {order.status === "PENDING_CONFIRM" ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    รอแอดมินโทรยืนยัน — ไม่ต้องกดยืนยันเพิ่ม
                  </p>
                ) : null}
                {order.status === "CANCELLED" && order.cancelReason ? (
                  <p className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
                    เหตุผลยกเลิก: {order.cancelReason}
                  </p>
                ) : null}
              </div>
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
                        <p className="truncate text-sm font-bold leading-tight text-gray-900">
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
