"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import {
  OwnerAgingAttentionCard,
  OwnerCancelSummary,
  OwnerDailyRevenueBars,
  OwnerHourlyRevenueBars,
  OwnerTopSellersList,
  OwnerWeekdayRevenueBars,
} from "@/components/owner/OwnerOverviewExtras";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import {
  SalesOverviewCards,
  SalesReportMetrics,
  SalesShareSection,
} from "@/components/merchant/SalesSummaryView";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import { EMPTY_SALES_REPORT_STATS } from "@/lib/sales-report-shared";
import type { OwnerDashboardPayload } from "@/lib/owner-dashboard";
import {
  buildOwnerViewQuery,
  ownerAgingHref,
  ownerCancelsHref,
  ownerExpensesHref,
  ownerStockFlowHref,
  ownerTopSellersHref,
  ownerWasteHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";

function OwnerSummaryInner() {
  const { data } = useOwnerDashboard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey();
  const initial = readOwnerViewRangeParams(searchParams, today);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [datePreset, setDatePreset] = useState<MobileDatePresetId | null>(
    initial.hasRange
      ? (matchMobileDatePreset(initial.from, initial.to, today) ?? "custom")
      : "today",
  );
  const [filterBranchId, setFilterBranchId] = useState<string | null>(
    initial.branchId,
  );
  const [payload, setPayload] = useState<OwnerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [includeTest, setIncludeTest] = useState(false);
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
      router.replace(`/owner/summary${q}`, { scroll: false });
    },
    [filterBranchId, from, router, to],
  );

  useEffect(() => {
    const parsed = readOwnerViewRangeParams(searchParams, today);
    if (!urlReady.current) {
      urlReady.current = true;
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
  }, [searchParams, today]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({ from, to });
        if (includeTest) params.set("includeTest", "1");
        if (filterBranchId) params.set("branchId", filterBranchId);
        const res = await fetch(`/api/owner/dashboard?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok || ac.signal.aborted) return;
        const json = (await res.json()) as OwnerDashboardPayload;
        if (ac.signal.aborted) return;
        setPayload(json);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [from, to, filterBranchId, includeTest]);

  const stats = payload?.stats ?? data?.stats ?? EMPTY_SALES_REPORT_STATS;
  const hasTestBranch =
    payload?.hasTestBranch ??
    data?.hasTestBranch ??
    (data?.branches ?? []).some((b) => b.isTest);
  const byBranch = (payload?.byBranch ?? []).map((row) => ({
    key: row.branchId,
    label: row.branchName,
    completedRevenue: row.completedRevenue,
    completedCount: row.completedCount,
  }));
  const stockEnabled = Boolean(payload?.stockEnabled);
  const filterBranches = (payload?.branches ?? data?.branches ?? []).filter(
    (b) =>
      !b.isHidden &&
      b.kind !== "WAREHOUSE" &&
      (includeTest || !b.isTest),
  );
  const liveBranchCount = filterBranches.length;
  const filterBranchName = filterBranchId
    ? filterBranches.find((b) => b.id === filterBranchId)?.name
    : null;
  const wasteHref = ownerWasteHref({
    branchId: filterBranchId,
    from,
    to,
  });
  const expenseHref = ownerExpensesHref({
    branchId: filterBranchId,
    from,
    to,
  });
  const cancelHref = ownerCancelsHref({
    branchId: filterBranchId,
    from,
    to,
  });
  const agingHref = ownerAgingHref({ branchId: filterBranchId });
  const stockHref = ownerStockFlowHref({
    branchId: filterBranchId,
    from,
    to,
  });
  const topSellersHref = ownerTopSellersHref({
    branchId: filterBranchId,
    from,
    to,
  });

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <h1 className="text-[20px] font-black text-slate-900">ภาพรวมร้าน</h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          ยอดสุทธิ · ประเภทบิล · วันในสัปดาห์ · ชั่วโมง · สต๊อก
          {hasTestBranch && !includeTest ? " (ไม่รวมสาขาทดลอง)" : ""}
        </p>
      </header>

      {liveBranchCount > 1 && !filterBranchId ? (
        <Link
          href="/owner/branches"
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 active:bg-emerald-100"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-emerald-950">
              รวม {liveBranchCount} สาขา
            </p>
            <p className="mt-0.5 text-[12px] font-semibold text-emerald-800/80">
              ดูการ์ดรายสาขา · กดเพื่อกรองดูยอดสาขานั้น
            </p>
          </div>
          <span className="shrink-0 text-lg font-bold text-emerald-700" aria-hidden>
            ›
          </span>
        </Link>
      ) : null}

      {hasTestBranch ? (
        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-950">
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(e) => setIncludeTest(e.target.checked)}
          />
          รวมข้อมูลสาขาทดลอง
        </label>
      ) : null}

      <MobileDateRangeControl
        todayKey={today}
        from={from}
        to={to}
        preset={datePreset}
        maxDate={today}
        onChange={({ from: nextFrom, to: nextTo, preset }) => {
          setDatePreset(preset);
          setFrom(nextFrom);
          setTo(nextTo);
          writeViewQuery({ from: nextFrom, to: nextTo });
        }}
        trailing={
          <OwnerBranchFilterBar
            branches={filterBranches}
            value={filterBranchId}
            onChange={(id) => {
              setFilterBranchId(id);
              writeViewQuery({ branchId: id });
            }}
          />
        }
      />

      {filterBranchName ? (
        <p className="mb-3 text-[13px] font-semibold text-emerald-800">
          กำลังดูสาขา · {filterBranchName}
        </p>
      ) : null}

      <div className="space-y-3">
        <SalesOverviewCards
          loading={loading}
          onOpenSalesDetail={() => setDetailOpen((v) => !v)}
          wasteHref={wasteHref}
          expenseHref={expenseHref}
          cancelHref={cancelHref}
          stockHref={stockHref}
          data={{
            stockEnabled,
            saleStockQty: payload?.saleStockQty ?? 0,
            saleStockValue: payload?.saleStockValue ?? 0,
            completedRevenue: stats.completedRevenue ?? 0,
            cashRevenue: stats.cashRevenue ?? 0,
            transferRevenue: stats.transferRevenue ?? 0,
            soldQty: stats.soldQty ?? 0,
            expenseTotal: stats.expenseTotal ?? 0,
            expenseCount: stats.expenseCount ?? 0,
            cashExpense: stats.cashExpense ?? 0,
            transferExpense: stats.transferExpense ?? 0,
            wasteQty: stats.wasteQty ?? 0,
            wasteValue: stats.wasteValue ?? 0,
            netAfterExpenses: stats.netAfterExpenses ?? 0,
            netAfterWaste: stats.netAfterWaste,
            cancelledCount: stats.cancelledCount ?? 0,
            cancelledRevenue: stats.cancelledRevenue ?? 0,
          }}
        />

        <Link
          href={expenseHref}
          className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 active:bg-rose-100"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-rose-950">
              รายการค่าใช้จ่าย
            </p>
            <p className="mt-0.5 text-[12px] font-semibold text-rose-800/80">
              {formatPrice(stats.expenseCount ?? 0)} รายการ · ฿
              {formatPrice(stats.expenseTotal ?? 0)} · กดดูรายละเอียด
            </p>
          </div>
          <span className="shrink-0 text-lg font-bold text-rose-700" aria-hidden>
            ›
          </span>
        </Link>

        <Link
          href={wasteHref}
          className="flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3.5 active:bg-orange-100"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-orange-950">
              รายการของเสีย
            </p>
            <p className="mt-0.5 text-[12px] font-semibold text-orange-800/80">
              {formatPrice(stats.wasteQty ?? 0)} ชิ้น · ฿
              {formatPrice(stats.wasteValue ?? 0)} · กดดูรายละเอียด
            </p>
          </div>
          <span className="shrink-0 text-lg font-bold text-orange-700" aria-hidden>
            ›
          </span>
        </Link>

        <Link
          href={cancelHref}
          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 active:bg-slate-100"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-slate-900">
              บิลที่ยกเลิก
            </p>
            <p className="mt-0.5 text-[12px] font-semibold text-slate-600">
              {formatPrice(stats.cancelledCount ?? 0)} บิล · ฿
              {formatPrice(stats.cancelledRevenue ?? 0)} · กดดูเหตุผล
            </p>
          </div>
          <span className="shrink-0 text-lg font-bold text-slate-500" aria-hidden>
            ›
          </span>
        </Link>

        <Link
          href={agingHref}
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 active:bg-amber-100"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-amber-950">
              สต๊อกค้างอายุ
            </p>
            <p className="mt-0.5 text-[12px] font-semibold text-amber-800/80">
              {payload?.aging?.stockActive
                ? `ต้องดู ${payload.aging.attentionCount} รายการ · กดดูรายละเอียด`
                : "กดดูสถานะสต๊อกค้างอายุ"}
            </p>
          </div>
          <span className="shrink-0 text-lg font-bold text-amber-700" aria-hidden>
            ›
          </span>
        </Link>

        <OwnerAgingAttentionCard
          aging={payload?.aging}
          loading={loading}
          href={agingHref}
        />

        <OwnerCancelSummary
          cancelledCount={stats.cancelledCount ?? 0}
          cancelledRevenue={stats.cancelledRevenue ?? 0}
          reasons={payload?.cancelReasons ?? []}
          loading={loading}
        />

        <OwnerDailyRevenueBars
          days={payload?.days ?? []}
          loading={loading}
        />

        <OwnerWeekdayRevenueBars
          weekdays={payload?.weekdays ?? []}
          loading={loading}
        />

        <OwnerHourlyRevenueBars
          hours={payload?.hours ?? []}
          loading={loading}
        />

        <Link
          href={topSellersHref}
          className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 active:bg-emerald-100"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-emerald-950">
              วิเคราะห์เมนูขายดี
            </p>
            <p className="mt-0.5 text-[12px] font-semibold text-emerald-800/80">
              ค้นหา · เรียงลำดับ · เทียบสาขา
            </p>
          </div>
          <span className="shrink-0 text-lg font-bold text-emerald-700" aria-hidden>
            ›
          </span>
        </Link>

        <OwnerTopSellersList
          items={payload?.topSellers ?? []}
          loading={loading}
          href={topSellersHref}
        />

        <SalesShareSection
          title="สัดส่วนการชำระ"
          slices={payload?.byPayment ?? []}
          totalRevenue={stats.completedRevenue ?? 0}
          chartStyle="donut"
        />
        <SalesShareSection
          title="ประเภทบิล"
          slices={payload?.byFulfillment ?? []}
          totalRevenue={stats.completedRevenue ?? 0}
          chartStyle="donut"
        />
        <SalesShareSection
          title="ช่องทางการขาย"
          slices={payload?.byChannel ?? []}
          totalRevenue={stats.completedRevenue ?? 0}
          chartStyle="donut"
        />

        {detailOpen ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <SalesReportMetrics
              stats={{ ...EMPTY_SALES_REPORT_STATS, ...stats }}
              byChannel={payload?.byChannel ?? []}
              byPayment={payload?.byPayment ?? []}
              byBranch={byBranch}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function OwnerSummaryPage() {
  return (
    <OwnerAppShell active="summary">
      <OwnerSummaryInner />
    </OwnerAppShell>
  );
}
