"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { DateInput } from "@/components/DateInput";
import { formatPrice } from "@/lib/constants";
import {
  SALES_SHARE_COLORS,
  type SalesShareSlice,
} from "@/lib/sales-share";

export function SalesSummaryPageHeader({
  title = "สรุปยอด",
  subtitle = "สามารถดูหรือดาวน์โหลดรายงานได้",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-4">
      <h1 className="text-[22px] font-black text-site-primary">{title}</h1>
      <p className="mt-1 text-[14px] font-medium text-slate-500">{subtitle}</p>
    </header>
  );
}

export function PeriodToggle({
  value,
  onChange,
}: {
  value: "day" | "month";
  onChange: (next: "day" | "month") => void;
}) {
  return (
    <div className="mb-4 flex rounded-full bg-slate-100 p-1.5">
      {(["day", "month"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-1 rounded-full py-3 text-[15px] font-extrabold ${
            value === id
              ? "bg-site-primary text-white shadow-sm"
              : "text-slate-500"
          }`}
        >
          {id === "day" ? "รายวัน" : "รายเดือน"}
        </button>
      ))}
    </div>
  );
}

/** ฟอร์มค้นหารายงานแบบอ้างอิงถุงเงิน/ธนาคาร */
export function SalesReportFilters({
  period,
  date,
  maxDate,
  loading,
  onPeriodChange,
  onDateChange,
  onSearch,
}: {
  period: "day" | "month";
  date: string;
  maxDate?: string;
  loading?: boolean;
  onPeriodChange: (next: "day" | "month") => void;
  onDateChange: (next: string) => void;
  onSearch: () => void;
}) {
  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
            รูปแบบการแสดงข้อมูล<span className="text-rose-500">*</span>
          </span>
          <div className="relative">
            <select
              value={period}
              onChange={(e) =>
                onPeriodChange(e.target.value === "month" ? "month" : "day")
              }
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-10 text-[15px] font-bold text-slate-900 outline-none focus:border-site-primary"
            >
              <option value="day">รายวัน</option>
              <option value="month">รายเดือน</option>
            </select>
            <span
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-site-primary"
              aria-hidden
            >
              ▾
            </span>
          </div>
        </label>

        <label className="block min-w-0">
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
            {period === "day" ? "วันที่ต้องการ" : "ถึงวันที่"}
            <span className="text-rose-500">*</span>
          </span>
          <DateInput
            value={date}
            max={maxDate}
            required
            aria-label={period === "day" ? "วันที่ต้องการ" : "ถึงวันที่"}
            onChange={(next) => {
              if (next) onDateChange(next);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[15px] font-bold text-slate-900 outline-none focus:border-site-primary"
          />
        </label>

        <div className="flex items-end">
          <button
            type="button"
            disabled={loading}
            onClick={onSearch}
            className="w-full rounded-xl bg-site-primary px-5 py-3 text-[15px] font-extrabold text-white shadow-sm disabled:opacity-60 sm:min-w-[8.5rem]"
          >
            {loading ? "กำลังค้นหา…" : "ค้นหาข้อมูล"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SalesTotalCard({
  count,
  amount,
  loading,
  onRequestReport,
}: {
  count: number;
  amount: number;
  loading?: boolean;
  onRequestReport?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-center shadow-sm">
      <div className="px-5 py-7">
        <p className="text-[15px] font-medium text-slate-500">
          ยอดรวม {count} รายการ
          {loading ? " · กำลังโหลด" : ""}
        </p>
        <p className="mt-2 text-5xl font-black tabular-nums leading-none text-slate-900">
          {formatPrice(amount)}{" "}
          <span className="text-xl font-bold text-slate-500">บาท</span>
        </p>
      </div>
      {onRequestReport ? (
        <button
          type="button"
          onClick={onRequestReport}
          className="flex w-full items-center justify-center gap-2 border-t border-slate-100 bg-site-primary-soft py-4 text-[15px] font-extrabold text-site-primary"
        >
          <span aria-hidden>📄</span>
          ขอรายงานการขาย
        </button>
      ) : null}
    </div>
  );
}

/** การ์ดรายงานหลัก — หัวข้อ + ดาวน์โหลด + ยอดสรุป 3 ช่อง */
export function SalesReportCard({
  title,
  count,
  amount,
  cancelledCount,
  loading,
  onDownload,
}: {
  title: string;
  count: number;
  amount: number;
  cancelledCount: number;
  loading?: boolean;
  onDownload?: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
        <p className="text-[16px] font-extrabold text-slate-900">
          {title}
          {loading ? (
            <span className="ml-2 text-[13px] font-medium text-slate-400">
              กำลังโหลด…
            </span>
          ) : null}
        </p>
        {onDownload ? (
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-xl border border-site-primary px-3 py-2 text-[13px] font-extrabold text-site-primary"
          >
            <span aria-hidden>⬇</span>
            ดาวน์โหลดรายงานการขาย
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2.5 p-3.5 sm:grid-cols-3">
        <ReportStatBlock
          label="ยอดรวมทั้งหมด"
          value={`${formatPrice(amount)} บาท`}
        />
        <ReportStatBlock
          label="รายการรับเงินทั้งหมด"
          value={`${count} รายการ`}
        />
        <ReportStatBlock
          label="รายการยกเลิกทั้งหมด"
          value={`${cancelledCount} รายการ`}
        />
      </div>
    </section>
  );
}

function ReportStatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-4">
      <p className="text-[12px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1.5 text-[18px] font-black tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

export function MetricTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "cash" | "transfer" | "warn" | "muted";
}) {
  const toneClass =
    tone === "cash"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "transfer"
        ? "border-sky-200 bg-sky-50"
        : tone === "warn"
          ? "border-rose-200 bg-rose-50"
          : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border px-3.5 py-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums leading-tight text-slate-900">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs font-medium text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function SalesReportMetrics({
  stats,
  byChannel,
  byPayment,
  byBranch,
  hideCashDrawer = false,
}: {
  stats: {
    completedRevenue: number;
    cancelledCount: number;
    cancelledRevenue?: number;
    openCount: number;
    cashRevenue: number;
    transferRevenue: number;
    discountTotal: number;
    giftQuantity: number;
    customerCount: number;
    expenseTotal: number;
    expenseCount: number;
    wasteQty: number;
    wasteValue: number;
    openingCash: number;
    expectedCash: number;
    netAfterExpenses: number;
    netAfterWaste?: number;
  };
  byChannel: SalesShareSlice[];
  byPayment: SalesShareSlice[];
  byBranch?: SalesShareSlice[];
  /** Hide opening/expected cash when already shown on the page */
  hideCashDrawer?: boolean;
}) {
  const baht = (n: number) => `${formatPrice(n)}฿`;
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <MetricTile label="เงินสด" value={baht(stats.cashRevenue)} tone="cash" />
        <MetricTile
          label="โอน"
          value={baht(stats.transferRevenue)}
          tone="transfer"
        />
        <MetricTile
          label="จำนวนลูกค้า"
          value={`${stats.customerCount} บิล`}
          hint={stats.openCount > 0 ? `กำลังทำ ${stats.openCount}` : undefined}
        />
        <MetricTile
          label="ค่าใช้จ่าย"
          value={baht(stats.expenseTotal)}
          hint={
            stats.expenseCount > 0 ? `${stats.expenseCount} รายการ` : undefined
          }
          tone={stats.expenseTotal > 0 ? "warn" : "default"}
        />
        <MetricTile
          label="สินค้าเสีย"
          value={baht(stats.wasteValue)}
          hint={stats.wasteQty > 0 ? `${stats.wasteQty} ชิ้น` : undefined}
          tone={stats.wasteValue > 0 ? "warn" : "default"}
        />
        <MetricTile label="ส่วนลด" value={baht(stats.discountTotal)} />
        <MetricTile label="ของแถม" value={`${stats.giftQuantity} ชิ้น`} />
        <MetricTile
          label="ยกเลิก"
          value={`${stats.cancelledCount} บิล`}
          hint={
            (stats.cancelledRevenue ?? 0) > 0
              ? baht(stats.cancelledRevenue ?? 0)
              : undefined
          }
          tone={stats.cancelledCount > 0 ? "warn" : "default"}
        />
        <MetricTile
          label="เหลือหลังของเสีย"
          value={baht(
            stats.netAfterWaste ??
              stats.netAfterExpenses - stats.wasteValue,
          )}
        />
      </div>

      {hideCashDrawer ? null : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <MetricTile label="เงินทอนตั้งต้น" value={baht(stats.openingCash)} />
            <MetricTile
              label="เงินสดในลิ้นชัก"
              value={baht(stats.expectedCash)}
              hint="ตั้งต้น + เงินสด − จ่ายสด"
              tone="cash"
            />
          </div>
          <div className="mt-3">
            <MetricTile
              label="เหลือสุทธิหลังค่าใช้จ่าย"
              value={baht(stats.netAfterExpenses)}
              hint="ยอดขาย − ค่าใช้จ่าย"
            />
          </div>
        </>
      )}

      {byBranch && byBranch.length > 0 ? (
        <SalesShareSection
          title="สัดส่วนการขายตามสาขา"
          slices={byBranch}
          totalRevenue={stats.completedRevenue}
          chartStyle="donut"
        />
      ) : null}
      <SalesShareSection
        title="ช่องทางการขาย"
        slices={byChannel}
        totalRevenue={stats.completedRevenue}
        chartStyle="donut"
      />
      <SalesShareSection
        title="สัดส่วนการขาย"
        slices={byPayment}
        totalRevenue={stats.completedRevenue}
        chartStyle="donut"
      />
    </>
  );
}

function ShareAccentCard({
  label,
  pct,
  amount,
  color,
  icon,
}: {
  label: string;
  pct: number;
  amount: number;
  color: string;
  icon?: ReactNode;
}) {
  const pctLabel =
    pct % 1 === 0 ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, "");
  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <span
        className="w-2.5 shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3.5">
        {icon ? (
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: color }}
          >
            {icon}
          </span>
        ) : (
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[12px] font-black text-white"
            style={{ backgroundColor: color }}
            aria-hidden
          >
            {Math.round(pct)}%
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-slate-600">
            {label}{" "}
            <span className="font-medium text-slate-400">({pctLabel}%)</span>
          </p>
          <p className="mt-0.5 text-[18px] font-black tabular-nums text-slate-900">
            {formatPrice(amount)}{" "}
            <span className="text-[14px] font-bold text-slate-600">บาท</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function DonutChartWithOutsideLabels({
  slices,
  totalRevenue,
}: {
  slices: SalesShareSlice[];
  totalRevenue: number;
}) {
  let cursor = 0;
  const segments = slices.map((slice, index) => {
    const pct =
      totalRevenue > 0 ? (slice.completedRevenue / totalRevenue) * 100 : 0;
    const start = cursor;
    cursor += pct;
    return {
      key: slice.key,
      pct,
      start,
      end: cursor,
      mid: start + pct / 2,
      color: SALES_SHARE_COLORS[index % SALES_SHARE_COLORS.length]!,
    };
  });

  const stops = segments
    .map((s) => `${s.color} ${s.start}% ${s.end}%`)
    .join(", ");

  return (
    <div className="relative mx-auto mb-6 h-[13.5rem] w-[13.5rem]">
      <div
        className="absolute inset-[1.35rem] rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
        role="img"
        aria-label="กราฟสัดส่วนการขาย"
      >
        <div className="absolute inset-[2.1rem] rounded-full bg-white" />
      </div>
      {segments.map((seg) => {
        if (seg.pct < 0.5) return null;
        // conic-gradient: 0% ที่ด้านบน หมุนตามเข็มนาฬิกา
        const deg = (seg.mid / 100) * 360;
        const rad = (deg * Math.PI) / 180;
        const r = 46; // % จากศูนย์กลาง — นอกวงโดนัท
        const x = 50 + r * Math.sin(rad);
        const y = 50 - r * Math.cos(rad);
        const pctLabel =
          seg.pct % 1 === 0
            ? `${seg.pct}`
            : seg.pct.toFixed(2).replace(/\.?0+$/, "");
        return (
          <span
            key={seg.key}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[12px] font-bold tabular-nums text-slate-500"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {pctLabel}%
          </span>
        );
      })}
    </div>
  );
}

export function SalesShareSection({
  title,
  slices,
  totalRevenue,
  /** โหมดโดนัท + % นอกวง + การ์ดแถบสี (ช่องทางการขาย) */
  chartStyle = "bars",
  defaultOpen = false,
}: {
  title: string;
  slices: SalesShareSlice[];
  totalRevenue: number;
  chartStyle?: "bars" | "donut";
  /** เปิดกราฟทันทีหรือไม่ — ค่าเริ่มต้นปิด เพื่อประหยัดพื้นที่ */
  defaultOpen?: boolean;
}) {
  const visible = slices.filter((s) => s.completedRevenue > 0);
  const [show, setShow] = useState(defaultOpen);
  const useDonut = chartStyle === "donut" || visible.length > 1;

  let cursor = 0;
  const stops = visible.map((slice, index) => {
    const pct =
      totalRevenue > 0 ? (slice.completedRevenue / totalRevenue) * 100 : 0;
    const start = cursor;
    cursor += pct;
    const color = SALES_SHARE_COLORS[index % SALES_SHARE_COLORS.length]!;
    return `${color} ${start}% ${cursor}%`;
  });

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[17px] font-extrabold text-slate-900">{title}</p>
        <button
          type="button"
          role="switch"
          aria-checked={show}
          onClick={() => setShow((v) => !v)}
          className={`relative h-8 w-14 shrink-0 rounded-full transition ${
            show ? "bg-site-primary" : "bg-slate-300"
          }`}
        >
          <span
            className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition"
            style={{ left: show ? "1.65rem" : "0.2rem" }}
          />
        </button>
      </div>

      {!show ? null : visible.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-[15px] text-slate-500">
          ยังไม่มียอดขายในช่วงนี้
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {useDonut ? (
            <DonutChartWithOutsideLabels
              slices={visible}
              totalRevenue={totalRevenue}
            />
          ) : (
            <div className="relative mx-auto mb-5 h-48 w-48">
              <div
                className="relative h-full w-full rounded-full"
                style={{
                  background: `conic-gradient(${stops.join(", ")})`,
                }}
              >
                <div className="absolute inset-[2.35rem] flex flex-col items-center justify-center rounded-full bg-white">
                  <p className="text-[11px] font-semibold text-slate-400">รวม</p>
                  <p className="text-[15px] font-black tabular-nums text-slate-900">
                    {formatPrice(totalRevenue)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div
            className={
              chartStyle === "donut"
                ? "space-y-2.5"
                : "grid grid-cols-1 gap-2.5 sm:grid-cols-2"
            }
          >
            {visible.map((row, index) => {
              const pct =
                totalRevenue > 0
                  ? Math.round((row.completedRevenue / totalRevenue) * 1000) /
                    10
                  : 0;
              const color =
                SALES_SHARE_COLORS[index % SALES_SHARE_COLORS.length]!;
              return (
                <ShareAccentCard
                  key={row.key}
                  label={row.label}
                  pct={pct}
                  amount={row.completedRevenue}
                  color={color}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** การ์ดภาพรวมแบบแอดมินแบรนด์ — ขาย / จ่าย / สุทธิ / ของเสีย / สต๊อก */
export type SalesOverviewData = {
  saleStockQty?: number;
  saleStockValue?: number;
  completedRevenue: number;
  cashRevenue: number;
  transferRevenue: number;
  soldQty: number;
  expenseTotal: number;
  expenseCount: number;
  cashExpense: number;
  transferExpense: number;
  wasteQty: number;
  wasteValue: number;
  netAfterExpenses: number;
  netAfterWaste?: number;
  cancelledCount?: number;
  cancelledRevenue?: number;
  stockEnabled?: boolean;
};

export function SalesDateRangeBar({
  from,
  to,
  maxDate,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  maxDate?: string;
  onFromChange: (next: string) => void;
  onToChange: (next: string) => void;
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-end gap-2.5">
      <label className="min-w-[9rem] flex-1">
        <span className="mb-1 block text-[11px] font-semibold text-slate-500">
          วันที่เริ่ม
        </span>
        <DateInput
          value={from}
          max={to || maxDate}
          aria-label="วันที่เริ่ม"
          onChange={(next) => {
            if (next) onFromChange(next);
          }}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] font-semibold text-slate-900"
        />
      </label>
      <label className="min-w-[9rem] flex-1">
        <span className="mb-1 block text-[11px] font-semibold text-slate-500">
          วันที่สิ้นสุด
        </span>
        <DateInput
          value={to}
          min={from}
          max={maxDate}
          aria-label="วันที่สิ้นสุด"
          onChange={(next) => {
            if (next) onToChange(next);
          }}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] font-semibold text-slate-900"
        />
      </label>
    </div>
  );
}

export function SalesOverviewCards({
  data,
  loading,
  onOpenSalesDetail,
  wasteHref,
  expenseHref,
  salesHref,
  stockHref,
  netHref,
  cancelHref,
}: {
  data: SalesOverviewData;
  loading?: boolean;
  onOpenSalesDetail?: () => void;
  wasteHref?: string;
  expenseHref?: string;
  salesHref?: string;
  stockHref?: string;
  netHref?: string;
  cancelHref?: string;
}) {
  const cash = data.cashRevenue ?? 0;
  const transfer = data.transferRevenue ?? 0;
  const cashExpense = data.cashExpense ?? 0;
  const transferExpense = data.transferExpense ?? 0;
  const showStock = data.stockEnabled !== false;
  const netAfterWaste =
    data.netAfterWaste ?? data.netAfterExpenses - (data.wasteValue ?? 0);
  const cancelledCount = data.cancelledCount ?? 0;
  const cancelledRevenue = data.cancelledRevenue ?? 0;

  const wasteCard = (
    <>
      <p className="text-sm font-semibold text-orange-700">ของเสีย</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-orange-800">
        {formatPrice(data.wasteQty)}
      </p>
      <p className="mt-1 text-xs font-medium text-orange-600/80">
        มูลค่า {formatPrice(data.wasteValue)} ฿ · ช่วงที่เลือก
        {wasteHref ? " · กดดูรายการ" : ""}
      </p>
    </>
  );

  const expenseCard = (
    <>
      <p className="text-sm font-semibold text-rose-700">ค่าใช้จ่าย</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-rose-800">
        {formatPrice(data.expenseTotal)} ฿
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-rose-800/90">
        <span>
          เงินสด{" "}
          <span className="font-semibold tabular-nums">
            {formatPrice(cashExpense)} ฿
          </span>
        </span>
        <span className="text-rose-300">·</span>
        <span>
          เงินโอน{" "}
          <span className="font-semibold tabular-nums">
            {formatPrice(transferExpense)} ฿
          </span>
        </span>
      </div>
      <p className="mt-1.5 text-xs font-medium text-rose-600/80">
        {data.expenseCount} รายการ · ช่วงที่เลือก
        {expenseHref ? " · กดดูรายการ" : ""}
      </p>
    </>
  );

  const stockCard = (
    <>
      <p className="text-sm font-semibold text-violet-700">สต๊อกขายปัจจุบัน</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-violet-800">
        {formatPrice(data.saleStockQty ?? 0)}
      </p>
      <p className="mt-1 text-xs font-medium text-violet-600/80">
        มูลค่า {formatPrice(data.saleStockValue ?? 0)} ฿
        {stockHref ? " · กดดูสต๊อก" : ""}
      </p>
    </>
  );

  const salesCard = (
    <>
      <p className="text-sm font-semibold text-emerald-700">ขายได้ (รายได้)</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-emerald-800">
        {formatPrice(data.completedRevenue)} ฿
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-emerald-800/90">
        <span>
          เงินสด{" "}
          <span className="font-semibold tabular-nums">
            {formatPrice(cash)} ฿
          </span>
        </span>
        <span className="text-emerald-400">·</span>
        <span>
          เงินโอน{" "}
          <span className="font-semibold tabular-nums">
            {formatPrice(transfer)} ฿
          </span>
        </span>
      </div>
      <p className="mt-1.5 text-xs font-medium text-emerald-600/80">
        {formatPrice(data.soldQty)} ชิ้น · ช่วงที่เลือก
        {salesHref || onOpenSalesDetail ? " · กดดูรายละเอียด" : ""}
      </p>
    </>
  );

  const netCard = (
    <>
      <p className="text-sm font-semibold text-sky-800">เหลือสุทธิหลังของเสีย</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-sky-900">
        {formatPrice(netAfterWaste)} ฿
      </p>
      <p className="mt-1.5 text-xs font-medium text-sky-700/85">ขาย − จ่าย − เสีย</p>
      <p className="mt-1 text-[11px] font-medium text-sky-600/70">
        หลังค่าใช้จ่าย {formatPrice(data.netAfterExpenses)} ฿ · ของเสีย{" "}
        {formatPrice(data.wasteValue)} ฿
        {netHref ? " · กดดู" : ""}
      </p>
    </>
  );

  const cancelCard = (
    <>
      <p className="text-sm font-semibold text-slate-700">ยกเลิกบิล</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
        {formatPrice(cancelledCount)}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-600/80">
        มูลค่า {formatPrice(cancelledRevenue)} ฿ · ไม่นับเป็นยอดขาย
        {cancelHref ? " · กดดูเหตุผล" : ""}
      </p>
    </>
  );

  const cardClass =
    "rounded-2xl border p-4 shadow-sm transition active:scale-[0.99]";

  return (
    <div
      className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        loading ? "opacity-60" : ""
      }`}
    >
      {showStock ? (
        stockHref ? (
          <Link
            href={stockHref}
            className={`${cardClass} border-violet-200 bg-gradient-to-br from-violet-50 to-white`}
          >
            {stockCard}
          </Link>
        ) : (
          <div
            className={`${cardClass} border-violet-200 bg-gradient-to-br from-violet-50 to-white`}
          >
            {stockCard}
          </div>
        )
      ) : null}

      {salesHref ? (
        <Link
          href={salesHref}
          className={`${cardClass} border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-left`}
        >
          {salesCard}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpenSalesDetail}
          className={`${cardClass} border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-left`}
        >
          {salesCard}
        </button>
      )}

      {expenseHref ? (
        <Link
          href={expenseHref}
          className={`${cardClass} border-rose-200 bg-gradient-to-br from-rose-50 to-white`}
        >
          {expenseCard}
        </Link>
      ) : (
        <div
          className={`${cardClass} border-rose-200 bg-gradient-to-br from-rose-50 to-white`}
        >
          {expenseCard}
        </div>
      )}

      {netHref ? (
        <Link
          href={netHref}
          className={`${cardClass} border-sky-200 bg-gradient-to-br from-sky-50 to-white`}
        >
          {netCard}
        </Link>
      ) : (
        <div
          className={`${cardClass} border-sky-200 bg-gradient-to-br from-sky-50 to-white`}
        >
          {netCard}
        </div>
      )}

      {wasteHref ? (
        <Link
          href={wasteHref}
          className={`${cardClass} border-orange-200 bg-gradient-to-br from-orange-50 to-white`}
        >
          {wasteCard}
        </Link>
      ) : (
        <div
          className={`${cardClass} border-orange-200 bg-gradient-to-br from-orange-50 to-white`}
        >
          {wasteCard}
        </div>
      )}

      {cancelHref ? (
        <Link
          href={cancelHref}
          className={`${cardClass} ${
            cancelledCount > 0
              ? "border-slate-300 bg-gradient-to-br from-slate-100 to-white"
              : "border-slate-200 bg-gradient-to-br from-slate-50 to-white"
          }`}
        >
          {cancelCard}
        </Link>
      ) : (
        <div
          className={`${cardClass} ${
            cancelledCount > 0
              ? "border-slate-300 bg-gradient-to-br from-slate-100 to-white"
              : "border-slate-200 bg-gradient-to-br from-slate-50 to-white"
          }`}
        >
          {cancelCard}
        </div>
      )}
    </div>
  );
}
