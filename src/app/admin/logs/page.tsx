"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  adminSelectClass,
  adminTableClass,
  adminTableWrapClass,
  adminTheadClass,
  adminTrClass,
  btnOutline,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  ADMIN_ACTIVITY_ACTION_OPTIONS,
  activityActionLabel,
} from "@/lib/admin-activity-shared";

type BrandOption = { id: string; name: string; code: string };
type BranchOption = {
  id: string;
  name: string;
  brandId: string | null;
  brand?: { id: string; name: string } | null;
};

type LogItem = {
  id: string;
  createdAt: string;
  adminUsername: string;
  action: string;
  summary: string;
  brandId: string | null;
  brandName: string | null;
  branchId: string | null;
  branchName: string | null;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  metadata: unknown;
};

type LogsResponse = {
  items: LogItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ActivityLogsPage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const isPlatform = Boolean(session?.isPlatformAdmin);

  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [brandId, setBrandId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    Promise.all([
      fetch("/api/admin/brands"),
      fetch("/api/admin/branches"),
    ]).then(async ([brandRes, branchRes]) => {
      if (brandRes.status === 401 || branchRes.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (brandRes.ok) setBrands(await brandRes.json());
      if (branchRes.ok) setBranches(await branchRes.json());
    });
  }, [loaded, router]);

  const filteredBranches = useMemo(() => {
    if (!brandId) return branches;
    return branches.filter(
      (b) => b.brandId === brandId || b.brand?.id === brandId,
    );
  }, [branches, brandId]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (brandId) params.set("brandId", brandId);
    if (branchId) params.set("branchId", branchId);
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const res = await fetch(`/api/admin/activity-logs?${params}`);
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.ok) setData(await res.json());
    else setData({ items: [], page: 1, limit: 50, total: 0, totalPages: 1 });
    setLoading(false);
  }, [page, brandId, branchId, action, from, to, router]);

  useEffect(() => {
    if (!loaded) return;
    loadLogs();
  }, [loaded, loadLogs]);

  if (!loaded) {
    return <AdminLoadingState />;
  }

  return (
    <div>
      <AdminPageHeader
        title="ประวัติการใช้งาน"
        description={
          isPlatform
            ? "ดูการกระทำของแอดมินทั้งหมด กรองตามแบรนด์ / สาขา / ประเภทได้"
            : "ดูการกระทำในแบรนด์ที่คุณดูแล กรองตามสาขาและประเภทได้"
        }
      />

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        {isPlatform || brands.length > 1 ? (
          <div>
            <label className={adminLabelClass}>แบรนด์</label>
            <select
              className={adminSelectClass}
              value={brandId}
              onChange={(e) => {
                setBrandId(e.target.value);
                setBranchId("");
                setPage(1);
              }}
            >
              <option value="">ทั้งหมด</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className={adminLabelClass}>สาขา</label>
          <select
            className={adminSelectClass}
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">ทั้งหมด</option>
            {filteredBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={adminLabelClass}>ประเภท</label>
          <select
            className={adminSelectClass}
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="">ทั้งหมด</option>
            {ADMIN_ACTIVITY_ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={adminLabelClass}>ตั้งแต่</label>
          <input
            type="date"
            className={adminInputClass}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div>
          <label className={adminLabelClass}>ถึง</label>
          <input
            type="date"
            className={adminInputClass}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading && !data ? (
        <AdminLoadingState />
      ) : !data || data.items.length === 0 ? (
        <AdminEmptyState
          title="ยังไม่มีประวัติ"
          description="เมื่อมีการสร้างหรือแก้ไขข้อมูลในระบบ รายการจะปรากฏที่นี่"
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <span>
              {data.total.toLocaleString("th-TH")} รายการ
              {loading ? " · กำลังอัปเดต..." : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={btnOutline}
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ก่อนหน้า
              </button>
              <span>
                หน้า {data.page}/{data.totalPages}
              </span>
              <button
                type="button"
                className={btnOutline}
                disabled={page >= data.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                ถัดไป
              </button>
            </div>
          </div>

          <div className={adminTableWrapClass}>
            <table className={adminTableClass}>
              <thead className={adminTheadClass}>
                <tr>
                  <th className="px-4 py-3 font-semibold">เวลา</th>
                  <th className="px-4 py-3 font-semibold">ผู้ทำ</th>
                  <th className="px-4 py-3 font-semibold">การกระทำ</th>
                  <th className="px-4 py-3 font-semibold">รายละเอียด</th>
                  <th className="px-4 py-3 font-semibold">แบรนด์ / สาขา</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => {
                  const open = expandedId === row.id;
                  return (
                    <tr key={row.id} className={adminTrClass}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatWhen(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.adminUsername}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {activityActionLabel(row.action)}
                        </span>
                      </td>
                      <td className="max-w-md px-4 py-3 text-slate-700">
                        <button
                          type="button"
                          className="text-left hover:text-slate-900"
                          onClick={() =>
                            setExpandedId(open ? null : row.id)
                          }
                        >
                          {row.summary}
                        </button>
                        {open && row.metadata != null ? (
                          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                            {JSON.stringify(row.metadata, null, 2)}
                          </pre>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <div>
                          {row.brandId ? (
                            <Link
                              href={`/admin/brands/${row.brandId}`}
                              className="text-red-600 hover:underline"
                            >
                              {row.brandName || "แบรนด์"}
                            </Link>
                          ) : (
                            row.brandName || "—"
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          {row.branchId ? (
                            <Link
                              href={`/admin/branches/${row.branchId}`}
                              className="hover:text-slate-600 hover:underline"
                            >
                              {row.branchName || "สาขา"}
                            </Link>
                          ) : (
                            row.branchName || null
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
