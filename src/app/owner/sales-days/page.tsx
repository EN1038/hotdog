"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  mobileRangeForPreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import {
  OwnerDailyRevenueBars,
  OwnerHourlyRevenueBars,
} from "@/components/owner/OwnerOverviewExtras";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import type { OwnerDashboardPayload } from "@/lib/owner-dashboard";
import {
  buildSpendDateRanges,
  buildWeekdayInsights,
  weekdayKindTone,
} from "@/lib/sales-day-insights";
import {
  buildOwnerViewQuery,
  ownerHomeHref,
  ownerParStockHref,
  ownerTomorrowPlansHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";
import { PAR_STOCK_LABEL } from "@/lib/inventory/inventory-par-labels";
import {
  OwnerMonthPatternSection,
  type SalesMonthPatternPayload,
} from "@/components/owner/OwnerMonthPatternSection";
import {
  MONTH_PATTERN_DEFAULT_PERIOD_DAYS,
  type MonthPatternPeriodDays,
} from "@/lib/sales-month-pattern-config";

function OwnerSalesDaysInner() {
  const { data } = useOwnerDashboard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey();
  const initial = readOwnerViewRangeParams(searchParams, today);
  const bootRange =
    !initial.hasRange || initial.from === initial.to
      ? mobileRangeForPreset("month", today)
      : { from: initial.from, to: initial.to };

  const [from, setFrom] = useState(bootRange.from);
  const [to, setTo] = useState(bootRange.to);
  const [datePreset, setDatePreset] = useState<MobileDatePresetId | null>(
    matchMobileDatePreset(bootRange.from, bootRange.to, today) ?? "month",
  );
  const [filterBranchId, setFilterBranchId] = useState<string | null>(
    initial.branchId,
  );
  const [payload, setPayload] = useState<OwnerDashboardPayload | null>(null);
  const [monthPattern, setMonthPattern] =
    useState<SalesMonthPatternPayload | null>(null);
  const [monthPatternLoading, setMonthPatternLoading] = useState(false);
  const [monthPeriodDays, setMonthPeriodDays] =
    useState<MonthPatternPeriodDays>(MONTH_PATTERN_DEFAULT_PERIOD_DAYS);
  const [loading, setLoading] = useState(false);
  const urlReady = useRef(false);

  const writeViewQuery = useCallback(
    (next: {
      branchId?: string | null;
      from?: string;
      to?: string;
    }) => {
      const q = buildOwnerViewQuery({
        branchId:
          next.branchId !== undefined ? next.branchId : filterBranchId,
        from: next.from ?? from,
        to: next.to ?? to,
      });
      router.replace(`/owner/sales-days${q}`, { scroll: false });
    },
    [filterBranchId, from, router, to],
  );

  useEffect(() => {
    const parsed = readOwnerViewRangeParams(searchParams, today);
    if (!urlReady.current) {
      urlReady.current = true;
      if (!searchParams.get("from") || !searchParams.get("to")) {
        const q = buildOwnerViewQuery({
          branchId: parsed.branchId,
          from: bootRange.from,
          to: bootRange.to,
        });
        router.replace(`/owner/sales-days${q}`, { scroll: false });
      }
      return;
    }
    setFilterBranchId(parsed.branchId);
    if (parsed.hasRange) {
      setFrom(parsed.from);
      setTo(parsed.to);
      setDatePreset(
        matchMobileDatePreset(parsed.from, parsed.to, today) ?? "custom",
      );
    }
  }, [bootRange.from, bootRange.to, router, searchParams, today]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({ from, to });
        if (filterBranchId) params.set("branchId", filterBranchId);
        const res = await fetch(`/api/owner/dashboard?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok) return;
        setPayload((await res.json()) as OwnerDashboardPayload);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [filterBranchId, from, to]);

  useEffect(() => {
    const ac = new AbortController();
    setMonthPatternLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          periodDays: String(monthPeriodDays),
        });
        if (filterBranchId) params.set("branchId", filterBranchId);
        const res = await fetch(`/api/owner/sales-month-pattern?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok) return;
        setMonthPattern((await res.json()) as SalesMonthPatternPayload);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      } finally {
        if (!ac.signal.aborted) setMonthPatternLoading(false);
      }
    })();
    return () => ac.abort();
  }, [filterBranchId, monthPeriodDays]);

  const filterBranches = (payload?.branches ?? data?.branches ?? []).filter(
    (b) => !b.isHidden && b.kind !== "WAREHOUSE" && !b.isTest,
  );
  const weekdays = payload?.weekdays ?? [];
  const days = payload?.days ?? [];
  const hours = payload?.hours ?? [];

  const insights = useMemo(() => buildWeekdayInsights(weekdays), [weekdays]);
  const spend = useMemo(() => buildSpendDateRanges(days), [days]);
  const peakDays = insights.filter(
    (d) => d.kind === "peak" || d.kind === "strong",
  );
  const softDays = insights.filter(
    (d) => d.kind === "soft" || d.kind === "low",
  );
  const maxWd = Math.max(1, ...insights.map((d) => d.revenueBaht));

  const parHref = ownerParStockHref({ branchId: filterBranchId });
  const plansHref = ownerTomorrowPlansHref({ branchId: filterBranchId });
  const homeHref = ownerHomeHref({
    branchId: filterBranchId,
    from,
    to,
  });

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-emerald-700/80">
          Owner · วางแผนสต๊อก
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">
          วันขายดี / วันยอดอ่อน
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          รู้ว่าวันไหนควรเตรียมของเพิ่ม และวันไหนควรลด — รวมช่วงที่ลูกค้าใช้จ่ายมาก
        </p>
      </header>

      <div className="mb-3 space-y-2">
        <MobileDateRangeControl
          todayKey={today}
          from={from}
          to={to}
          preset={datePreset}
          onChange={({ from: nextFrom, to: nextTo, preset: nextPreset }) => {
            setFrom(nextFrom);
            setTo(nextTo);
            setDatePreset(nextPreset);
            writeViewQuery({ from: nextFrom, to: nextTo });
          }}
        />
        <div className="flex justify-end">
          <OwnerBranchFilterBar
            branches={filterBranches}
            value={filterBranchId}
            onChange={(id) => {
              setFilterBranchId(id);
              writeViewQuery({ branchId: id });
            }}
          />
        </div>
      </div>

      <section
        className={`mb-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm ${
          loading ? "opacity-70" : ""
        }`}
      >
        <h2 className="text-[15px] font-extrabold text-emerald-950">
          สิ่งที่ควรทำจากช่วงนี้
        </h2>
        {peakDays.length === 0 && softDays.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-900/70">
            {loading ? "กำลังโหลด…" : "ยังไม่มียอดพอสรุป — ลองขยายช่วงวัน"}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {peakDays.slice(0, 2).map((d) => (
              <li
                key={`p-${d.weekday}`}
                className="rounded-xl bg-white/80 px-3 py-2.5 text-[13px] font-semibold text-emerald-950"
              >
                วัน{d.label} ขายดี
                {d.vsAvgPct != null ? ` (${d.vsAvgPct > 0 ? "+" : ""}${d.vsAvgPct}%)` : ""}
                — {d.advice}
              </li>
            ))}
            {softDays.slice(0, 2).map((d) => (
              <li
                key={`s-${d.weekday}`}
                className="rounded-xl bg-white/80 px-3 py-2.5 text-[13px] font-semibold text-amber-950"
              >
                วัน{d.label} ยอดอ่อน
                {d.vsAvgPct != null ? ` (${d.vsAvgPct}%)` : ""}
                — {d.advice}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={plansHref}
            className="rounded-full bg-emerald-700 px-3.5 py-2 text-[12px] font-extrabold text-white"
          >
            เปิดแผนผลิต-เติม
          </Link>
          <Link
            href={parHref}
            className="rounded-full bg-white px-3.5 py-2 text-[12px] font-extrabold text-emerald-800 ring-1 ring-emerald-200"
          >
            ตั้ง{PAR_STOCK_LABEL}
          </Link>
        </div>
      </section>

      <OwnerMonthPatternSection
        data={monthPattern}
        loading={monthPatternLoading}
        periodDays={monthPeriodDays}
        onPeriodChange={setMonthPeriodDays}
      />

      <section
        className={`mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
          loading ? "opacity-70" : ""
        }`}
      >
        <h2 className="text-[15px] font-extrabold text-slate-900">
          เปรียบเทียบวันในสัปดาห์
        </h2>
        <p className="mt-0.5 text-[12px] font-medium text-slate-500">
          รวมยอดตามวันอา–ส ในช่วงที่เลือก
        </p>
        {insights.every((d) => d.revenueBaht <= 0) ? (
          <p className="py-8 text-center text-sm text-slate-400">ไม่มีข้อมูล</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex h-40 items-end gap-1.5 pb-1">
              {insights.map((d) => {
                const tone = weekdayKindTone(d.kind);
                return (
                  <div
                    key={d.weekday}
                    className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                    title={`วัน${d.label}: ${formatPrice(d.revenueBaht)} ฿`}
                  >
                    <span className="max-w-full truncate text-center text-[9px] font-bold tabular-nums text-slate-700">
                      {d.revenueBaht > 0 ? formatPrice(d.revenueBaht) : ""}
                    </span>
                    <div className="flex h-24 w-full items-end justify-center">
                      <div
                        className={`w-[70%] max-w-[1.5rem] rounded-t-md ${tone.bar}`}
                        style={{
                          height: `${Math.max(
                            d.revenueBaht > 0 ? 8 : 2,
                            (d.revenueBaht / maxWd) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700">
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {[...insights]
                .sort((a, b) => b.revenueBaht - a.revenueBaht)
                .map((d) => {
                  const tone = weekdayKindTone(d.kind);
                  return (
                    <li
                      key={`row-${d.weekday}`}
                      className="flex items-start justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[14px] font-extrabold text-slate-900">
                            วัน{d.label}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${tone.badge}`}
                          >
                            {tone.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                          {d.advice}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[14px] font-black tabular-nums text-slate-900">
                          ฿{formatPrice(d.revenueBaht)}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-500">
                          {formatPrice(d.orderCount)} บิล
                          {d.vsAvgPct != null
                            ? ` · ${d.vsAvgPct > 0 ? "+" : ""}${d.vsAvgPct}%`
                            : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </section>

      <section
        className={`mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
          loading ? "opacity-70" : ""
        }`}
      >
        <h2 className="text-[15px] font-extrabold text-slate-900">
          ช่วงวันที่ลูกค้าใช้จ่าย
        </h2>
        <p className="mt-0.5 text-[12px] font-medium text-slate-500">
          วันติดกันที่ยอดสูง/ต่ำกว่าค่าเฉลี่ยช่วงนี้
          {spend.avgDaily > 0
            ? ` · เฉลี่ย ฿${formatPrice(spend.avgDaily)}/วัน`
            : ""}
        </p>
        {spend.hot.length === 0 && spend.cool.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {loading ? "กำลังโหลด…" : "ยังจับช่วงชัดไม่ได้ — ลองเลือกช่วงยาวขึ้น"}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {spend.hot.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[12px] font-bold text-emerald-800">
                  ใช้จ่ายมาก
                </p>
                <ul className="space-y-2">
                  {spend.hot.map((r) => (
                    <li
                      key={`h-${r.from}-${r.to}`}
                      className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5"
                    >
                      <p className="text-[14px] font-extrabold text-emerald-950">
                        {r.from === r.to
                          ? r.fromLabel
                          : `${r.fromLabel} → ${r.toLabel}`}
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold text-emerald-900/80">
                        {r.dayCount} วัน · ฿{formatPrice(r.revenueBaht)} ·{" "}
                        {formatPrice(r.orderCount)} บิล
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {spend.cool.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[12px] font-bold text-amber-900">
                  ใช้จ่ายน้อย — ลดการเตรียมได้
                </p>
                <ul className="space-y-2">
                  {spend.cool.map((r) => (
                    <li
                      key={`c-${r.from}-${r.to}`}
                      className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5"
                    >
                      <p className="text-[14px] font-extrabold text-amber-950">
                        {r.from === r.to
                          ? r.fromLabel
                          : `${r.fromLabel} → ${r.toLabel}`}
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold text-amber-900/80">
                        {r.dayCount} วัน · ฿{formatPrice(r.revenueBaht)} ·{" "}
                        {formatPrice(r.orderCount)} บิล
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <div className="space-y-3">
        <OwnerDailyRevenueBars days={days} loading={loading} defaultOpen />
        <OwnerHourlyRevenueBars
          hours={hours}
          loading={loading}
          defaultOpen={from === to}
        />
      </div>

      <div className="mt-4 flex justify-center gap-4 text-[12px] font-medium text-slate-400">
        <Link href={plansHref} className="font-bold text-emerald-700">
          แผนผลิต-เติม →
        </Link>
        <Link href={homeHref} className="font-bold text-slate-600">
          ← หน้าแรก
        </Link>
      </div>
    </div>
  );
}

export default function OwnerSalesDaysPage() {
  return (
    <OwnerAppShell active="home">
      <OwnerSalesDaysInner />
    </OwnerAppShell>
  );
}
