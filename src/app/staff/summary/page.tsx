"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { StaffShiftSummarySheet } from "@/components/staff/StaffShiftSummarySheet";
import { StaffDailySalesSummarySheet } from "@/components/staff/StaffDailySalesSummarySheet";
import { StaffExpensesSheet } from "@/components/staff/StaffExpensesSheet";
import { StaffSalesHistoryPanel } from "@/components/staff/StaffSalesHistoryPanel";
import { StaffWasteDetailSheet } from "@/components/staff/StaffWasteDetailSheet";
import { ShareExportMenu } from "@/components/staff/ShareExportMenu";
import {
  ShopDailyRevenueBars,
  ShopTopSellersList,
  ShopWasteSummaryList,
} from "@/components/merchant/ShopOverviewExtras";
import {
  SalesDateRangeBar,
  SalesReportMetrics,
  SalesShareSection,
} from "@/components/merchant/SalesSummaryView";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";
import {
  EMPTY_SALES_REPORT_STATS,
  type SalesReportStats,
  type SalesReportWasteItem,
} from "@/lib/sales-report-shared";
import type { SalesShareSlice } from "@/lib/sales-share";
import type {
  ShopDailyPoint,
  ShopTopSeller,
} from "@/lib/shop-overview-metrics";
import {
  captureElementToPng,
  downloadPngDataUrl,
  sharePngDataUrl,
} from "@/lib/share-media";

type SummaryPayload = {
  from: string;
  to: string;
  brandName: string;
  branchName: string;
  stockEnabled: boolean;
  saleStockQty: number;
  saleStockValue: number;
  lastStockCountAt?: string | null;
  lastSaleAt?: string | null;
  stats: SalesReportStats;
  byChannel: SalesShareSlice[];
  byPayment: SalesShareSlice[];
  wasteItems?: SalesReportWasteItem[];
  topSellers?: ShopTopSeller[];
  days?: ShopDailyPoint[];
};

type BrandingMeta = {
  stockEnabled?: boolean;
  brandStockEnabled?: boolean;
};

type SummaryTab = "overview" | "shifts" | "history";

