"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconBack,
  IconPlus,
  IconChevronRight,
  IconClose,
} from "@/components/icons";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import { useToast } from "@/components/admin/Toast";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { LoadingState } from "@/components/LoadingState";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import type {
  OwnerBranchActiveShift,
  OwnerBranchLastClosedShift,
  OwnerBranchRow,
  OwnerBranchShare,
  OwnerDashboardPayload,
} from "@/lib/owner-dashboard";
import {
  enterOwnerStaffAndGo,
  type OwnerEnterStaffBranch,
} from "@/lib/owner-enter-staff";
import { OwnerBranchShiftLine } from "@/components/owner/OwnerBranchShiftLine";
import { OwnerBranchClosedShiftLine } from "@/components/owner/OwnerBranchClosedShiftLine";
import { branchAdminBasePath } from "@/lib/branch-admin-path";
import {
  buildOwnerViewQuery,
  ownerAgingHref,
  ownerCancelsHref,
  ownerExpensesHref,
  ownerHomeHref,
  ownerStockFlowHref,
  ownerSummaryHref,
  ownerTopSellersHref,
  ownerWasteHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";

type BranchCard = {
  id: string;
  name: string;
  isOpen: boolean;
  activeShift: OwnerBranchActiveShift | null;
  lastClosedShift: OwnerBranchLastClosedShift | null;
  completedRevenue: number;
  completedCount: number;
  openCount: number;
  cancelledCount: number;
  cashRevenue: number;
  transferRevenue: number;
  soldQty: number;
  expenseTotal: number;
  expenseCount: number;
  wasteQty: number;
  wasteValue: number;
  netAfterWaste: number;
  saleStockQty: number;
  saleStockValue: number;
};

function mergeBranchCards(
  branches: OwnerBranchRow[],
  byBranch: OwnerBranchShare[],
): BranchCard[] {
  const statsById = new Map(byBranch.map((row) => [row.branchId, row]));
  const scoped = branches.filter(
    (b) => b.kind !== "WAREHOUSE" && !b.isHidden && !b.isTest,
  );

  return scoped
    .map((b) => {
      const row = statsById.get(b.id);
      return {
        id: b.id,
        name: b.name,
        isOpen: b.isOpen,
        activeShift: b.activeShift ?? null,
        lastClosedShift: b.lastClosedShift ?? null,
        completedRevenue: row?.completedRevenue ?? 0,
        completedCount: row?.completedCount ?? 0,
        openCount: row?.openCount ?? 0,
        cancelledCount: row?.cancelledCount ?? 0,
        cashRevenue: row?.cashRevenue ?? 0,
        transferRevenue: row?.transferRevenue ?? 0,
        soldQty: row?.soldQty ?? 0,
        expenseTotal: row?.expenseTotal ?? 0,
        expenseCount: row?.expenseCount ?? 0,
        wasteQty: row?.wasteQty ?? 0,
        wasteValue: row?.wasteValue ?? 0,
        netAfterWaste: row?.netAfterWaste ?? 0,
        saleStockQty: row?.saleStockQty ?? 0,
        saleStockValue: row?.saleStockValue ?? 0,
      };
    })
    .sort((a, b) => {
      const aOpen = a.activeShift ? 1 : 0;
      const bOpen = b.activeShift ? 1 : 0;
      if (bOpen !== aOpen) return bOpen - aOpen;
      if (b.completedRevenue !== a.completedRevenue) {
        return b.completedRevenue - a.completedRevenue;
      }
      return a.name.localeCompare(b.name, "th");
    });
}

function OwnerBranchesInner() {
  const { data } = useOwnerDashboard();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey();
  const initialView = readOwnerViewRangeParams(searchParams, today);
  const [from, setFrom] = useState(initialView.from);
  const [to, setTo] = useState(initialView.to);
  const [datePreset, setDatePreset] = useState<MobileDatePresetId | null>(
    initialView.hasRange
      ? (matchMobileDatePreset(
          initialView.from,
          initialView.to,
          today,
        ) ?? "custom")
      : "today",
  );
  const [payload, setPayload] = useState<OwnerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [staffBranches, setStaffBranches] = useState<OwnerEnterStaffBranch[] | null>(
    null,
  );
  const urlReady = useRef(false);

  const writeViewQuery = useCallback(
    (next: { from?: string; to?: string }) => {
      const q = buildOwnerViewQuery({
        from: next.from ?? from,
        to: next.to ?? to,
      });
      router.replace(`/owner/branches${q}`, { scroll: false });
    },
    [from, router, to],
  );

  useEffect(() => {
    const parsed = readOwnerViewRangeParams(searchParams, today);
    if (!urlReady.current) {
      urlReady.current = true;
      return;
    }
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
  }, [from, to]);

  const branches = payload?.branches ?? data?.branches ?? [];
  const byBranch = payload?.byBranch ?? data?.byBranch ?? [];
  const cards = useMemo(
    () => mergeBranchCards(branches, byBranch),
    [branches, byBranch],
  );
  const openCount = cards.filter((c) => c.activeShift).length;
  const totalRevenue = cards.reduce((sum, c) => sum + c.completedRevenue, 0);
  const totalBills = cards.reduce((sum, c) => sum + c.completedCount, 0);
  const totalOpenBills = cards.reduce((sum, c) => sum + c.openCount, 0);
  const totalExpense = cards.reduce((sum, c) => sum + c.expenseTotal, 0);
  const totalWasteValue = cards.reduce((sum, c) => sum + c.wasteValue, 0);
  const totalStockQty = cards.reduce((sum, c) => sum + c.saleStockQty, 0);
  const stockEnabled = Boolean(payload?.stockEnabled ?? data?.stockEnabled);
  const homeHref = ownerHomeHref({ from, to, tab: "overview" });

  async function enterSell(branchId: string) {
    setEnteringId(branchId);
    try {
      const result = await enterOwnerStaffAndGo({
        branchId,
        href: "/staff/key-order/regular",
      });
      if (
        result.ok &&
        "needsBranchSelect" in result &&
        result.needsBranchSelect
      ) {
        setStaffBranches(result.branches);
        return;
      }
      if (!result.ok) {
        toast.error(result.error);
      }
    } catch {
      toast.error("เข้าโหมดขายไม่สำเร็จ");
    } finally {
      setEnteringId(null);
    }
  }

  if (loading && cards.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
        <LoadingState label="กำลังโหลดสาขา…" className="w-full max-w-sm" />
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
              รวมทุกสาขา
            </h1>
            <p className="truncate text-[12px] font-medium text-slate-500">
              {cards.length > 0
                ? `${cards.length} สาขา · เปิดรอบ ${openCount}`
                : "ยังไม่มีสาขาในร้าน"}
            </p>
          </div>
          <Link
            href="/admin"
            aria-label="เพิ่มสาขา"
            title="จัดการและเพิ่มสาขา"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-site-primary text-white shadow-sm active:opacity-90"
          >
            <IconPlus size={18} />
          </Link>
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
        />

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[1.15rem] bg-white px-3 py-3 shadow-sm ring-1 ring-slate-100">
            <p className="text-[12px] font-bold text-slate-500">ยอดรวม</p>
            <p className="mt-0.5 text-[18px] font-black tabular-nums text-site-primary">
              ฿{formatPrice(totalRevenue)}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
              {formatPrice(totalBills)} บิล
              {totalOpenBills > 0
                ? ` · ค้าง ${formatPrice(totalOpenBills)}`
                : ""}
            </p>
          </div>
          <div className="rounded-[1.15rem] bg-white px-3 py-3 shadow-sm ring-1 ring-slate-100">
            <p className="text-[12px] font-bold text-slate-500">ค่าใช้จ่าย</p>
            <p className="mt-0.5 text-[18px] font-black tabular-nums text-rose-700">
              ฿{formatPrice(totalExpense)}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
              ของเสีย ฿{formatPrice(totalWasteValue)}
              {stockEnabled
                ? ` · สต๊อก ${formatPrice(totalStockQty)}`
                : ""}
            </p>
          </div>
        </div>

        {cards.length === 0 ? (
          <div className="rounded-[1.15rem] bg-white px-4 py-10 text-center shadow-sm ring-1 ring-slate-100">
            <p className="text-sm text-slate-500">ยังไม่มีสาขาในร้าน</p>
            <Link
              href="/admin"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-site-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm active:opacity-90"
            >
              <IconPlus size={16} />
              เพิ่มสาขาแรก
            </Link>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="รายการสาขา">
            {cards.map((card, index) => {
              const rangeOpts = { branchId: card.id, from, to };
              const overviewHref = ownerHomeHref(rangeOpts);
              const wasteHref = ownerWasteHref(rangeOpts);
              const expensesHref = ownerExpensesHref(rangeOpts);
              const agingHref = ownerAgingHref({ branchId: card.id });
              const cancelsHref = ownerCancelsHref(rangeOpts);
              const stockFlowHref = ownerStockFlowHref(rangeOpts);
              const summaryHref = ownerSummaryHref(rangeOpts);
              const topSellersHref = ownerTopSellersHref(rangeOpts);
              return (
                <li key={card.id}>
                  <article className="overflow-hidden rounded-[1.15rem] bg-white shadow-sm ring-1 ring-slate-100">
                    <Link
                      href={overviewHref}
                      className="block px-4 py-3.5 active:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[12px] font-bold tabular-nums text-slate-400">
                              #{index + 1}
                            </span>
                            <h2 className="truncate text-[16px] font-extrabold text-slate-900">
                              {card.name}
                            </h2>
                            {card.activeShift ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                เปิดรอบ
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-[12px] font-semibold text-slate-500">
                            {card.activeShift ? (
                              <OwnerBranchShiftLine shift={card.activeShift} />
                            ) : (
                              <OwnerBranchClosedShiftLine
                                shift={card.lastClosedShift}
                              />
                            )}
                            {card.openCount > 0
                              ? ` · ค้าง ${formatPrice(card.openCount)} บิล`
                              : ""}
                            {card.cancelledCount > 0
                              ? ` · ยกเลิก ${formatPrice(card.cancelledCount)}`
                              : ""}
                          </div>
                        </div>
                        <IconChevronRight
                          size={18}
                          className="mt-1 shrink-0 text-slate-300"
                          aria-hidden
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500">
                            ยอดขาย
                          </p>
                          <p className="mt-0.5 text-[15px] font-black tabular-nums text-site-primary">
                            ฿{formatPrice(card.completedRevenue)}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                            {formatPrice(card.completedCount)} บิล
                            {card.soldQty > 0
                              ? ` · ${formatPrice(card.soldQty)} ชิ้น`
                              : ""}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500">
                            จ่าย · เสีย
                          </p>
                          <p className="mt-0.5 text-[15px] font-black tabular-nums text-rose-700">
                            ฿{formatPrice(card.expenseTotal)}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-orange-700/80">
                            เสีย ฿{formatPrice(card.wasteValue)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500">
                            {stockEnabled ? "สต๊อกขาย" : "เหลือสุทธิ"}
                          </p>
                          {stockEnabled ? (
                            <>
                              <p className="mt-0.5 text-[15px] font-black tabular-nums text-violet-700">
                                {formatPrice(card.saleStockQty)}
                              </p>
                              <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                                ฿{formatPrice(card.saleStockValue)}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="mt-0.5 text-[15px] font-black tabular-nums text-sky-800">
                                ฿{formatPrice(card.netAfterWaste)}
                              </p>
                              <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                                ขาย−จ่าย−เสีย
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>

                    <div className="grid grid-cols-4 border-t border-slate-100 text-center text-[11px] font-bold">
                      <Link
                        href={summaryHref}
                        className="py-2.5 text-site-primary-medium active:bg-site-primary-soft"
                      >
                        ยอดขาย
                      </Link>
                      <Link
                        href={stockEnabled ? stockFlowHref : topSellersHref}
                        className="border-l border-slate-100 py-2.5 text-violet-800 active:bg-violet-50"
                      >
                        {stockEnabled ? "สต๊อก" : "ขายดี"}
                      </Link>
                      <Link
                        href={expensesHref}
                        className="border-l border-slate-100 py-2.5 text-rose-800 active:bg-rose-50"
                      >
                        จ่าย
                      </Link>
                      <button
                        type="button"
                        disabled={enteringId === card.id}
                        onClick={() => void enterSell(card.id)}
                        className="border-l border-slate-100 py-2.5 text-site-primary active:bg-slate-50 disabled:opacity-60"
                      >
                        {enteringId === card.id ? "…" : "ขาย"}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 border-t border-slate-100 text-center text-[11px] font-semibold text-slate-600">
                      <Link
                        href={wasteHref}
                        className="py-2 active:bg-orange-50"
                      >
                        ของเสีย
                      </Link>
                      <Link
                        href={stockEnabled ? agingHref : cancelsHref}
                        className="border-l border-slate-100 py-2 active:bg-violet-50"
                      >
                        {stockEnabled ? "ค้างอายุ" : "ยกเลิก"}
                      </Link>
                      <Link
                        href={branchAdminBasePath(card.id, { ownerShell: true })}
                        className="border-l border-slate-100 py-2 active:bg-slate-50"
                      >
                        จัดการ
                      </Link>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {staffBranches ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold text-slate-900">
                เลือกสาขาที่จะขาย
              </p>
              <button
                type="button"
                onClick={() => setStaffBranches(null)}
                aria-label="ปิด"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="space-y-2">
              {staffBranches.map((b) => (
                <button
                  key={b.branchId}
                  type="button"
                  onClick={() => {
                    setStaffBranches(null);
                    void enterSell(b.branchId);
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left active:bg-slate-100"
                >
                  <span className="font-semibold text-slate-900">
                    {b.branchName}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {b.isOpen ? "เปิด" : "ปิด"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function OwnerBranchesPage() {
  return (
    <OwnerAppShell active="home">
      <OwnerBranchesInner />
    </OwnerAppShell>
  );
}
