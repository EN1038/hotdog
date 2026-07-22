"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminInputClass, adminLabelClass } from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
import { MenuSalesLineChart } from "@/components/admin/MenuSalesLineChart";

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
  operatingDay?: string;
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

export function BranchMenuSalesPanel({ branchId }: { branchId: string }) {
  const [date, setDate] = useState("");
  const [operatingDay, setOperatingDay] = useState("");
  const [metric, setMetric] = useState<"quantity" | "revenue">("quantity");
  const [data, setData] = useState<SalesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = date
      ? `?date=${encodeURIComponent(date)}&trend=1`
      : "?trend=1";
    fetch(`/api/admin/branches/${branchId}/menu-sales${qs}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error ?? "โหลดไม่สำเร็จ");
        }
        return body as SalesPayload;
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

  const summary = data?.summary;
  const soldItems = data?.items.filter((i) => i.quantity > 0) ?? [];
  const unsoldItems = data?.items.filter((i) => i.quantity === 0) ?? [];
  const maxDate = operatingDay || date;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">ยอดขายเมนู</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            ตัวเลขรายวันตามรอบวันธุรกิจ + กราฟแนวโน้ม 7 วัน (Top เมนู) — ออเดอร์สำเร็จ
          </p>
        </div>
        <div className="min-w-[10rem]">
          <label className={adminLabelClass} htmlFor="menu-sales-date">
            วันที่
          </label>
          <DateInput
            id="menu-sales-date"
            className={adminInputClass}
            value={date}
            max={maxDate || undefined}
            onChange={(next) => {
              if (next) setDate(next);
            }}
          />
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">กำลังโหลดสรุปยอดขาย...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : summary ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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

          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-slate-600">
              อันดับยอดขายวัน{date === operatingDay ? "นี้" : "ที่เลือก"}
              {soldItems.length === 0 ? " — ยังไม่มียอด" : ""}
            </p>
            {soldItems.length > 0 && (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto">
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
