"use client";

import { useCallback, useEffect, useState } from "react";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import {
  SalesDateRangeBar,
  SalesOverviewCards,
  SalesReportMetrics,
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

  const load = useCallback(async (period: "day" | "month") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/owner/dashboard?period=${period}`);
      if (!res.ok) return;
      const json = (await res.json()) as OwnerDashboardPayload;
      setPayload(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sameDay = from === to && to === today;
    void load(sameDay ? "day" : "month");
  }, [load, from, to, today]);

  const stats = payload?.stats ?? data?.stats ?? EMPTY_SALES_REPORT_STATS;
  const byBranch = (payload?.byBranch ?? []).map((row) => ({
    key: row.branchId,
    label: row.branchName,
    completedRevenue: row.completedRevenue,
    completedCount: row.completedCount,
  }));

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <h1 className="text-[20px] font-black text-slate-900">
          สรุปภาพรวมแบรนด์
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          ยอดขาย ค่าใช้จ่าย รวมทุกสาขาของแบรนด์นี้
        </p>
      </header>

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

      <SalesOverviewCards
        loading={loading}
        onOpenSalesDetail={() => setDetailOpen((v) => !v)}
        data={{
          stockEnabled: false,
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

      {detailOpen ? (
        <div className="mt-4">
          <SalesReportMetrics
            stats={{ ...EMPTY_SALES_REPORT_STATS, ...stats }}
            byChannel={payload?.byChannel ?? []}
            byPayment={payload?.byPayment ?? []}
            byBranch={byBranch}
          />
        </div>
      ) : null}
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
