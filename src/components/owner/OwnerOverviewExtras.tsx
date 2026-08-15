"use client";

import { formatPrice } from "@/lib/constants";
import type { OwnerDailyPoint, OwnerTopSeller } from "@/lib/owner-dashboard";

export function OwnerDailyRevenueBars({
  days,
  loading,
}: {
  days: OwnerDailyPoint[];
  loading?: boolean;
}) {
  const maxRevenue = Math.max(1, ...days.map((d) => d.revenueBaht));
  const total = days.reduce((a, d) => a + d.revenueBaht, 0);

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        loading ? "opacity-60" : ""
      }`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-slate-900">
          ยอดขายรายวัน
        </h2>
        <p className="text-[12px] font-semibold tabular-nums text-slate-500">
          รวม {formatPrice(total)} ฿
        </p>
      </div>
      {days.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">ไม่มีข้อมูล</p>
      ) : (
        <div className="flex h-36 items-end gap-1 overflow-x-auto pb-1">
          {days.map((d) => (
            <div
              key={d.date}
              className="flex min-w-[1.75rem] flex-1 flex-col items-center justify-end gap-1"
              title={`${d.label}: ${formatPrice(d.revenueBaht)} ฿ · ${d.orderCount} บิล`}
            >
              <div className="flex h-28 w-full items-end justify-center">
                <div
                  className="w-[70%] max-w-[1.25rem] rounded-t-md bg-emerald-500"
                  style={{
                    height: `${Math.max(
                      d.revenueBaht > 0 ? 6 : 2,
                      (d.revenueBaht / maxRevenue) * 100,
                    )}%`,
                  }}
                />
              </div>
              <span className="max-w-full truncate text-[9px] font-medium text-slate-500">
                {d.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function OwnerTopSellersList({
  items,
  loading,
}: {
  items: OwnerTopSeller[];
  loading?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        loading ? "opacity-60" : ""
      }`}
    >
      <h2 className="mb-3 text-[15px] font-extrabold text-slate-900">
        สินค้าขายดี Top 10
      </h2>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          ยังไม่มียอดขายในช่วงนี้
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {items.map((item, index) => (
            <li
              key={`${item.name}-${index}`}
              className="flex items-center gap-3 py-2.5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-black tabular-nums text-slate-700">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-slate-900">
                  {item.name}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  {formatPrice(item.quantity)} ชิ้น
                </p>
              </div>
              <p className="shrink-0 text-[14px] font-extrabold tabular-nums text-slate-900">
                {formatPrice(item.revenueBaht)} ฿
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
