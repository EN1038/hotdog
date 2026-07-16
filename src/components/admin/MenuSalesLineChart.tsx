"use client";

type Point = { date: string; quantity: number; revenue: number };

type Series = {
  id: string;
  name: string;
  points: Point[];
};

type DayMeta = { date: string; label: string };

const COLORS = [
  "#dc2626",
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
];

type Metric = "quantity" | "revenue";

export function MenuSalesLineChart({
  days,
  series,
  metric,
}: {
  days: DayMeta[];
  series: Series[];
  metric: Metric;
}) {
  if (days.length === 0 || series.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        ยังไม่มียอดขายเมนูในช่วงนี้สำหรับวาดกราฟ
      </p>
    );
  }

  const width = 560;
  const height = 220;
  const pad = { top: 16, right: 12, bottom: 28, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const values = series.flatMap((s) =>
    s.points.map((p) => (metric === "quantity" ? p.quantity : p.revenue)),
  );
  const maxY = Math.max(1, ...values);

  const xAt = (i: number) =>
    pad.left + (days.length <= 1 ? innerW / 2 : (i / (days.length - 1)) * innerW);
  const yAt = (v: number) =>
    pad.top + innerH - (v / maxY) * innerH;

  const gridYs = [0, 0.5, 1].map((t) => ({
    y: yAt(maxY * t),
    label:
      metric === "quantity"
        ? String(Math.round(maxY * t))
        : Math.round(maxY * t).toLocaleString("th-TH"),
  }));

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="กราฟแนวโน้มยอดขายเมนู"
      >
        {gridYs.map((g) => (
          <g key={g.y}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={g.y}
              y2={g.y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text
              x={pad.left - 6}
              y={g.y + 3}
              textAnchor="end"
              className="fill-slate-400"
              fontSize={10}
            >
              {g.label}
            </text>
          </g>
        ))}

        {series.map((s, si) => {
          const color = COLORS[si % COLORS.length]!;
          const pts = s.points
            .map((p, i) => {
              const v = metric === "quantity" ? p.quantity : p.revenue;
              return `${xAt(i)},${yAt(v)}`;
            })
            .join(" ");
          return (
            <g key={s.id}>
              <polyline
                fill="none"
                stroke={color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={pts}
              />
              {s.points.map((p, i) => {
                const v = metric === "quantity" ? p.quantity : p.revenue;
                return (
                  <circle
                    key={`${s.id}-${p.date}`}
                    cx={xAt(i)}
                    cy={yAt(v)}
                    r={3}
                    fill={color}
                  >
                    <title>
                      {s.name} · {days[i]?.label}:{" "}
                      {metric === "quantity"
                        ? `${v} ชิ้น`
                        : `฿${v.toLocaleString("th-TH")}`}
                    </title>
                  </circle>
                );
              })}
            </g>
          );
        })}

        {days.map((d, i) => (
          <text
            key={d.date}
            x={xAt(i)}
            y={height - 8}
            textAnchor="middle"
            className="fill-slate-500"
            fontSize={10}
          >
            {d.label}
          </text>
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {series.map((s, si) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-600"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: COLORS[si % COLORS.length] }}
            />
            <span className="max-w-[9rem] truncate">{s.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
