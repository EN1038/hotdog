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
import { DateInput } from "@/components/DateInput";
import { formatThaiPhone } from "@/lib/constants";
import {
  SMS_SEND_PURPOSE_OPTIONS,
  SMS_SEND_STATUS_OPTIONS,
} from "@/lib/sms-send-log-shared";

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
  purpose: string;
  purposeLabel: string;
  status: string;
  statusLabel: string;
  toPhone: string;
  toMsisdn: string;
  body: string;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  brandId: string | null;
  brandName: string | null;
  branchId: string | null;
  branchName: string | null;
  skewerOrderId: string | null;
  orderNumber: string | null;
  triggeredByUsername: string | null;
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

function statusTone(status: string) {
  if (status === "SENT") return "bg-emerald-50 text-emerald-800";
  if (status === "FAILED") return "bg-red-50 text-red-800";
  return "bg-slate-100 text-slate-700";
}

export default function SmsLogsPage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const isPlatform = Boolean(session?.isPlatformAdmin);

  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [brandId, setBrandId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState("");
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
    if (purpose) params.set("purpose", purpose);
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const res = await fetch(`/api/admin/sms-logs?${params}`);
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.ok) setData(await res.json());
    else setData({ items: [], page: 1, limit: 50, total: 0, totalPages: 1 });
    setLoading(false);
  }, [page, brandId, branchId, purpose, status, from, to, router]);

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
        title="ประวัติ SMS"
        description={
          isPlatform
            ? "ดู SMS ที่ระบบส่งถึงลูกค้า (ยืนยัน/ยกเลิกออเดอร์เสียบไม้) กรองตามแบรนด์ สาขา สถานะได้"
            : "ดู SMS ที่ส่งในแบรนด์ที่คุณดูแล กรองตามสาขาและสถานะได้"
        }
      />

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
            value={purpose}
            onChange={(e) => {
              setPurpose(e.target.value);
              setPage(1);
            }}
          >
            <option value="">ทั้งหมด</option>
            {SMS_SEND_PURPOSE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={adminLabelClass}>สถานะ</label>
          <select
            className={adminSelectClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">ทั้งหมด</option>
            {SMS_SEND_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={adminLabelClass}>ตั้งแต่</label>
          <DateInput
            className={adminInputClass}
            value={from}
            onChange={(next) => {
              setFrom(next);
              setPage(1);
            }}
          />
        </div>

        <div>
          <label className={adminLabelClass}>ถึง</label>
          <DateInput
            className={adminInputClass}
            value={to}
            onChange={(next) => {
              setTo(next);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading && !data ? (
        <AdminLoadingState />
      ) : !data || data.items.length === 0 ? (
        <AdminEmptyState
          title="ยังไม่มีประวัติ SMS"
          description="เมื่อยืนยันหรือยกเลิกออเดอร์เสียบไม้ ระบบจะพยายามส่ง SMS และบันทึกผลที่นี่"
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
                  <th className="px-4 py-3 font-semibold">เบอร์</th>
                  <th className="px-4 py-3 font-semibold">ประเภท</th>
                  <th className="px-4 py-3 font-semibold">สถานะ</th>
                  <th className="px-4 py-3 font-semibold">ออเดอร์</th>
                  <th className="px-4 py-3 font-semibold">ข้อความ</th>
                  <th className="px-4 py-3 font-semibold">แบรนด์ / สาขา</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => {
                  const open = expandedId === row.id;
                  return (
                    <tr key={row.id} className={adminTrClass}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        <div>{formatWhen(row.createdAt)}</div>
                        {row.triggeredByUsername ? (
                          <div className="text-xs text-slate-400">
                            โดย {row.triggeredByUsername}
                          </div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {row.toPhone
                          ? formatThaiPhone(row.toPhone)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {row.purposeLabel}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone(row.status)}`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {row.orderNumber ? `#${row.orderNumber}` : "—"}
                      </td>
                      <td className="max-w-sm px-4 py-3 text-slate-700">
                        <button
                          type="button"
                          className="text-left hover:text-slate-900"
                          onClick={() =>
                            setExpandedId(open ? null : row.id)
                          }
                        >
                          <span className="line-clamp-2">{row.body}</span>
                        </button>
                        {open ? (
                          <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                            <p className="whitespace-pre-wrap">{row.body}</p>
                            {row.errorMessage ? (
                              <p className="text-red-700">
                                Error: {row.errorMessage}
                              </p>
                            ) : null}
                            {row.providerMessageId ? (
                              <p>Provider ID: {row.providerMessageId}</p>
                            ) : null}
                            {row.toMsisdn ? (
                              <p>MSISDN: {row.toMsisdn}</p>
                            ) : null}
                          </div>
                        ) : row.errorMessage ? (
                          <p className="mt-1 line-clamp-1 text-xs text-red-600">
                            {row.errorMessage}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <div>
                          {row.brandId ? (
                            <Link
                              href={`/admin/brands/${row.brandId}`}
                              className="text-site-primary hover:underline"
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
