"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import { OwnerCancelSummary } from "@/components/owner/OwnerOverviewExtras";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import { EMPTY_SALES_REPORT_STATS } from "@/lib/sales-report-shared";
import type { OwnerDashboardPayload } from "@/lib/owner-dashboard";
import {
  buildOwnerViewQuery,
  ownerSummaryHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";

function OwnerCancelsInner() {
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
      router.replace(`/owner/cancels${q}`, { scroll: false });
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
  }, [from, to, filterBranchId]);

  const stats = payload?.stats ?? data?.stats ?? EMPTY_SALES_REPORT_STATS;
  const filterBranches = (payload?.branches ?? data?.branches ?? []).filter(
    (b) => !b.isHidden && b.kind !== "WAREHOUSE" && !b.isTest,
  );
  const filterBranchName = filterBranchId
    ? filterBranches.find((b) => b.id === filterBranchId)?.name
    : null;
  const summaryHref = ownerSummaryHref({
    branchId: filterBranchId,
    from,
    to,
  });

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">
          Owner · ยกเลิกบิล
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">
          บิลที่ยกเลิก
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          จำนวน · มูลค่า · เหตุผล ตามช่วงวันที่เลือก
        </p>
      </header>

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

      <section
        className={`mb-3 grid grid-cols-2 gap-2 ${loading ? "opacity-70" : ""}`}
      >
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3.5">
          <p className="text-[12px] font-bold text-slate-600">จำนวนบิล</p>
          <p className="mt-1 text-[26px] font-black tabular-nums text-slate-900">
            {formatPrice(stats.cancelledCount ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3.5">
          <p className="text-[12px] font-bold text-slate-600">มูลค่า</p>
          <p className="mt-1 text-[26px] font-black tabular-nums text-slate-900">
            ฿{formatPrice(stats.cancelledRevenue ?? 0)}
          </p>
        </div>
      </section>

      <OwnerCancelSummary
        cancelledCount={stats.cancelledCount ?? 0}
        cancelledRevenue={stats.cancelledRevenue ?? 0}
        reasons={payload?.cancelReasons ?? []}
        loading={loading}
        defaultOpen
      />

      <p className="mt-4 text-center text-[12px] font-medium text-slate-400">
        <Link href={summaryHref} className="font-bold text-slate-600">
          ← กลับภาพรวมร้าน
        </Link>
      </p>
    </div>
  );
}

export default function OwnerCancelsPage() {
  return (
    <OwnerAppShell active="summary">
      <OwnerCancelsInner />
    </OwnerAppShell>
  );
}
