"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AdminLoadingState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  btnOutline,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { DateInput } from "@/components/DateInput";
import {
  StockFlowAnalyticsPanel,
  type StockFlowAnalyticsData,
  type StockFlowMetricKey,
} from "@/components/merchant/StockFlowAnalyticsPanel";
import { bangkokDateKey, bangkokMonthRangeToToday } from "@/lib/constants";
import { WAREHOUSE_UI_ENABLED } from "@/lib/warehouse-ui";

type BranchMeta = {
  id: string;
  name: string;
  isTest?: boolean;
  isHidden?: boolean;
  kind?: string | null;
};

export default function AdminBrandStockFlowPage() {
  const { id: brandId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, loaded } = useAdminSession();
  const today = bangkokDateKey();
  const month = bangkokMonthRangeToToday();

  const [from, setFrom] = useState(
    searchParams.get("from")?.trim() || month.from,
  );
  const [to, setTo] = useState(searchParams.get("to")?.trim() || month.to);
  const [filterBranchId, setFilterBranchId] = useState<string | null>(
    searchParams.get("branchId")?.trim() || null,
  );
  const [includeTest, setIncludeTest] = useState(false);
  const [payload, setPayload] = useState<StockFlowAnalyticsData | null>(null);
  const [hasTestBranch, setHasTestBranch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchOptions, setBranchOptions] = useState<BranchMeta[]>([]);
  const [compareMetric, setCompareMetric] =
    useState<StockFlowMetricKey>("sold");
  const [brandName, setBrandName] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (session && !session.isPlatformAdmin) {
      if (!session.brandIds.includes(brandId)) {
        router.replace("/admin");
      }
    }
  }, [loaded, session, brandId, router]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const params = new URLSearchParams({ from, to });
        if (includeTest) params.set("includeTest", "1");
        if (filterBranchId) params.set("branchId", filterBranchId);
        const res = await fetch(
          `/api/admin/brands/${brandId}/overview?${params}`,
          { signal: ac.signal },
        );
        if (res.status === 401) {
          router.push("/admin/login");
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (!ac.signal.aborted) {
            setError(body?.error ?? "โหลดไม่สำเร็จ");
            setPayload(null);
          }
          return;
        }
        const json = (await res.json()) as StockFlowAnalyticsData & {
          brandName?: string | null;
          hasTestBranch?: boolean;
        };
        if (ac.signal.aborted) return;
        setPayload(json);
        setHasTestBranch(Boolean(json.hasTestBranch));
        if (json.brandName) setBrandName(json.brandName);
        if (!filterBranchId && json.branches?.length) {
          setBranchOptions(
            json.branches.map((b) => ({
              id: b.branchId,
              name: b.branchName,
              isTest: b.isTest,
            })),
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!ac.signal.aborted) setError("โหลดไม่สำเร็จ");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [brandId, from, to, filterBranchId, includeTest, router]);

  const allBranchOptions = useMemo(() => {
    if (branchOptions.length > 0) return branchOptions;
    return (payload?.branches ?? []).map((b) => ({
      id: b.branchId,
      name: b.branchName,
      isTest: b.isTest,
    }));
  }, [branchOptions, payload]);

  if (!loaded) return <AdminLoadingState />;

  const backHref = `/admin/brands/${brandId}`;
  const stockManageHref = `/admin/brands/${brandId}/stock`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4">
        <Link
          href={backHref}
          className="text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          ← กลับภาพรวมร้าน
        </Link>
      </div>
      <AdminPageHeader
        title="วิเคราะห์สต๊อก"
        description={
          brandName
            ? WAREHOUSE_UI_ENABLED
              ? `${brandName} · สต๊อกกลาง · รับเข้า · จ่าย · ขาย · เสีย · คงเหลือ · เทียบสาขา`
              : `${brandName} · รับเข้า · จ่าย · ขาย · เสีย · คงเหลือ · เทียบสาขา`
            : WAREHOUSE_UI_ENABLED
              ? "สต๊อกกลาง · รับเข้า · จ่าย · ขาย · เสีย · คงเหลือ · มูลค่า · เทียบสาขา"
              : "รับเข้า · จ่าย · ขาย · เสีย · คงเหลือ · มูลค่า · เทียบสาขา"
        }
        actions={
          WAREHOUSE_UI_ENABLED ? (
            <Link href={stockManageHref} className={btnOutline}>
              จัดการสต๊อกคลัง
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="w-[10.5rem]">
          <label className={adminLabelClass}>วันที่เริ่ม</label>
          <DateInput
            className={adminInputClass}
            value={from}
            max={to}
            onChange={(v) => {
              if (v) setFrom(v);
            }}
          />
        </div>
        <div className="w-[10.5rem]">
          <label className={adminLabelClass}>วันที่สิ้นสุด</label>
          <DateInput
            className={adminInputClass}
            value={to}
            min={from}
            max={today}
            onChange={(v) => {
              if (v) setTo(v);
            }}
          />
        </div>
        <div className="min-w-[10rem] flex-1">
          <label className={adminLabelClass}>สาขา</label>
          <select
            className={adminInputClass}
            value={filterBranchId ?? ""}
            onChange={(e) =>
              setFilterBranchId(e.target.value ? e.target.value : null)
            }
          >
            <option value="">ทุกสาขา</option>
            {allBranchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {hasTestBranch ? (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(e) => setIncludeTest(e.target.checked)}
            />
            รวมสาขาทดลอง
          </label>
        ) : null}
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <StockFlowAnalyticsPanel
        data={payload}
        loading={loading}
        filterBranches={allBranchOptions}
        compareMetric={compareMetric}
        onCompareMetricChange={setCompareMetric}
        filterBranchName={
          filterBranchId
            ? allBranchOptions.find((b) => b.id === filterBranchId)?.name
            : null
        }
        links={{
          manageStock: stockManageHref,
        }}
      />
    </div>
  );
}
