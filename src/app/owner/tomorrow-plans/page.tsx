"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import { BranchTomorrowPlanPanel } from "@/components/admin/BranchTomorrowPlanPanel";
import { BranchTomorrowPlanRecordsPanel } from "@/components/admin/BranchTomorrowPlanRecordsPanel";
import { bangkokDateKey } from "@/lib/constants";
import {
  buildOwnerViewQuery,
  ownerHomeHref,
  ownerParStockHref,
  ownerSalesDaysHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";

function OwnerTomorrowPlansInner() {
  const { data } = useOwnerDashboard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey();
  const initial = readOwnerViewRangeParams(searchParams, today);
  const openCreate = searchParams.get("create") === "1";
  const [filterBranchId, setFilterBranchId] = useState<string | null>(
    initial.branchId,
  );
  const [mode, setMode] = useState<"list" | "create">(
    openCreate ? "create" : "list",
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const urlReady = useRef(false);

  useEffect(() => {
    const parsed = readOwnerViewRangeParams(searchParams, today);
    if (!urlReady.current) {
      urlReady.current = true;
      return;
    }
    setFilterBranchId(parsed.branchId);
    setMode(searchParams.get("create") === "1" ? "create" : "list");
  }, [searchParams, today]);

  const writeViewQuery = useCallback(
    (opts: { branchId?: string | null; create?: boolean }) => {
      const branchId =
        opts.branchId !== undefined ? opts.branchId : filterBranchId;
      const qs = new URLSearchParams();
      if (branchId) qs.set("branchId", branchId);
      if (opts.create) qs.set("create", "1");
      const q = qs.toString();
      router.replace(`/owner/tomorrow-plans${q ? `?${q}` : ""}`, {
        scroll: false,
      });
    },
    [filterBranchId, router],
  );

  const filterBranches = useMemo(
    () =>
      (data?.branches ?? []).filter(
        (b) => !b.isHidden && b.kind !== "WAREHOUSE" && !b.isTest,
      ),
    [data?.branches],
  );

  const branchId =
    filterBranchId && filterBranches.some((b) => b.id === filterBranchId)
      ? filterBranchId
      : (filterBranches[0]?.id ?? null);

  useEffect(() => {
    if (!filterBranchId && branchId) {
      setFilterBranchId(branchId);
      writeViewQuery({ branchId, create: mode === "create" });
    }
  }, [branchId, filterBranchId, mode, writeViewQuery]);

  const homeHref = ownerHomeHref({ branchId });
  const parHref = ownerParStockHref({ branchId });
  const salesDaysHref = ownerSalesDaysHref({ branchId });

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-emerald-700/80">
          Owner · วางแผนสต๊อก
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">
          แผนผลิต-เติม
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          คำนวณของที่ต้องผลิต/เติมจาก Par และสต๊อกปัจจุบัน
        </p>
      </header>

      <div className="mb-3 flex justify-end">
        <OwnerBranchFilterBar
          branches={filterBranches}
          value={branchId}
          onChange={(id) => {
            setFilterBranchId(id);
            writeViewQuery({ branchId: id, create: mode === "create" });
          }}
        />
      </div>

      {branchId ? (
        mode === "create" ? (
          <BranchTomorrowPlanPanel
            branchId={branchId}
            refreshKey={refreshKey}
            onInventoryMutated={() => setRefreshKey((k) => k + 1)}
            onBackToList={() => {
              setMode("list");
              writeViewQuery({ branchId, create: false });
              setRefreshKey((k) => k + 1);
            }}
          />
        ) : (
          <BranchTomorrowPlanRecordsPanel
            branchId={branchId}
            refreshKey={refreshKey}
            onCreatePlan={() => {
              setMode("create");
              writeViewQuery({ branchId, create: true });
            }}
          />
        )
      ) : (
        <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-sm">
          ยังไม่มีสาขาสำหรับแผนผลิต-เติม
        </p>
      )}

      <div className="mt-4 flex justify-center gap-4 text-[12px] font-medium text-slate-400">
        <Link href={salesDaysHref} className="font-bold text-amber-800">
          วันขายดี / ยอดอ่อน
        </Link>
        <Link href={parHref} className="font-bold text-sky-700">
          ← Par Stock
        </Link>
        <Link href={homeHref} className="font-bold text-slate-600">
          หน้าแรก
        </Link>
      </div>
    </div>
  );
}

export default function OwnerTomorrowPlansPage() {
  return (
    <OwnerAppShell active="home">
      <OwnerTomorrowPlansInner />
    </OwnerAppShell>
  );
}
