"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import {
  OwnerDailyRevenueBars,
  OwnerHourlyRevenueBars,
  OwnerWeekdayRevenueBars,
} from "@/components/owner/OwnerOverviewExtras";
import { OwnerHomeTopSellersPanel } from "@/components/owner/OwnerHomeTopSellersPanel";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import {
  SalesOverviewCards,
  SalesShareSection,
} from "@/components/merchant/SalesSummaryView";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import type { OwnerDashboardPayload } from "@/lib/owner-dashboard";
import { LoadingState } from "@/components/LoadingState";
import {
  buildOwnerViewQuery,
  ownerAgingHref,
  ownerCancelsHref,
  ownerExpensesHref,
  ownerHomeHref,
  ownerStockFlowHref,
  ownerTopSellersHref,
  ownerWasteHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";
import {
  IconBack,
  IconBoxes,
  IconClipboard,
  IconExpense,
  IconReceipt,
  IconWaste,
} from "@/components/icons";

function ShortcutTile({
  href,
  title,
  value,
  icon,
  toneClass,
}: {
  href: string;
  title: string;
  value: string;
  icon: ReactNode;
  toneClass: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[1.15rem] bg-white px-3 py-3.5 shadow-sm ring-1 ring-slate-100 active:bg-slate-50"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${toneClass}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-slate-500">{title}</p>
        <p className="mt-0.5 truncate text-[14px] font-extrabold tabular-nums text-[#0b2a4a]">
          {value}
        </p>
      </div>
    </Link>
  );
}

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

  const stats = payload?.stats ?? data?.stats ?? null;
  const stockEnabled = Boolean(payload?.stockEnabled ?? data?.stockEnabled);
  const filterBranches = (payload?.branches ?? data?.branches ?? []).filter(
    (b) => !b.isHidden && b.kind !== "WAREHOUSE" && !b.isTest,
  );
  const liveBranchCount = filterBranches.length;
  const filterBranchName = filterBranchId
    ? filterBranches.find((b) => b.id === filterBranchId)?.name
    : null;
  const multiDay = from !== to;
  const wasteHref = ownerWasteHref({ branchId: filterBranchId, from, to });
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
  const homeHref = ownerHomeHref({
    branchId: filterBranchId,
    from,
    to,
    tab: "overview",
  });

  if (loading && !stats) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
        <LoadingState label="กำลังโหลดสรุปยอด…" className="w-full max-w-sm" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
        <LoadingState label="กำลังโหลดสรุปยอด…" className="w-full max-w-sm" />
      </div>
    );
  }

  return (
    <div className="pb-6">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="flex items-center gap-2 px-4 pb-3 pt-3">
          <Link
            href={homeHref}
            aria-label="กลับ"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 active:bg-slate-200"
          >
            <IconBack size={22} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-black text-slate-900">
              ภาพรวมร้าน
            </h1>
            {filterBranchName ? (
              <p className="truncate text-[12px] font-medium text-slate-500">
                {filterBranchName}
              </p>
            ) : liveBranchCount > 1 ? (
              <p className="truncate text-[12px] font-medium text-slate-500">
                {liveBranchCount} สาขา
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <div
        className={`space-y-3 px-4 pt-3 transition-opacity ${loading ? "opacity-70" : ""}`}
      >
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

        <SalesOverviewCards
          loading={loading}
          wasteHref={wasteHref}
          expenseHref={expenseHref}
          cancelHref={cancelHref}
          stockHref={stockHref}
          data={{
            stockEnabled,
            saleStockQty: payload?.saleStockQty ?? data?.saleStockQty ?? 0,
            saleStockValue: payload?.saleStockValue ?? data?.saleStockValue ?? 0,
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

        <div className="grid grid-cols-2 gap-2">
          <ShortcutTile
            href={expenseHref}
            title="บัญชี"
            value={`฿${formatPrice(stats.expenseTotal ?? 0)}`}
            icon={<IconExpense size={18} />}
            toneClass="bg-rose-50 text-rose-700"
          />
          <ShortcutTile
            href={wasteHref}
            title="ของเสีย"
            value={`${formatPrice(stats.wasteQty ?? 0)} ชิ้น`}
            icon={<IconWaste size={18} />}
            toneClass="bg-orange-50 text-orange-700"
          />
          <ShortcutTile
            href={cancelHref}
            title="ยกเลิก"
            value={`${formatPrice(stats.cancelledCount ?? 0)} บิล`}
            icon={<IconClipboard size={18} />}
            toneClass="bg-slate-100 text-slate-700"
          />
          <ShortcutTile
            href={agingHref}
            title="ค้างอายุ"
            value={
              payload?.aging?.stockActive
                ? `${payload.aging.attentionCount} รายการ`
                : "ดูสถานะ"
            }
            icon={<IconBoxes size={18} />}
            toneClass="bg-amber-50 text-amber-800"
          />
        </div>

        {multiDay ? (
          <OwnerDailyRevenueBars
            days={payload?.days ?? []}
            loading={loading}
            collapsible={false}
          />
        ) : null}

        <OwnerWeekdayRevenueBars
          weekdays={payload?.weekdays ?? []}
          loading={loading}
          collapsible={false}
        />

        <OwnerHourlyRevenueBars
          hours={payload?.hours ?? []}
          loading={loading}
          collapsible={false}
        />

        <OwnerHomeTopSellersPanel
          from={from}
          to={to}
          branchId={filterBranchId}
          href={topSellersHref}
          title="เมนูขายดี"
          linkLabel="วิเคราะห์"
          limit={10}
          collapsible={false}
        />

        {(payload?.byPayment?.length ?? 0) > 0 ? (
          <SalesShareSection
            title="การชำระ"
            slices={payload?.byPayment ?? []}
            totalRevenue={stats.completedRevenue ?? 0}
            chartStyle="donut"
            cardChrome
            collapsible={false}
            icon={<IconReceipt size={20} />}
          />
        ) : null}

        {(payload?.byFulfillment?.length ?? 0) > 0 ? (
          <SalesShareSection
            title="ประเภทบิล"
            slices={payload?.byFulfillment ?? []}
            totalRevenue={stats.completedRevenue ?? 0}
            chartStyle="donut"
            cardChrome
            collapsible={false}
            icon={<IconClipboard size={20} />}
          />
        ) : null}

        {(payload?.byChannel?.length ?? 0) > 0 ? (
          <SalesShareSection
            title="ช่องทางขาย"
            slices={payload?.byChannel ?? []}
            totalRevenue={stats.completedRevenue ?? 0}
            chartStyle="donut"
            cardChrome
            collapsible={false}
            icon={<IconBoxes size={20} />}
          />
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
