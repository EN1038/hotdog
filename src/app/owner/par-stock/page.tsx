"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import { BranchParStockPanel } from "@/components/admin/BranchParStockPanel";
import { bangkokDateKey } from "@/lib/constants";
import {
  PAR_STOCK_LABEL,
} from "@/lib/inventory/inventory-par-labels";
import {
  buildOwnerViewQuery,
  ownerHomeHref,
  ownerSalesDaysHref,
  ownerTomorrowPlansHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";

function OwnerParStockInner() {
  const { data } = useOwnerDashboard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey();
  const initial = readOwnerViewRangeParams(searchParams, today);
  const [filterBranchId, setFilterBranchId] = useState<string | null>(
    initial.branchId,
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
  }, [searchParams, today]);

  const writeViewQuery = useCallback(
    (branchId: string | null) => {
      router.replace(
        `/owner/par-stock${buildOwnerViewQuery({ branchId })}`,
        { scroll: false },
      );
    },
    [router],
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
      writeViewQuery(branchId);
    }
  }, [branchId, filterBranchId, writeViewQuery]);

  const homeHref = ownerHomeHref({ branchId });
  const plansHref = ownerTomorrowPlansHref({ branchId });
  const salesDaysHref = ownerSalesDaysHref({ branchId });

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-sky-700/80">
          Owner · วางแผนสต๊อก
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">
          แนะนำ{PAR_STOCK_LABEL}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          ตั้งเป้าคงคลังต่อเมนู — ใช้เป็นฐานคำนวณแผนผลิต-เติม
        </p>
      </header>

      <div className="mb-3 flex justify-end">
        <OwnerBranchFilterBar
          branches={filterBranches}
          value={branchId}
          onChange={(id) => {
            setFilterBranchId(id);
            writeViewQuery(id);
          }}
        />
      </div>

      {branchId ? (
        <BranchParStockPanel
          branchId={branchId}
          refreshKey={refreshKey}
          onInventoryMutated={() => setRefreshKey((k) => k + 1)}
        />
      ) : (
        <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-sm">
          ยังไม่มีสาขาสำหรับตั้ง{PAR_STOCK_LABEL}
        </p>
      )}

      <div className="mt-4 flex justify-center gap-4 text-[12px] font-medium text-slate-400">
        <Link href={salesDaysHref} className="font-bold text-amber-800">
          วันขายดี / ยอดอ่อน
        </Link>
        <Link href={plansHref} className="font-bold text-emerald-700">
          ไปแผนผลิต-เติม →
        </Link>
        <Link href={homeHref} className="font-bold text-slate-600">
          ← หน้าแรก
        </Link>
      </div>
    </div>
  );
}

export default function OwnerParStockPage() {
  return (
    <OwnerAppShell active="home">
      <OwnerParStockInner />
    </OwnerAppShell>
  );
}