function formatActivityAt(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function shiftDay(key: string, days: number) {
  const d = new Date(`${key}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return bangkokDateKey(d);
}

function monthStartKey(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function formatShiftHm(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

/** เปิด–ปิดรอบสำหรับแสดงบนสรุปภาพรวม */
function formatShiftOpenCloseLabel(
  shifts: Array<{
    openedAt: string;
    closedAt?: string | null;
    cancelledAt?: string | null;
    isCancelled?: boolean;
  }>,
) {
  const active = shifts
    .filter((s) => !s.isCancelled && !s.cancelledAt)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime(),
    );
  if (active.length === 0) return null;

  if (active.length === 1) {
    const s = active[0]!;
    const open = formatShiftHm(s.openedAt) ?? "—";
    const close = s.closedAt ? (formatShiftHm(s.closedAt) ?? "—") : "เปิดอยู่";
    return `${open}–${close} น.`;
  }

  if (active.length <= 3) {
    return (
      active
        .map((s) => {
          const open = formatShiftHm(s.openedAt) ?? "—";
          const close = s.closedAt
            ? (formatShiftHm(s.closedAt) ?? "—")
            : "เปิดอยู่";
          return `${open}–${close}`;
        })
        .join(" · ") + " น."
    );
  }

  const firstOpen = formatShiftHm(active[0]!.openedAt) ?? "—";
  const last = active[active.length - 1]!;
  const lastClose = last.closedAt
    ? (formatShiftHm(last.closedAt) ?? "—")
    : "เปิดอยู่";
  return `${active.length} รอบ · ${firstOpen}–${lastClose} น.`;
}

function lastMonthRange(todayKey: string) {
  const to = shiftDay(monthStartKey(todayKey), -1);
  return { from: monthStartKey(to), to };
}

type DatePresetId =
  | "today"
  | "yesterday"
  | "3d"
  | "7d"
  | "15d"
  | "month"
  | "lastMonth";

const DATE_PRESETS: Array<{ id: DatePresetId; label: string }> = [
  { id: "today", label: "วันนี้" },
  { id: "yesterday", label: "เมื่อวาน" },
  { id: "3d", label: "3" },
  { id: "7d", label: "7" },
  { id: "15d", label: "15" },
  { id: "month", label: "เดือนนี้" },
  { id: "lastMonth", label: "เดือนที่แล้ว" },
];

function rangeForPreset(kind: DatePresetId, todayKey: string) {
  if (kind === "today") return { from: todayKey, to: todayKey };
  if (kind === "yesterday") {
    const y = shiftDay(todayKey, -1);
    return { from: y, to: y };
  }
  if (kind === "month") {
    return { from: monthStartKey(todayKey), to: todayKey };
  }
  if (kind === "lastMonth") return lastMonthRange(todayKey);
  const days = Number(kind.replace("d", ""));
  return { from: shiftDay(todayKey, -(days - 1)), to: todayKey };
}

export default function StaffSummaryPage() {
  const router = useRouter();
  const today = bangkokDateKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [datePreset, setDatePreset] = useState<DatePresetId | null>("today");
  const [tab, setTab] = useState<SummaryTab>("overview");
  const [payload, setPayload] = useState<SummaryPayload | null>(null);
  const [meta, setMeta] = useState<BrandingMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [dailySalesOpen, setDailySalesOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [showOverviewShifts, setShowOverviewShifts] = useState(false);
  const [exportBusy, setExportBusy] = useState<"save" | "share" | "copy" | null>(
    null,
  );
  const [exportMsg, setExportMsg] = useState("");
  const [shiftHoursLabel, setShiftHoursLabel] = useState<string | null>(null);
  /** โชว์ header เฉพาะตอนจับรูปแชร์ — ปกติซ่อนประหยัดพื้นที่ */
  const [captureHeaderVisible, setCaptureHeaderVisible] = useState(false);
  const overviewCaptureRef = useRef<HTMLDivElement>(null);
  const [agingAttention, setAgingAttention] = useState<number | null>(null);
  const [agingCritical, setAgingCritical] = useState<number | null>(null);
  const [agingWarn, setAgingWarn] = useState<number | null>(null);
  const [agingCriticalQty, setAgingCriticalQty] = useState<number | null>(null);
  const [agingWarnQty, setAgingWarnQty] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/staff/branding")
      .then((res) => {
        if (res.status === 401) {
          router.replace("/staff/login");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data: BrandingMeta | null) => {
        if (data) setMeta(data);
      })
      .catch(() => {});
  }, [router]);

  const loadSummary = useCallback(
    async (rangeFrom: string, rangeTo: string) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ from: rangeFrom, to: rangeTo });
        const res = await fetch(`/api/staff/summary?${qs.toString()}`);
        if (res.status === 401) {
          router.replace("/staff/login");
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as SummaryPayload;
        setPayload(data);
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void loadSummary(from, to);
  }, [loadSummary, from, to]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ from, to });
        const res = await fetch(`/api/staff/shifts?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setShiftHoursLabel(null);
          return;
        }
        const data = (await res.json()) as {
          shifts?: Array<{
            openedAt: string;
            closedAt?: string | null;
            cancelledAt?: string | null;
            isCancelled?: boolean;
          }>;
        };
        if (cancelled) return;
        setShiftHoursLabel(formatShiftOpenCloseLabel(data.shifts ?? []));
      } catch {
        if (!cancelled) setShiftHoursLabel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const rangeLabel = useMemo(() => {
    if (from === to) return formatOperatingDayLabel(to);
    return `${formatOperatingDayLabel(from)} – ${formatOperatingDayLabel(to)}`;
  }, [from, to]);

  const rangeLabelWithTime = shiftHoursLabel
    ? `${rangeLabel} · ${shiftHoursLabel}`
    : rangeLabel;

  const stockOn = Boolean(
    payload?.stockEnabled ??
      (meta?.stockEnabled && meta?.brandStockEnabled),
  );

  useEffect(() => {
    if (!stockOn) {
      setAgingAttention(null);
      setAgingCritical(null);
      setAgingWarn(null);
      setAgingCriticalQty(null);
      setAgingWarnQty(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/staff/stock/aging", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          attentionCount?: number;
          stockActive?: boolean;
          summary?: {
            critical?: number;
            warn?: number;
            criticalQty?: number;
            warnQty?: number;
          };
        };
        if (cancelled) return;
        if (!data.stockActive) {
          setAgingAttention(null);
          setAgingCritical(null);
          setAgingWarn(null);
          setAgingCriticalQty(null);
          setAgingWarnQty(null);
          return;
        }
        setAgingAttention(
          typeof data.attentionCount === "number" ? data.attentionCount : 0,
        );
        setAgingCritical(
          typeof data.summary?.critical === "number"
            ? data.summary.critical
            : 0,
        );
        setAgingWarn(
          typeof data.summary?.warn === "number" ? data.summary.warn : 0,
        );
        setAgingCriticalQty(
          typeof data.summary?.criticalQty === "number"
            ? data.summary.criticalQty
            : 0,
        );
        setAgingWarnQty(
          typeof data.summary?.warnQty === "number" ? data.summary.warnQty : 0,
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stockOn, from, to]);

  if (loading && !payload) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  const stats = payload?.stats ?? EMPTY_SALES_REPORT_STATS;
  const lastStockCountLabel = formatActivityAt(payload?.lastStockCountAt);
  const lastSaleLabel = formatActivityAt(payload?.lastSaleAt);

  function applyPreset(kind: DatePresetId) {
    const range = rangeForPreset(kind, today);
    setFrom(range.from);
    setTo(range.to);
    setDatePreset(kind);
  }

  const netAfterWaste =
    stats.netAfterWaste ?? stats.netAfterExpenses - stats.wasteValue;

  function overviewExportFilename() {
    return from === to
      ? `สรุปยอด_${from}.png`
      : `สรุปยอด_${from}_${to}.png`;
  }

  function buildOverviewCopyText() {
    const brand = payload?.brandName?.trim() || "";
    const branch = payload?.branchName?.trim() || "";
    const lines: string[] = [];
    if (brand) lines.push(brand);
    if (branch) lines.push(`สาขา ${branch}`);
    lines.push(`สรุปยอด · ${rangeLabelWithTime}`);
    lines.push(`ขายได้: ${formatPrice(stats.completedRevenue)} บาท`);
    lines.push(`จำนวนบิล: ${formatPrice(stats.completedCount)} บิล`);
    lines.push(`เงินสด: ${formatPrice(stats.cashRevenue)} บาท`);
    lines.push(`โอน: ${formatPrice(stats.transferRevenue)} บาท`);
    lines.push(`ชิ้นที่ขาย: ${formatPrice(stats.soldQty)} ชิ้น`);
    if (stats.giftQuantity > 0) {
      lines.push(`ของแถม: ${formatPrice(stats.giftQuantity)} ชิ้น`);
    }
    lines.push(`ค่าใช้จ่าย: ${formatPrice(stats.expenseTotal)} บาท`);
    lines.push(
      `ของเสีย: ${formatPrice(stats.wasteQty)} ชิ้น · ${formatPrice(stats.wasteValue)} บาท`,
    );
    const wasteItems = payload?.wasteItems ?? [];
    if (wasteItems.length > 0) {
      lines.push("รายการของเสีย:");
      for (const item of wasteItems) {
        const reasons = (item.entries ?? [])
          .map((e) => e.note?.trim())
          .filter(Boolean);
        const reasonText =
          reasons.length > 0
            ? reasons.join(" · ")
            : "ไม่ระบุเหตุผล";
        lines.push(
          `- ${item.name}: ${formatPrice(item.quantity)} ชิ้น · ${formatPrice(item.value)} บาท · ${reasonText}`,
        );
      }
    }
    lines.push(`เหลือสุทธิ: ${formatPrice(netAfterWaste)} บาท`);
    if (stockOn) {
      lines.push(
        `สต๊อกขาย: ${formatPrice(payload?.saleStockQty ?? 0)} ชิ้น · มูลค่า ${formatPrice(payload?.saleStockValue ?? 0)} บาท`,
      );
    }
    return lines.join("\n");
  }

  async function captureOverviewPng() {
    const node = overviewCaptureRef.current;
    if (!node) throw new Error("ไม่พบเนื้อหาสรุป");
    flushSync(() => setCaptureHeaderVisible(true));
    try {
      return await captureElementToPng(node);
    } finally {
      setCaptureHeaderVisible(false);
    }
  }

  async function copyTextToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("copy failed");
  }

  async function handleOverviewSaveImage() {
    if (exportBusy || !overviewCaptureRef.current) return;
    setExportBusy("save");
    setExportMsg("");
    try {
      const dataUrl = await captureOverviewPng();
      const r = await downloadPngDataUrl(dataUrl, overviewExportFilename());
      setExportMsg(r.ok ? "บันทึกรูปแล้ว" : r.error ?? "บันทึกรูปไม่สำเร็จ");
    } catch {
      setExportMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleOverviewShareImage() {
    if (exportBusy || !overviewCaptureRef.current) return;
    setExportBusy("share");
    setExportMsg("");
    try {
      const dataUrl = await captureOverviewPng();
      const title = [
        payload?.brandName,
        payload?.branchName ? `สาขา ${payload.branchName}` : "",
        "สรุปยอดภาพรวม",
      ]
        .filter(Boolean)
        .join(" · ");
      const r = await sharePngDataUrl(
        dataUrl,
        overviewExportFilename(),
        title,
      );
      if (r.error === "cancelled") {
        setExportMsg("");
        return;
      }
      setExportMsg(
        r.mode === "share"
          ? "แชร์รูปแล้ว"
          : r.ok
            ? "อุปกรณ์นี้แชร์ไม่ได้ — บันทึกรูปแทนแล้ว"
            : r.error ?? "แชร์รูปไม่สำเร็จ",
      );
    } catch {
      setExportMsg("แชร์รูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleOverviewCopyText() {
    if (exportBusy) return;
    setExportBusy("copy");
    setExportMsg("");
    try {
      await copyTextToClipboard(buildOverviewCopyText());
      setExportMsg("คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย");
    } catch {
      setExportMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <StaffAppShell active="summary">
      <div className="px-4 pb-8 pt-3">
        <header className="mb-2.5 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-black text-slate-900">ภาพรวมร้าน</h1>
            <p className="mt-0.5 truncate text-[13px] font-medium text-slate-500">
              {tab === "history"
                ? "ดูบิลย้อนหลัง"
                : tab === "shifts"
                  ? "สรุปรายรอบตามช่วงวันที่"
                  : "ยอดขาย · สต๊อก · ของเสีย · สินค้าขายดี"}
            </p>
            {tab === "overview" && exportMsg ? (
              <p className="mt-1 text-[12px] font-semibold text-emerald-700">
                {exportMsg}
              </p>
            ) : null}
          </div>
          {tab === "overview" ? (
            <ShareExportMenu
              busy={exportBusy}
              message={exportMsg}
              disabled={loading && !payload}
              onShareImage={handleOverviewShareImage}
              onSaveImage={handleOverviewSaveImage}
              onCopyText={handleOverviewCopyText}
            />
          ) : null}
        </header>

        <div className="mb-3 flex rounded-full bg-slate-100 p-1">
          {(
            [
              { id: "overview", label: "ภาพรวม" },
              { id: "shifts", label: "รอบขาย" },
              { id: "history", label: "ประวัติบิล" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex-1 rounded-full py-2 text-[13px] font-extrabold ${
                tab === item.id
                  ? "bg-site-primary text-white shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <SalesDateRangeBar
          from={from}
          to={to}
          maxDate={today}
          onFromChange={(next) => {
            setDatePreset(null);
            setFrom(next);
            if (next > to) setTo(next);
          }}
          onToChange={(next) => {
            setDatePreset(null);
            setTo(next);
          }}
        />

        {tab === "overview" || tab === "shifts" ? (
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {DATE_PRESETS.map((p) => {
              const range = rangeForPreset(p.id, today);
              const active =
                datePreset != null
                  ? datePreset === p.id
                  : from === range.from && to === range.to;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`shrink-0 rounded-full px-3 py-2 text-[13px] font-bold ${
                    active
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {tab === "overview" ? (
          <div className={`space-y-2.5 ${loading ? "opacity-60" : ""}`}>
            <div
              ref={overviewCaptureRef}
              className="space-y-2.5 rounded-2xl bg-[#f5f5f7] p-1"
            >
              {(payload?.brandName || payload?.branchName) && (
                <div
                  className={
                    captureHeaderVisible
                      ? "rounded-xl bg-white px-3 py-2 text-center"
                      : "hidden"
                  }
                  aria-hidden={!captureHeaderVisible}
                >
                  {payload?.brandName ? (
                    <p className="text-[15px] font-extrabold text-slate-900">
                      {payload.brandName}
                    </p>
                  ) : null}
                  {payload?.branchName ? (
                    <p className="mt-0.5 text-[13px] font-semibold text-slate-600">
                      สาขา {payload.branchName}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                    สรุปยอด · {rangeLabelWithTime}
                  </p>
                </div>
              )}
            <section className="rounded-2xl bg-emerald-700 px-3.5 py-3.5 text-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-emerald-100">ขายได้</p>
                  <p className="mt-0.5 text-[12px] font-medium text-emerald-100/85">
                    {rangeLabelWithTime}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-emerald-100/75">
                    {shiftHoursLabel
                      ? "เวลาเปิด–ปิดรอบ · ขายข้ามคืนรวมในรอบนั้น"
                      : "นับตามวันเปิดรอบ · ขายข้ามคืนรวมในรอบนั้น"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[32px] font-black tabular-nums leading-none tracking-tight">
                    ฿{formatPrice(stats.completedRevenue)}
                  </p>
                  <p className="mt-1.5 text-[13px] font-bold tabular-nums text-emerald-100">
                    {formatPrice(stats.completedCount)} บิล
                    {stats.openCount > 0
                      ? ` · ทำอยู่ ${formatPrice(stats.openCount)}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl bg-emerald-900/25 px-1.5 py-2.5 text-center">
                <div className="px-1">
                  <p className="text-[11px] font-semibold text-emerald-100/90">เงินสด</p>
                  <p className="mt-1 text-[15px] font-black tabular-nums leading-tight">
                    ฿{formatPrice(stats.cashRevenue)}
                  </p>
                </div>
                <div className="border-x border-white/15 px-1">
                  <p className="text-[11px] font-semibold text-emerald-100/90">โอน</p>
                  <p className="mt-1 text-[15px] font-black tabular-nums leading-tight">
                    ฿{formatPrice(stats.transferRevenue)}
                  </p>
                </div>
                <div className="px-1">
                  <p className="text-[11px] font-semibold text-emerald-100/90">ชิ้น</p>
                  <p className="mt-1 text-[15px] font-black tabular-nums leading-tight">
                    {formatPrice(stats.soldQty)}
                  </p>
                  {stats.giftQuantity > 0 ? (
                    <p className="mt-0.5 text-[10px] font-semibold text-emerald-100/80">
                      แถม {formatPrice(stats.giftQuantity)}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setExpensesOpen(true)}
                className="min-h-[4.75rem] rounded-2xl border border-rose-200/80 bg-rose-50 px-2.5 py-2.5 text-left active:scale-[0.99]"
              >
                <p className="text-[12px] font-bold text-rose-700">ค่าใช้จ่าย</p>
                <p className="mt-1 text-[17px] font-black tabular-nums leading-none text-rose-800">
                  ฿{formatPrice(stats.expenseTotal)}
                </p>
                <p className="mt-1.5 text-[11px] font-semibold text-rose-600/80">
                  {stats.expenseCount > 0
                    ? `${stats.expenseCount} รายการ`
                    : "กดบันทึก"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setWasteOpen(true)}
                className="min-h-[4.75rem] rounded-2xl border border-amber-200/70 bg-amber-50/80 px-2.5 py-2.5 text-left active:scale-[0.99]"
              >
                <p className="text-[12px] font-bold text-amber-800">ของเสีย</p>
                <p className="mt-1 text-[17px] font-black tabular-nums leading-none text-amber-900">
                  {formatPrice(stats.wasteQty)}
                </p>
                <p className="mt-1.5 text-[11px] font-semibold text-amber-700/80">
                  {stats.wasteQty > 0 || stats.wasteValue > 0
                    ? `฿${formatPrice(stats.wasteValue)}`
                    : "กดดู"}
                </p>
              </button>
              <div className="min-h-[4.75rem] rounded-2xl border border-sky-200/80 bg-sky-50 px-2.5 py-2.5 text-left">
                <p className="text-[12px] font-bold text-sky-800">เหลือสุทธิ</p>
                <p className="mt-1 text-[17px] font-black tabular-nums leading-none text-sky-900">
                  ฿
                  {formatPrice(
                    stats.netAfterWaste ??
                      stats.netAfterExpenses - stats.wasteValue,
                  )}
                </p>
                <p className="mt-1.5 text-[11px] font-semibold text-sky-700/80">
                  ขาย−จ่าย−เสีย
                </p>
              </div>
            </div>
            </div>

            {stockOn ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="grid grid-cols-3">
                  <button
                    type="button"
                    onClick={() =>
                      router.push("/staff/stock?action=view&type=SALE_ITEM")
                    }
                    className="border-r border-slate-100 bg-violet-50 px-2 py-3 text-left active:bg-violet-100"
                  >
                    <p className="text-[11px] font-bold text-violet-800">
                      สต๊อกขาย
                    </p>
                    <p className="mt-1 flex items-baseline gap-0.5 leading-none">
                      <span className="text-[20px] font-black tabular-nums text-violet-900">
                        {formatPrice(payload?.saleStockQty ?? 0)}
                      </span>
                      <span className="text-[12px] font-bold text-violet-700">
                        ชิ้น
                      </span>
                    </p>
                    <p className="mt-1.5 text-[11px] font-bold tabular-nums text-violet-700">
                      มูลค่า ฿{formatPrice(payload?.saleStockValue ?? 0)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      router.push("/staff/stock/aging?filter=critical")
                    }
                    className="border-r border-slate-100 bg-rose-50 px-2 py-3 text-left active:bg-rose-100"
                  >
                    <p className="text-[11px] font-bold text-rose-800">
                      แดง · ≥5วัน
                    </p>
                    <p className="mt-1 flex items-baseline gap-0.5 leading-none">
                      <span className="text-[20px] font-black tabular-nums text-rose-900">
                        {agingCritical == null
                          ? "—"
                          : formatPrice(agingCriticalQty ?? 0)}
                      </span>
                      {agingCritical != null ? (
                        <span className="text-[12px] font-bold text-rose-700">
                          ชิ้น
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1.5 text-[11px] font-semibold text-rose-700">
                      {agingCritical == null
                        ? "กดดู"
                        : `${agingCritical} รายการ`}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      router.push("/staff/stock/aging?filter=warn")
                    }
                    className="bg-amber-50/90 px-2 py-3 text-left active:bg-amber-100/80"
                  >
                    <p className="text-[11px] font-bold text-amber-900/85">
                      ส้ม · 3–4วัน
                    </p>
                    <p className="mt-1 flex items-baseline gap-0.5 leading-none">
                      <span className="text-[20px] font-black tabular-nums text-amber-950/80">
                        {agingWarn == null
                          ? "—"
                          : formatPrice(agingWarnQty ?? 0)}
                      </span>
                      {agingWarn != null ? (
                        <span className="text-[12px] font-bold text-amber-800/80">
                          ชิ้น
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1.5 text-[11px] font-semibold text-amber-800/75">
                      {agingWarn == null ? "กดดู" : `${agingWarn} รายการ`}
                    </p>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/staff/stock/aging")}
                  className="flex w-full items-center justify-between border-t border-slate-100 bg-slate-50/80 px-3 py-2.5 text-left active:bg-slate-100"
                >
                  <p className="text-[13px] font-bold text-slate-700">
                    ของค้างทั้งหมด
                    {agingAttention != null && agingAttention > 0
                      ? ` · ${agingAttention} รายการ`
                      : " · ไม่มี"}
                  </p>
                  <span className="text-[13px] font-extrabold text-slate-500">
                    ดูรายการ →
                  </span>
                </button>
              </div>
            ) : null}

            <div className={stockOn ? "grid grid-cols-2 gap-2" : ""}>
              <button
                type="button"
                onClick={() => setShowOverviewShifts((v) => !v)}
                className={`flex min-h-[3.25rem] items-center justify-between rounded-2xl border px-3.5 py-3 text-left active:scale-[0.99] ${
                  showOverviewShifts
                    ? "border-slate-300 bg-slate-100"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold text-slate-900">
                    รอบขาย
                  </p>
                  <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                    {showOverviewShifts
                      ? "กดเพื่อย่อ"
                      : "ดูรายรอบ · รวมข้ามคืน"}
                  </p>
                </div>
                <span className="text-lg text-slate-400" aria-hidden>
                  {showOverviewShifts ? "▴" : "→"}
                </span>
              </button>
              {stockOn ? (
                <button
                  type="button"
                  onClick={() => setDailySalesOpen(true)}
                  className="flex min-h-[3.25rem] items-center justify-between rounded-2xl bg-sky-700 px-3.5 py-3 text-left text-white active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold">นับสต๊อก</p>
                    <p className="mt-0.5 truncate text-[12px] font-medium text-sky-100">
                      {lastStockCountLabel
                        ? `ล่าสุด ${lastStockCountLabel}`
                        : "ยังไม่เคยนับ"}
                    </p>
                  </div>
                  <span className="text-lg" aria-hidden>
                    →
                  </span>
                </button>
              ) : null}
            </div>

            {showOverviewShifts ? (
              <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <div>
                  <p className="text-[15px] font-extrabold text-slate-900">
                    รอบขายในช่วงนี้
                  </p>
                  <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                    กดเลือกรอบดูสรุป · เปิดรอบเย็นปิดหลังเที่ยงคืนยังอยู่ในวันเปิดรอบ
                  </p>
                </div>
                <StaffShiftSummarySheet
                  variant="inline"
                  dateFrom={from}
                  dateTo={to}
                  brandName={payload?.brandName ?? ""}
                  branchName={payload?.branchName ?? ""}
                />
              </section>
            ) : null}

            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className={`flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-left active:scale-[0.99] ${
                showMore
                  ? "border-slate-300 bg-slate-100"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="min-w-0">
                <p className="text-[14px] font-extrabold text-slate-800">
                  {showMore
                    ? "ซ่อนรายละเอียดเพิ่มเติม"
                    : "ดูรายละเอียดเพิ่มเติม"}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  {showMore
                    ? "กดเพื่อย่อ"
                    : "ลูกค้า · ส่วนลด · ของแถม · ของเสีย · ลิ้นชัก"}
                </p>
              </div>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base font-black text-slate-600"
                aria-hidden
              >
                {showMore ? "−" : "+"}
              </span>
            </button>

            {showMore ? (
              <div className="space-y-3 pb-2">
                <SalesReportMetrics
                  stats={stats}
                  byChannel={payload?.byChannel ?? []}
                  byPayment={payload?.byPayment ?? []}
                />
              </div>
            ) : null}

            <ShopDailyRevenueBars
              days={payload?.days ?? []}
              loading={loading}
            />
            <ShopTopSellersList
              items={payload?.topSellers ?? []}
              loading={loading}
            />
            <ShopWasteSummaryList
              items={payload?.wasteItems ?? []}
              wasteQty={stats.wasteQty}
              wasteValue={stats.wasteValue}
              loading={loading}
            />
            <SalesShareSection
              title="สัดส่วนการขาย"
              slices={payload?.byPayment ?? []}
              totalRevenue={stats.completedRevenue}
              chartStyle="donut"
            />
            <SalesShareSection
              title="ช่องทางการขาย"
              slices={payload?.byChannel ?? []}
              totalRevenue={stats.completedRevenue}
              chartStyle="donut"
            />
          </div>
        ) : tab === "shifts" ? (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-base font-extrabold text-slate-900">
                รอบขายในช่วงนี้
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-slate-500">
                กดเลือกรอบเพื่อดูสรุปรายรอบ · {rangeLabel}
              </p>
            </div>
            <StaffShiftSummarySheet
              variant="inline"
              dateFrom={from}
              dateTo={to}
              brandName={payload?.brandName ?? ""}
              branchName={payload?.branchName ?? ""}
            />
          </section>
        ) : (
          <StaffSalesHistoryPanel
            from={from}
            to={to}
            brandName={payload?.brandName}
            branchName={payload?.branchName}
          />
        )}

        <StaffDailySalesSummarySheet
          open={dailySalesOpen}
          onClose={() => {
            setDailySalesOpen(false);
            void loadSummary(from, to);
          }}
          initialDate={to}
          brandName={payload?.brandName ?? ""}
          branchName={payload?.branchName ?? ""}
        />
        <StaffExpensesSheet
          open={expensesOpen}
          onClose={() => {
            setExpensesOpen(false);
            void loadSummary(from, to);
          }}
          initialDate={to}
        />
        <StaffWasteDetailSheet
          open={wasteOpen}
          onClose={() => setWasteOpen(false)}
          rangeLabel={rangeLabel}
          wasteQty={stats.wasteQty}
          wasteValue={stats.wasteValue}
          items={payload?.wasteItems ?? []}
        />
      </div>
    </StaffAppShell>
  );
}
