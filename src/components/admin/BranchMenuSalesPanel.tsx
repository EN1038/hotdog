"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  adminInputClass,
  adminLabelClass,
  btnOutline,
} from "@/components/admin/AdminShell";
import { MenuSalesLineChart } from "@/components/admin/MenuSalesLineChart";
import { bangkokDateKey } from "@/lib/branch-hours";

type SalesItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  isHidden: boolean;
  isOutOfStock: boolean;
  category: { id: string; name: string } | null;
  quantity: number;
  revenue: number;
  isBestSeller: boolean;
};

type SalesSummary = {
  completedOrders: number;
  totalQty: number;
  menuRevenue: number;
  menusSold: number;
  menusUnsold: number;
  menuCount: number;
};

type TrendPayload = {
  days: { date: string; label: string }[];
  series: {
    id: string;
    name: string;
    totalQty: number;
    totalRevenue: number;
    points: { date: string; quantity: number; revenue: number }[];
  }[];
};

type SalesPayload = {
  date: string;
  summary: SalesSummary;
  items: SalesItem[];
  trend: TrendPayload | null;
};

function money(n: number) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function todayYmd() {
  return bangkokDateKey(new Date());
}

type Props = {
  branchId: string;
  /** full = overview with chart; compact = menu tab numbers */
  variant?: "full" | "compact";
  onOpenOverview?: () => void;
};

export function BranchMenuSalesPanel({
  branchId,
  variant = "full",
  onOpenOverview,
}: Props) {
  const [date, setDate] = useState(todayYmd);
  const [metric, setMetric] = useState<"quantity" | "revenue">("quantity");
  const [data, setData] = useState<SalesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const trend = variant === "full" ? "1" : "0";
    fetch(
      `/api/admin/branches/${branchId}/menu-sales?date=${encodeURIComponent(date)}&trend=${trend}`,
    )
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error ?? "โหลดไม่สำเร็จ");
        }
        return body as SalesPayload;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
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
  }, [branchId, date, variant]);

  const summary = data?.summary;
  const soldItems = data?.items.filter((i) => i.quantity > 0) ?? [];
  const unsoldItems = data?.items.filter((i) => i.quantity === 0) ?? [];
  const isFull = variant === "full";

  return (
    <div
      className={
        isFull
          ? "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
          : "rounded-xl border border-slate-200 bg-slate-50/80 p-4"
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3
            className={
              isFull
                ? "text-base font-semibold text-slate-900"
                : "text-sm font-semibold text-slate-900"
            }
          >
            {isFull ? "ยอดขายเมนู" : "สรุปยอดขายเมนูรายวัน"}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {isFull
              ? "ตัวเลขรายวัน + กราฟแนวโน้ม 7 วัน (Top เมนู) — ออเดอร์สำเร็จ เวลาไทย"
              : "นับจากออเดอร์ที่เสร็จสิ้นตามวันที่สั่ง"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem]">
            <label className={adminLabelClass} htmlFor={`menu-sales-date-${variant}`}>
              วันที่
            </label>
            <input
              id={`menu-sales-date-${variant}`}
              type="date"
              className={adminInputClass}
              value={date}
              max={todayYmd()}
              onChange={(e) => setDate(e.target.value || todayYmd())}
            />
          </div>
          {!isFull && onOpenOverview && (
            <button
              type="button"
              className={btnOutline}
              onClick={onOpenOverview}
            >
              ดูกราฟที่ภาพรวม
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">กำลังโหลดสรุปยอดขาย...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : summary ? (
        <>
          <div
            className={`mt-4 grid gap-2 ${
              isFull ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4"
            }`}
          >
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">ออเดอร์สำเร็จ</p>
              <p className="mt-0.5 text-lg font-bold text-slate-900">
                {summary.completedOrders}
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">ชิ้นที่ขายได้</p>
              <p className="mt-0.5 text-lg font-bold text-slate-900">
                {summary.totalQty}
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">ยอดเมนู (บาท)</p>
              <p className="mt-0.5 text-lg font-bold text-site-primary">
                {money(summary.menuRevenue)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">ขายได้ / ไม่ขาย</p>
              <p className="mt-0.5 text-lg font-bold text-slate-900">
                {summary.menusSold}
                <span className="text-sm font-medium text-slate-400">
                  {" "}
                  / {summary.menusUnsold}
                </span>
              </p>
            </div>
          </div>

          {isFull && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    กราฟแนวโน้มเมนู (7 วันถึงวันที่เลือก)
                  </p>
                  <p className="text-xs text-slate-500">
                    แสดง Top เมนูตามยอดชิ้นในช่วงนั้น — วางเมาส์ที่จุดเพื่อดูรายละเอียด
                  </p>
                </div>
                <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    className={`rounded-md px-2.5 py-1 ${
                      metric === "quantity"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500"
                    }`}
                    onClick={() => setMetric("quantity")}
                  >
                    ชิ้น
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-2.5 py-1 ${
                      metric === "revenue"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500"
                    }`}
                    onClick={() => setMetric("revenue")}
                  >
                    บาท
                  </button>
                </div>
              </div>
              <MenuSalesLineChart
                days={data?.trend?.days ?? []}
                series={data?.trend?.series ?? []}
                metric={metric}
              />
            </div>
          )}

          <div className={`mt-4 space-y-2 ${isFull ? "" : ""}`}>
            <p className="text-xs font-medium text-slate-600">
              อันดับยอดขายวัน{date === todayYmd() ? "นี้" : "ที่เลือก"}
              {soldItems.length === 0 ? " — ยังไม่มียอด" : ""}
            </p>
            {soldItems.length > 0 && (
              <ul
                className={`space-y-1.5 overflow-y-auto ${
                  isFull ? "max-h-72" : "max-h-48"
                }`}
              >
                {soldItems.map((item, index) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-400">
                      {index + 1}
                    </span>
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] text-slate-400">
                        —
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/admin/branches/${branchId}/menu/${item.id}`}
                          className="truncate text-sm font-medium text-slate-900 hover:text-site-primary"
                        >
                          {item.name}
                        </Link>
                        {item.isBestSeller && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            ขายดี
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {item.category?.name ?? "ไม่มีหมวด"} · {item.quantity}{" "}
                        ชิ้น
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-slate-800">
                      ฿{money(item.revenue)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {unsoldItems.length > 0 && (
              <details className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-slate-600">
                  เมนูที่ยังไม่ขายในวันนี้ ({unsoldItems.length})
                </summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                  {unsoldItems.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <Link
                        href={`/admin/branches/${branchId}/menu/${item.id}`}
                        className="truncate hover:text-site-primary"
                      >
                        {item.name}
                        {item.isHidden ? " (ซ่อน)" : ""}
                        {item.isOutOfStock ? " (หมด)" : ""}
                      </Link>
                      <span className="shrink-0 text-slate-400">0 ชิ้น</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
