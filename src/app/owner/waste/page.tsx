"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import { OwnerWasteAnalytics } from "@/components/owner/OwnerWasteAnalytics";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import { EMPTY_SALES_REPORT_STATS } from "@/lib/sales-report-shared";
import type { OwnerDashboardPayload } from "@/lib/owner-dashboard";
import {
  buildOwnerViewQuery,
  ownerSummaryHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";

function OwnerWasteInner() {
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
      router.replace(`/owner/waste${q}`, { scroll: false });
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
  const wasteQty = stats.wasteQty ?? 0;
  const wasteValue = stats.wasteValue ?? 0;
  const wasteItems = payload?.wasteItems ?? [];
  const hasTestBranch =
    payload?.hasTestBranch ??
    data?.hasTestBranch ??
    (data?.branches ?? []).some((b) => b.isTest);
  const filterBranches = (payload?.branches ?? data?.branches ?? []).filter(
    (b) =>
      !b.isHidden &&
      b.kind !== "WAREHOUSE" &&
      (includeTest || !b.isTest),
  );
  const filterBranchName = filterBranchId
    ? filterBranches.find((b) => b.id === filterBranchId)?.name
    : null;
  const compareBranches = useMemo(() => {
    if (filterBranchId) return [];
    return filterBranches.map((b) => ({ id: b.id, name: b.name }));
  }, [filterBranchId, filterBranches]);
  const byBranchSummary = payload?.byBranch ?? [];
  const summaryHref = ownerSummaryHref({
    branchId: filterBranchId,
    from,
    to,
  });
  const brandName =
    payload?.brand?.nameTh ||
    payload?.brand?.name ||
    data?.brand?.nameTh ||
    data?.brand?.name ||
    "";
  const rangeLabel = useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      if (from === to) return fmt.format(new Date(`${from}T12:00:00+07:00`));
      return `${fmt.format(new Date(`${from}T12:00:00+07:00`))} – ${fmt.format(new Date(`${to}T12:00:00+07:00`))}`;
    } catch {
      return from === to ? from : `${from} – ${to}`;
    }
  }, [from, to]);

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-orange-600/80">
          Owner · ของเสีย
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">ของเสีย</h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          รายการ · ลิสต์จำนวน · เทียบสาขา
          {hasTestBranch && !includeTest ? " · ไม่รวมสาขาทดลอง" : ""}
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
      ) : compareBranches.length > 1 ? (
        <p className="mb-3 text-[13px] font-semibold text-slate-600">
          ดูรวมทุกสาขา · เทียบสาขาได้ด้านล่าง
        </p>
      ) : null}

      <section
        className={`mb-3 grid grid-cols-2 gap-2 ${loading ? "opacity-70" : ""}`}
        aria-label="สรุปของเสีย"
      >
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-3.5 py-3.5">
          <p className="text-[12px] font-bold text-orange-800">จำนวนชิ้น</p>
          <p className="mt-1 text-[26px] font-black tabular-nums leading-none text-orange-950">
            {formatPrice(wasteQty)}
          </p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-3.5 py-3.5">
          <p className="text-[12px] font-bold text-orange-800">มูลค่า</p>
          <p className="mt-1 text-[26px] font-black tabular-nums leading-none text-orange-950">
            ฿{formatPrice(wasteValue)}
          </p>
        </div>
      </section>

      {!filterBranchId && byBranchSummary.some((b) => (b.wasteQty ?? 0) > 0) ? (
        <section className="mb-3 overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
          <p className="border-b border-orange-50 px-4 py-2.5 text-[13px] font-extrabold text-slate-800">
            สรุปต่อสาขา
          </p>
          <ul className="divide-y divide-slate-100">
            {byBranchSummary
              .filter((b) => (b.wasteQty ?? 0) > 0)
              .sort(
                (a, b) =>
                  (b.wasteQty ?? 0) - (a.wasteQty ?? 0) ||
                  (b.wasteValue ?? 0) - (a.wasteValue ?? 0),
              )
              .map((row) => (
                <li key={row.branchId}>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterBranchId(row.branchId);
                      writeViewQuery({ branchId: row.branchId });
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-orange-50/60"
                  >
                    <span className="min-w-0 truncate text-[14px] font-semibold text-slate-900">
                      {row.branchName}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[14px] font-black tabular-nums text-orange-900">
                        {formatPrice(row.wasteQty ?? 0)}
                      </span>
                      <span className="block text-[11px] font-semibold tabular-nums text-slate-500">
                        ฿{formatPrice(row.wasteValue ?? 0)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <OwnerWasteAnalytics
        items={wasteItems}
        wasteQty={wasteQty}
        wasteValue={wasteValue}
        loading={loading}
        compareBranches={compareBranches}
        rangeLabel={rangeLabel}
        brandName={brandName}
      />

      <p className="mt-4 text-center text-[12px] font-medium text-slate-400">
        <Link href={summaryHref} className="font-bold text-slate-600">
          ← กลับภาพรวมร้าน
        </Link>
      </p>
    </div>
  );
}

export default function OwnerWastePage() {
  return (
    <OwnerAppShell active="summary">
      <OwnerWasteInner />
    </OwnerAppShell>
  );
}
