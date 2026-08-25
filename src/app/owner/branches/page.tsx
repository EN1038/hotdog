"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import { useToast } from "@/components/admin/Toast";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import type {
  OwnerBranchRow,
  OwnerBranchShare,
  OwnerDashboardPayload,
} from "@/lib/owner-dashboard";
import {
  enterOwnerStaffAndGo,
  type OwnerEnterStaffBranch,
} from "@/lib/owner-enter-staff";
import { ownerExpensesHref, ownerHomeHref, ownerWasteHref, ownerAgingHref, ownerCancelsHref, ownerStockFlowHref, ownerSummaryHref, ownerTopSellersHref, readOwnerViewRangeParams } from "@/lib/owner-view-query";

type BranchCard = {
  id: string;
  name: string;
  isOpen: boolean;
  isTest: boolean;
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
  includeTest: boolean,
): BranchCard[] {
  const statsById = new Map(byBranch.map((row) => [row.branchId, row]));
  const scoped = branches.filter(
    (b) =>
      b.kind !== "WAREHOUSE" &&
      !b.isHidden &&
      (includeTest || !b.isTest),
  );

  return scoped
    .map((b) => {
      const row = statsById.get(b.id);
      return {
        id: b.id,
        name: b.name,
        isOpen: b.isOpen,
        isTest: b.isTest,
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
      if (b.completedRevenue !== a.completedRevenue) {
        return b.completedRevenue - a.completedRevenue;
      }
      return a.name.localeCompare(b.name, "th");
    });
}

function OwnerBranchesInner() {
  const { data } = useOwnerDashboard();
  const toast = useToast();
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
  const [includeTest, setIncludeTest] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [staffBranches, setStaffBranches] = useState<OwnerEnterStaffBranch[] | null>(
    null,
  );

  const load = useCallback(
    async (rangeFrom: string, rangeTo: string, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          from: rangeFrom,
          to: rangeTo,
        });
        if (includeTest) params.set("includeTest", "1");
        const res = await fetch(`/api/owner/dashboard?${params}`, { signal });
        if (!res.ok || signal?.aborted) return;
        const json = (await res.json()) as OwnerDashboardPayload;
        if (signal?.aborted) return;
        setPayload(json);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [includeTest],
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(from, to, ac.signal);
    return () => ac.abort();
  }, [load, from, to]);

  const branches = payload?.branches ?? data?.branches ?? [];
  const byBranch = payload?.byBranch ?? data?.byBranch ?? [];
  const cards = useMemo(
    () => mergeBranchCards(branches, byBranch, includeTest),
    [branches, byBranch, includeTest],
  );
  const hasTestBranch =
    payload?.hasTestBranch ??
    data?.hasTestBranch ??
    branches.some((b) => b.isTest);
  const openCount = cards.filter((c) => c.isOpen).length;
  const totalRevenue = cards.reduce((sum, c) => sum + c.completedRevenue, 0);
  const totalBills = cards.reduce((sum, c) => sum + c.completedCount, 0);
  const totalOpenBills = cards.reduce((sum, c) => sum + c.openCount, 0);
  const totalExpense = cards.reduce((sum, c) => sum + c.expenseTotal, 0);
  const totalWasteValue = cards.reduce((sum, c) => sum + c.wasteValue, 0);
  const totalStockQty = cards.reduce((sum, c) => sum + c.saleStockQty, 0);
  const stockEnabled = Boolean(payload?.stockEnabled ?? data?.stockEnabled);

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

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
          Owner · Mobile
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">
          รวมทุกสาขา
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          {cards.length > 0
            ? `${cards.length} สาขา · กดการ์ดเพื่อดูยอดสาขานั้น`
            : "ยังไม่มีสาขาในร้าน"}
          {hasTestBranch && !includeTest ? " · ไม่รวมทดลอง" : ""}
        </p>
      </header>

      {hasTestBranch ? (
        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-950">
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(e) => setIncludeTest(e.target.checked)}
          />
          รวมสาขาทดลอง
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
        }}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500">เปิดอยู่</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-slate-900">
            {openCount}/{cards.length}
          </p>
        </div>
        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500">ยอดรวม</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-emerald-700">
            ฿{formatPrice(totalRevenue)}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
            {formatPrice(totalBills)} บิล
          </p>
        </div>
        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500">ค่าใช้จ่าย</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-rose-700">
            ฿{formatPrice(totalExpense)}
          </p>
        </div>
        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500">
            {stockEnabled ? "ของเสีย · สต๊อก" : "ของเสีย"}
          </p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-orange-700">
            ฿{formatPrice(totalWasteValue)}
          </p>
          {stockEnabled ? (
            <p className="mt-0.5 text-[10px] font-semibold text-violet-600">
              สต๊อก {formatPrice(totalStockQty)} ชิ้น
            </p>
          ) : null}
        </div>
      </div>

      {totalOpenBills > 0 ? (
        <p className="mb-3 text-[13px] font-semibold text-amber-800">
          ค้างทำอยู่ {formatPrice(totalOpenBills)} บิลในทุกสาขา
        </p>
      ) : null}

      {loading && cards.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด…</p>
      ) : cards.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm">
          ยังไม่มีสาขา — เพิ่มสาขาจากเมนูหลังบ้าน
        </p>
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
                <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
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
                        </div>
                        <p className="mt-1 text-[12px] font-semibold text-slate-500">
                          {card.isOpen ? (
                            <span className="text-emerald-700">เปิดอยู่</span>
                          ) : (
                            <span className="text-slate-500">ปิดร้าน</span>
                          )}
                          {card.isTest ? " · ทดลอง" : ""}
                          {card.openCount > 0
                            ? ` · ค้าง ${formatPrice(card.openCount)} บิล`
                            : ""}
                          {card.cancelledCount > 0
                            ? ` · ยกเลิก ${formatPrice(card.cancelledCount)}`
                            : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-lg text-slate-300" aria-hidden>
                        ›
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-4">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500">
                          ยอดขาย
                        </p>
                        <p className="mt-0.5 text-[15px] font-black tabular-nums text-emerald-700">
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
                          เหลือสุทธิ
                        </p>
                        <p className="mt-0.5 text-[15px] font-black tabular-nums text-sky-800">
                          ฿{formatPrice(card.netAfterWaste)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                          ขาย−จ่าย−เสีย
                        </p>
                      </div>
                      {stockEnabled ? (
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500">
                            สต๊อกขาย
                          </p>
                          <p className="mt-0.5 text-[15px] font-black tabular-nums text-violet-700">
                            {formatPrice(card.saleStockQty)}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                            ฿{formatPrice(card.saleStockValue)}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500">
                            เงินสด / โอน
                          </p>
                          <p className="mt-0.5 text-[13px] font-black tabular-nums text-slate-800">
                            ฿{formatPrice(card.cashRevenue)}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                            โอน ฿{formatPrice(card.transferRevenue)}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500">
                          ของเสีย
                        </p>
                        <p className="mt-0.5 text-[15px] font-black tabular-nums text-orange-700">
                          {formatPrice(card.wasteQty)}
                          <span className="text-[11px] font-bold"> ชิ้น</span>
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                          ฿{formatPrice(card.wasteValue)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-rose-50 px-3 py-2">
                        <p className="text-[11px] font-semibold text-rose-700">
                          ค่าใช้จ่าย
                        </p>
                        <p className="mt-0.5 text-[14px] font-black tabular-nums text-rose-900">
                          ฿{formatPrice(card.expenseTotal)}
                        </p>
                        <p className="text-[10px] font-semibold text-rose-700/70">
                          {formatPrice(card.expenseCount)} รายการ
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-semibold text-slate-500">
                          เงินสด · โอน
                        </p>
                        <p className="mt-0.5 text-[13px] font-black tabular-nums text-slate-800">
                          ฿{formatPrice(card.cashRevenue)}
                          <span className="mx-1 font-semibold text-slate-300">
                            /
                          </span>
                          ฿{formatPrice(card.transferRevenue)}
                        </p>
                      </div>
                    </div>
                  </Link>

                  <div className="grid grid-cols-4 border-t border-slate-100 text-center text-[11px] font-bold">
                    <Link
                      href={summaryHref}
                      className="py-2.5 text-emerald-800 active:bg-emerald-50"
                    >
                      ยอดขาย
                    </Link>
                    <Link
                      href={wasteHref}
                      className="border-l border-slate-100 py-2.5 text-orange-800 active:bg-orange-50"
                    >
                      ของเสีย
                    </Link>
                    <Link
                      href={expensesHref}
                      className="border-l border-slate-100 py-2.5 text-rose-800 active:bg-rose-50"
                    >
                      จ่าย
                    </Link>
                    <Link
                      href={stockEnabled ? agingHref : cancelsHref}
                      className="border-l border-slate-100 py-2.5 text-violet-800 active:bg-violet-50"
                    >
                      {stockEnabled ? "ค้างอายุ" : "ยกเลิก"}
                    </Link>
                  </div>

                  <div className="grid grid-cols-4 border-t border-slate-100 text-center text-[11px] font-bold">
                    <Link
                      href={topSellersHref}
                      className="py-2.5 text-emerald-800 active:bg-emerald-50"
                    >
                      ขายดี
                    </Link>
                    <Link
                      href={stockEnabled ? stockFlowHref : overviewHref}
                      className="border-l border-slate-100 py-2.5 text-violet-800 active:bg-violet-50"
                    >
                      {stockEnabled ? "สต๊อก" : "ดูยอด"}
                    </Link>
                    <Link
                      href={`/admin/branches/${card.id}`}
                      className="border-l border-slate-100 py-2.5 text-slate-700 active:bg-slate-50"
                    >
                      จัดการ
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
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-center text-[12px] font-medium text-slate-400">
        อยากดูยอดรวมทั้งร้าน?{" "}
        <Link href="/owner/summary" className="font-bold text-slate-600">
          ภาพรวมร้าน →
        </Link>
      </p>

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
                className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500"
              >
                ปิด
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
