"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import type { OwnerDashboardPayload } from "@/lib/owner-dashboard";
import type { ShopAgingAttentionItem } from "@/lib/shop-aging-summary";
import {
  buildOwnerViewQuery,
  ownerStockHref,
  ownerSummaryHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";

function OwnerAgingInner() {
  const { data } = useOwnerDashboard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey();
  const initial = readOwnerViewRangeParams(searchParams, today);
  const [filterBranchId, setFilterBranchId] = useState<string | null>(
    initial.branchId,
  );
  const [payload, setPayload] = useState<OwnerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const urlReady = useRef(false);

  useEffect(() => {
    const parsed = readOwnerViewRangeParams(searchParams, today);
    if (!urlReady.current) {
      urlReady.current = true;
      return;
    }
    setFilterBranchId(parsed.branchId);
  }, [searchParams, today]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: today, to: today });
      if (filterBranchId) params.set("branchId", filterBranchId);
      const res = await fetch(`/api/owner/dashboard?${params}`);
      if (!res.ok) return;
      setPayload((await res.json()) as OwnerDashboardPayload);
    } finally {
      setLoading(false);
    }
  }, [filterBranchId, today]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const aging = payload?.aging ?? data?.aging ?? null;
  const items: ShopAgingAttentionItem[] = aging?.items ?? [];
  const filterBranches = (payload?.branches ?? data?.branches ?? []).filter(
    (b) => !b.isHidden && b.kind !== "WAREHOUSE" && !b.isTest,
  );
  const multiBranch = filterBranches.length > 1 && !filterBranchId;
  const summaryHref = ownerSummaryHref({ branchId: filterBranchId });
  const stockHref = ownerStockHref({ branchId: filterBranchId });

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-amber-700/80">
          Owner · สต๊อกค้างอายุ
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">
          สต๊อกค้างอายุ
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          ยอดคงเหลือปัจจุบัน · แดง/ส้มตามอายุรับเข้า
        </p>
      </header>

      <div className="mb-3 flex justify-end">
        <OwnerBranchFilterBar
          branches={filterBranches}
          value={filterBranchId}
          onChange={(id) => {
            setFilterBranchId(id);
            router.replace(
              `/owner/aging${buildOwnerViewQuery({ branchId: id })}`,
              { scroll: false },
            );
          }}
        />
      </div>

      {aging?.stockActive ? (
        <section
          className={`mb-3 grid grid-cols-2 gap-2 ${loading ? "opacity-70" : ""}`}
        >
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3.5">
            <p className="text-[12px] font-bold text-rose-800">
              แดง · ≥{aging.criticalDays}วัน
            </p>
            <p className="mt-1 text-[24px] font-black tabular-nums text-rose-950">
              {formatPrice(aging.criticalQty)}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-rose-700">
              {aging.critical} รายการ · ฿{formatPrice(aging.criticalValueBaht)}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3.5">
            <p className="text-[12px] font-bold text-amber-900">
              ส้ม · ≥{aging.warnDays}วัน
            </p>
            <p className="mt-1 text-[24px] font-black tabular-nums text-amber-950">
              {formatPrice(aging.warnQty)}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-amber-800">
              {aging.warn} รายการ · ฿{formatPrice(aging.warnValueBaht)}
            </p>
          </div>
        </section>
      ) : (
        <p className="mb-3 rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-400 shadow-sm">
          {loading ? "กำลังโหลด…" : "ร้านนี้ยังไม่ได้เปิดติดตามสต๊อกค้างอายุ"}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-[15px] font-extrabold text-slate-900">
            รายการที่ต้องดู
          </h2>
          <p className="mt-0.5 text-[12px] font-medium text-slate-500">
            {items.length > 0
              ? `${items.length} รายการ · กดเพื่อไปสต๊อกสาขา`
              : "ไม่มีรายการแดง/ส้ม"}
          </p>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            {loading ? "กำลังโหลด…" : "สต๊อกปกติ — ไม่มีค้างอายุ"}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={ownerStockHref({ branchId: item.branchId })}
                  className="flex items-start justify-between gap-3 px-4 py-3 active:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                          item.level === "critical"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.level === "critical" ? "แดง" : "ส้ม"}
                      </span>
                      <p className="truncate text-[14px] font-bold text-slate-900">
                        {item.name}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                      {item.ageDays != null
                        ? `อายุ ${formatPrice(item.ageDays)} วัน`
                        : "อายุไม่ทราบ"}
                      {multiBranch ? ` · ${item.branchName}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-black tabular-nums text-slate-900">
                      {formatPrice(item.quantity)} ชิ้น
                    </p>
                    <p className="text-[11px] font-semibold tabular-nums text-slate-500">
                      ฿{formatPrice(item.valueBaht)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-4 flex justify-center gap-4 text-[12px] font-medium text-slate-400">
        <Link href={stockHref} className="font-bold text-violet-700">
          ดูสต๊อก →
        </Link>
        <Link href={summaryHref} className="font-bold text-slate-600">
          ← ภาพรวมร้าน
        </Link>
      </div>
    </div>
  );
}

export default function OwnerAgingPage() {
  return (
    <OwnerAppShell active="summary">
      <OwnerAgingInner />
    </OwnerAppShell>
  );
}
