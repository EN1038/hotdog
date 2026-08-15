"use client";

import { useCallback, useEffect, useState } from "react";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import {
  OwnerDailyRevenueBars,
  OwnerTopSellersList,
  OwnerWasteSummaryList,
} from "@/components/owner/OwnerOverviewExtras";
import {
  SalesDateRangeBar,
  SalesOverviewCards,
  SalesReportMetrics,
  SalesShareSection,
} from "@/components/merchant/SalesSummaryView";
import { bangkokDateKey } from "@/lib/constants";
import { EMPTY_SALES_REPORT_STATS } from "@/lib/sales-report-shared";
import type { OwnerDashboardPayload } from "@/lib/owner-dashboard";

function OwnerSummaryInner() {
  const { data } = useOwnerDashboard();
  const today = bangkokDateKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [payload, setPayload] = useState<OwnerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [includeTest, setIncludeTest] = useState(false);

  const load = useCallback(
    async (rangeFrom: string, rangeTo: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          from: rangeFrom,
          to: rangeTo,
        });
        if (includeTest) params.set("includeTest", "1");
        const res = await fetch(`/api/owner/dashboard?${params}`);
        if (!res.ok) return;
        const json = (await res.json()) as OwnerDashboardPayload;
        setPayload(json);
      } finally {
        setLoading(false);
      }
    },
    [includeTest],
  );

  useEffect(() => {
    void load(from, to);
  }, [load, from, to]);

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

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <h1 className="text-[20px] font-black text-slate-900">ภาพรวมร้าน</h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          ยอดขาย สต๊อก ของเสีย ค่าใช้จ่าย และสินค้าขายดี
          {hasTestBranch && !includeTest ? " (ไม่รวมสาขาทดลอง)" : ""}
        </p>
      </header>

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

      <SalesDateRangeBar
        from={from}
        to={to}
        maxDate={today}
        onFromChange={(next) => {
          setFrom(next);
          if (next > to) setTo(next);
        }}
        onToChange={setTo}
      />

      <div className="space-y-3">
        <SalesOverviewCards
          loading={loading}
          onOpenSalesDetail={() => setDetailOpen((v) => !v)}
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
          }}
        />

        <OwnerDailyRevenueBars
          days={payload?.days ?? []}
          loading={loading}
        />

        <OwnerTopSellersList
          items={payload?.topSellers ?? []}
          loading={loading}
        />

        <OwnerWasteSummaryList
          items={payload?.wasteItems ?? []}
          wasteQty={stats.wasteQty ?? 0}
          wasteValue={stats.wasteValue ?? 0}
          loading={loading}
        />

        <SalesShareSection
          title="สัดส่วนการขาย"
          slices={payload?.byPayment ?? []}
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
