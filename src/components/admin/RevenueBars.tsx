"use client";

type DayPoint = {
  date: string;
  label: string;
  revenue: number;
  cancelled: number;
};

type Props = {
  days: DayPoint[];
};

function formatMoney(n: number) {
  return n.toLocaleString("th-TH", {
    maximumFractionDigits: 0,
  });
}

export function RevenueBars({ days }: Props) {
  const maxRevenue = Math.max(1, ...days.map((d) => d.revenue));
  const maxCancelled = Math.max(1, ...days.map((d) => d.cancelled));

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">
          รายได้ที่เสร็จสิ้น (7 วันล่าสุด)
        </p>
        <div className="flex h-36 items-end gap-1.5 sm:gap-2">
          {days.map((d) => (
            <div
              key={`rev-${d.date}`}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span className="truncate text-[10px] text-gray-500">
                {d.revenue > 0 ? formatMoney(d.revenue) : ""}
              </span>
              <div className="flex h-24 w-full items-end rounded-t bg-emerald-50">
                <div
                  className="w-full rounded-t bg-emerald-500 transition-all"
                  style={{
                    height: `${Math.max(4, (d.revenue / maxRevenue) * 100)}%`,
                  }}
                  title={`${d.label}: ${formatMoney(d.revenue)} บาท`}
                />
              </div>
              <span className="truncate text-[10px] text-gray-500">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">
          ออเดอร์ที่ยกเลิก (จำนวน)
        </p>
        <div className="flex h-28 items-end gap-1.5 sm:gap-2">
          {days.map((d) => (
            <div
              key={`can-${d.date}`}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span className="text-[10px] text-gray-500">
                {d.cancelled > 0 ? d.cancelled : ""}
              </span>
              <div className="flex h-16 w-full items-end rounded-t bg-gray-100">
                <div
                  className="w-full rounded-t bg-gray-400 transition-all"
                  style={{
                    height: `${Math.max(
                      d.cancelled > 0 ? 8 : 4,
                      (d.cancelled / maxCancelled) * 100,
                    )}%`,
                  }}
                  title={`${d.label}: ยกเลิก ${d.cancelled}`}
                />
              </div>
              <span className="truncate text-[10px] text-gray-500">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
