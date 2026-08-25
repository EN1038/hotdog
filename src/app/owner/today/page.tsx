"use client";

import { useEffect, useState } from "react";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SALES_CHANNEL_LABELS,
  formatPrice,
} from "@/lib/constants";
import type { FulfillmentType, OrderStatus, PaymentMethod, SalesChannel } from "@prisma/client";
import type { OwnerDashboardPayload, OwnerTodayOrder } from "@/lib/owner-dashboard";

function channelLabel(value: string) {
  if (value === "ORDER_CUSTOMER") return "ลูกค้าสั่งออนไลน์";
  return SALES_CHANNEL_LABELS[value as SalesChannel] ?? value;
}

function timeHm(iso: string) {
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

function OwnerTodayInner() {
  const { data } = useOwnerDashboard();
  const [payload, setPayload] = useState<OwnerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeTest, setIncludeTest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ period: "day", orders: "1" });
    if (includeTest) params.set("includeTest", "1");
    fetch(`/api/owner/dashboard?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: OwnerDashboardPayload | null) => {
        if (!cancelled && json) setPayload(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [includeTest]);

  const stats = payload?.stats ?? data?.stats;
  const orders: OwnerTodayOrder[] = payload?.orders ?? [];
  const hasTestBranch =
    payload?.hasTestBranch ??
    data?.hasTestBranch ??
    (data?.branches ?? []).some((b) => b.isTest);

  return (
    <div className="px-4 pb-6 pt-4">
      {hasTestBranch ? (
        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-950">
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(e) => setIncludeTest(e.target.checked)}
          />
          รวมออเดอร์สาขาทดลอง
        </label>
      ) : null}

      <div className="rounded-3xl bg-white px-5 py-7 text-center shadow-sm">
        <p className="text-[15px] font-medium text-slate-500">
          ยอดรวม {stats?.completedCount ?? 0} รายการที่ขายได้
          {hasTestBranch && !includeTest ? " · ไม่รวมทดลอง" : ""}
        </p>
        <p className="mt-2 text-5xl font-black tabular-nums leading-none text-slate-900">
          {formatPrice(stats?.completedRevenue ?? 0)}{" "}
          <span className="text-xl font-bold text-slate-500">บาท</span>
        </p>
        {(stats?.openCount ?? 0) > 0 ? (
          <p className="mt-3 text-[15px] font-bold text-amber-600">
            กำลังทำอยู่ {stats?.openCount} ออเดอร์
          </p>
        ) : null}
      </div>

      <p className="mb-3 mt-6 text-base font-extrabold text-slate-800">
        รายการวันนี้
      </p>
      {loading && orders.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-slate-500">
          กำลังโหลดรายการ…
        </p>
      ) : orders.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-10 text-center text-[15px] text-slate-500 shadow-sm">
          ยังไม่มีออเดอร์วันนี้
        </p>
      ) : (
        <div className="space-y-2.5">
          {orders.map((order) => (
            <article
              key={order.id}
              className="rounded-2xl bg-white px-4 py-3.5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-400">
                    {timeHm(order.createdAt)}
                    {order.queueNumber != null
                      ? ` · คิว ${order.queueNumber}`
                      : ""}
                  </p>
                  <p className="mt-1 truncate text-[16px] font-extrabold text-slate-900">
                    {order.customerName || order.orderNumber}
                  </p>
                  <p className="mt-1 text-[13px] text-slate-500">
                    {order.branchName} · {channelLabel(order.salesChannel)} ·{" "}
                    {FULFILLMENT_LABELS[
                      order.fulfillmentType as FulfillmentType
                    ] ?? order.fulfillmentType}
                    {" · "}
                    {PAYMENT_METHOD_LABELS[
                      order.paymentMethod as PaymentMethod
                    ] ?? order.paymentMethod}
                  </p>
                  <p className="mt-1.5 text-[13px] font-semibold text-slate-600">
                    {ORDER_STATUS_LABELS[order.status as OrderStatus] ??
                      order.status}
                  </p>
                </div>
                <p className="shrink-0 text-xl font-black tabular-nums text-slate-900">
                  {formatPrice(order.total)}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OwnerTodayPage() {
  return (
    <OwnerAppShell active="today">
      <OwnerTodayInner />
    </OwnerAppShell>
  );
}
