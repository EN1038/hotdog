"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import { StaffBranchStockHistoryPanel } from "@/components/staff/StaffBranchStockHistoryPanel";
import { bangkokDateKey } from "@/lib/constants";
import {
  buildOwnerViewQuery,
  ownerHomeHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";

function OwnerStockHistoryInner() {
  const { data } = useOwnerDashboard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey();
  const initial = readOwnerViewRangeParams(searchParams, today);
  const [filterBranchId, setFilterBranchId] = useState<string | null>(
    initial.branchId,
  );
  const urlReady = useRef(false);

  const writeViewQuery = useCallback(
    (next: { branchId?: string | null }) => {
      const parsed = readOwnerViewRangeParams(searchParams, today);
      const q = buildOwnerViewQuery({
        branchId:
          next.branchId !== undefined ? next.branchId : filterBranchId,
        from: parsed.hasRange ? parsed.from : undefined,
        to: parsed.hasRange ? parsed.to : undefined,
      });
      router.replace(`/owner/stock-history${q}`, { scroll: false });
    },
    [filterBranchId, router, searchParams, today],
  );

  useEffect(() => {
    const parsed = readOwnerViewRangeParams(searchParams, today);
    if (!urlReady.current) {
      urlReady.current = true;
      return;
    }
    setFilterBranchId(parsed.branchId);
  }, [searchParams, today]);

  const filterBranches = (data?.branches ?? []).filter(
    (b) => !b.isHidden && b.kind !== "WAREHOUSE" && !b.isTest,
  );
  const filterBranchName = filterBranchId
    ? filterBranches.find((b) => b.id === filterBranchId)?.name
    : null;
  const rangeParams = readOwnerViewRangeParams(searchParams, today);
  const homeHref = ownerHomeHref({
    branchId: filterBranchId,
    from: rangeParams.hasRange ? rangeParams.from : undefined,
    to: rangeParams.hasRange ? rangeParams.to : undefined,
  });

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-indigo-600/80">
          Owner · ประวัติสต๊อก
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">
          ประวัติสต๊อก
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          รับ · ขาย · ของเสีย · จ่ายออก — กดดูรายละเอียดแต่ละบิล
        </p>
      </header>

      <div className="mb-3">
        <OwnerBranchFilterBar
          branches={filterBranches}
          value={filterBranchId}
          onChange={(id) => {
            setFilterBranchId(id);
            writeViewQuery({ branchId: id });
          }}
        />
      </div>

      {filterBranchName ? (
        <p className="mb-3 text-[13px] font-semibold text-emerald-800">
          กำลังดูสาขา · {filterBranchName}
        </p>
      ) : (
        <p className="mb-3 text-[13px] font-semibold text-slate-500">
          กำลังดูทุกสาขา
        </p>
      )}

      <StaffBranchStockHistoryPanel
        apiPath="/api/owner/stock/history"
        branchId={filterBranchId}
        hideBack
        title="ประวัติสต๊อก"
      />

      <p className="mt-4 text-center text-[12px] font-medium text-slate-400">
        <Link href={homeHref} className="font-bold text-slate-600">
          ← กลับหน้าเจ้าของร้าน
        </Link>
      </p>
    </div>
  );
}

export default function OwnerStockHistoryPage() {
  return (
    <OwnerAppShell active="summary">
      <OwnerStockHistoryInner />
    </OwnerAppShell>
  );
}
