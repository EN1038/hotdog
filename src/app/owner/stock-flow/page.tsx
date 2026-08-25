"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import {
  StockFlowAnalyticsPanel,
  type StockFlowAnalyticsData,
  type StockFlowMetricKey,
} from "@/components/merchant/StockFlowAnalyticsPanel";
import { bangkokDateKey } from "@/lib/constants";
import type { OwnerBranchRow } from "@/lib/owner-dashboard";
import {
  buildOwnerViewQuery,
  ownerAgingHref,
  ownerHomeHref,
  ownerStockHref,
  ownerTopSellersHref,
  ownerWasteHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";

type StockFlowPayload = StockFlowAnalyticsData & {
  hasTestBranch?: boolean;
  branchesMeta?: OwnerBranchRow[];
};

function OwnerStockFlowInner() {
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
  const [payload, setPayload] = useState<StockFlowPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [includeTest, setIncludeTest] = useState(false);
  const [compareMetric, setCompareMetric] =
    useState<StockFlowMetricKey>("stock");
  const urlReady = useRef(false);

  const writeViewQuery = useCallback(
    (next: {
      branchId?: string | null;
      from?: string;
      to?: string;
    }) => {
      const query = buildOwnerViewQuery({
        branchId:
          next.branchId !== undefined ? next.branchId : filterBranchId,
        from: next.from ?? from,
        to: next.to ?? to,
      });
      router.replace(`/owner/stock-flow${query}`, { scroll: false });
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
        const res = await fetch(`/api/owner/stock-flow?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok || ac.signal.aborted) return;
        const json = (await res.json()) as StockFlowPayload;
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

  const hasTestBranch =
    payload?.hasTestBranch ??
    data?.hasTestBranch ??
    (data?.branches ?? []).some((b) => b.isTest);
  const filterBranches = (payload?.branchesMeta ?? data?.branches ?? []).filter(
    (b) =>
      !b.isHidden &&
      b.kind !== "WAREHOUSE" &&
      (includeTest || !b.isTest),
  );
  const filterBranchName = filterBranchId
    ? filterBranches.find((b) => b.id === filterBranchId)?.name
    : null;
  const rangeOpts = { branchId: filterBranchId, from, to };
  const homeHref = ownerHomeHref(rangeOpts);
  const stockEnabled = data?.subscription?.stockEnabled !== false;

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(homeHref);
  }

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-violet-700/80">
          Owner · สต๊อก
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">
          วิเคราะห์สต๊อก
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          รับเข้า · จ่าย · ขาย · เสีย · คงเหลือ · มูลค่า · เทียบสาขา
          {hasTestBranch && !includeTest ? " · ไม่รวมสาขาทดลอง" : ""}
        </p>
        <button
          type="button"
          onClick={goBack}
          className="mt-2 inline-block text-[13px] font-bold text-slate-500"
        >
          ← กลับ
        </button>
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
        <p className="mb-3 text-[13px] font-semibold text-violet-800">
          กำลังดูสาขา · {filterBranchName}
        </p>
      ) : null}

      <StockFlowAnalyticsPanel
        data={payload}
        loading={loading}
        filterBranches={filterBranches}
        compareMetric={compareMetric}
        onCompareMetricChange={setCompareMetric}
        filterBranchName={filterBranchName}
        links={{
          waste: ownerWasteHref(rangeOpts),
          topSellers: ownerTopSellersHref(rangeOpts),
          aging: stockEnabled
            ? ownerAgingHref({ branchId: filterBranchId })
            : undefined,
          manageStock: ownerStockHref({ branchId: filterBranchId }),
        }}
      />
    </div>
  );
}

export default function OwnerStockFlowPage() {
  return (
    <OwnerAppShell active="home">
      <OwnerStockFlowInner />
    </OwnerAppShell>
  );
}
