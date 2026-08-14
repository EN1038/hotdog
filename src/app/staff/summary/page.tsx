"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { StaffShiftSummarySheet } from "@/components/staff/StaffShiftSummarySheet";
import { StaffDailySalesSummarySheet } from "@/components/staff/StaffDailySalesSummarySheet";
import { StaffExpensesSheet } from "@/components/staff/StaffExpensesSheet";
import { StaffSalesHistoryPanel } from "@/components/staff/StaffSalesHistoryPanel";
import {
  SalesOverviewCards,
  SalesDateRangeBar,
  SalesReportMetrics,
  SalesShareSection,
} from "@/components/merchant/SalesSummaryView";
import { bangkokDateKey } from "@/lib/constants";
import {
  EMPTY_SALES_REPORT_STATS,
  type SalesReportStats,
} from "@/lib/sales-report-shared";
import type { SalesShareSlice } from "@/lib/sales-share";

type SummaryPayload = {
  from: string;
  to: string;
  brandName: string;
  branchName: string;
  stockEnabled: boolean;
  saleStockQty: number;
  saleStockValue: number;
  stats: SalesReportStats;
  byChannel: SalesShareSlice[];
  byPayment: SalesShareSlice[];
};

type BrandingMeta = {
  stockEnabled?: boolean;
  brandStockEnabled?: boolean;
};

type SummaryTab = "overview" | "history";

export default function StaffSummaryPage() {
  const router = useRouter();
  const today = bangkokDateKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<SummaryTab>("overview");
  const [payload, setPayload] = useState<SummaryPayload | null>(null);
  const [meta, setMeta] = useState<BrandingMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [dailySalesOpen, setDailySalesOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);

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

  if (loading && !payload) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  const stockOn = Boolean(
    payload?.stockEnabled ??
      (meta?.stockEnabled && meta?.brandStockEnabled),
  );
  const stats = payload?.stats ?? EMPTY_SALES_REPORT_STATS;

  return (
    <StaffAppShell active="summary">
      <div className="px-4 pb-6 pt-4">
        <header className="mb-4">
          <h1 className="text-[20px] font-black text-slate-900">
            {tab === "history" ? "ประวัติการขาย" : "สรุปภาพรวมสาขา"}
          </h1>
          <p className="mt-1 text-[14px] font-medium text-slate-500">
            {tab === "history"
              ? "ดูรอบขาย ออเดอร์ และแชร์บิล ตามช่วงวันที่เลือก"
              : `ยอดขาย ค่าใช้จ่าย${stockOn ? " และสต๊อกขาย" : ""} ของสาขานี้`}
          </p>
        </header>

        <div className="mb-4 flex rounded-full bg-slate-100 p-1.5">
          {(
            [
              { id: "overview", label: "ภาพรวม" },
              { id: "history", label: "ประวัติการขาย" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex-1 rounded-full py-3 text-[15px] font-extrabold ${
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
            setFrom(next);
            if (next > to) setTo(next);
          }}
          onToChange={setTo}
        />

        {tab === "history" ? (
          <p className="-mt-2 mb-3 text-[12px] font-medium text-slate-500">
            ช่วงวันที่กรองรายการรอบขายและบิล — กดรอบเพื่อดูบิลในรอบนั้น
          </p>
        ) : null}

        {tab === "overview" ? (
          <>
            <SalesOverviewCards
              loading={loading}
              onOpenSalesDetail={() => setDetailOpen((v) => !v)}
              data={{
                stockEnabled: stockOn,
                saleStockQty: payload?.saleStockQty ?? 0,
                saleStockValue: payload?.saleStockValue ?? 0,
                completedRevenue: stats.completedRevenue,
                cashRevenue: stats.cashRevenue,
                transferRevenue: stats.transferRevenue,
                soldQty: stats.soldQty,
                expenseTotal: stats.expenseTotal,
                expenseCount: stats.expenseCount,
                cashExpense: stats.cashExpense,
                transferExpense: stats.transferExpense,
                wasteQty: stats.wasteQty,
                wasteValue: stats.wasteValue,
                netAfterExpenses: stats.netAfterExpenses,
              }}
            />

            {detailOpen ? (
              <div className="mt-4">
                <SalesReportMetrics
                  stats={stats}
                  byChannel={payload?.byChannel ?? []}
                  byPayment={payload?.byPayment ?? []}
                />
              </div>
            ) : (
              <div className="mt-2">
                <SalesShareSection
                  title="ช่องทางการขาย"
                  slices={payload?.byChannel ?? []}
                  totalRevenue={stats.completedRevenue}
                  chartStyle="donut"
                />
                <SalesShareSection
                  title="สัดส่วนการขาย"
                  slices={payload?.byPayment ?? []}
                  totalRevenue={stats.completedRevenue}
                  chartStyle="donut"
                />
              </div>
            )}

            <p className="mb-3 mt-6 text-base font-extrabold text-slate-800">
              งานอื่น
            </p>
            <button
              type="button"
              onClick={() => setSummaryOpen(true)}
              className="mb-3 flex w-full items-center justify-between rounded-2xl bg-site-primary px-4 py-5 text-left text-white shadow-sm"
            >
              <div>
                <p className="text-[19px] font-black">สรุปยอดขายตามรอบ</p>
                <p className="mt-1 text-[13px] font-medium text-white/85">
                  ดูรายงานรายได้ประจำรอบ
                </p>
              </div>
              <span className="text-3xl" aria-hidden>
                📊
              </span>
            </button>
            <div className="grid grid-cols-2 gap-3">
              {stockOn ? (
                <button
                  type="button"
                  onClick={() => setDailySalesOpen(true)}
                  className="min-h-[5rem] rounded-2xl border border-slate-200 bg-white px-3.5 py-4 text-left shadow-sm"
                >
                  <p className="text-[17px] font-extrabold text-slate-900">
                    สรุปสต๊อก
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-slate-500">
                    สร้างสรุปสิ้นวัน
                  </p>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setExpensesOpen(true)}
                className="min-h-[5rem] rounded-2xl border border-slate-200 bg-white px-3.5 py-4 text-left shadow-sm"
              >
                <p className="text-[17px] font-extrabold text-slate-900">
                  ค่าใช้จ่าย
                </p>
                <p className="mt-1 text-[13px] font-medium text-slate-500">
                  บันทึกและดูยอด
                </p>
              </button>
            </div>
          </>
        ) : (
          <StaffSalesHistoryPanel
            from={from}
            to={to}
            brandName={payload?.brandName}
            branchName={payload?.branchName}
          />
        )}

        <StaffShiftSummarySheet
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          initialDate={to}
          brandName={payload?.brandName ?? ""}
          branchName={payload?.branchName ?? ""}
        />
        <StaffDailySalesSummarySheet
          open={dailySalesOpen}
          onClose={() => setDailySalesOpen(false)}
          initialDate={to}
          brandName={payload?.brandName ?? ""}
          branchName={payload?.branchName ?? ""}
        />
        <StaffExpensesSheet
          open={expensesOpen}
          onClose={() => setExpensesOpen(false)}
          initialDate={to}
        />
      </div>
    </StaffAppShell>
  );
}
