"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
import { AdminCreateStockCountSheet } from "@/components/admin/AdminCreateStockCountSheet";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { bangkokDateKey } from "@/lib/constants";

type CountLine = {
  id: string;
  systemQty: number;
  countedQty: number;
  varianceReason: string | null;
  product: {
    name: string;
    stockType: string;
    unit: string;
  };
};

type Count = {
  id: string;
  name: string;
  status?: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  completedAt: string | null;
  createdAt?: string;
  note: string | null;
  createdByStaff: { name: string } | null;
  createdByAdmin: { username: string } | null;
  lines: CountLine[];
};

type FinancialData = {
  stockType?: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
  source?: "ADMIN" | "STAFF" | string;
  cash?: number;
  transfer?: number;
  change?: number;
  customers?: number;
  pendingAdminApply?: boolean;
  lines?: Array<{
    menuItemId?: string;
    name: string;
    systemQty: number;
    countedQty: number;
  }>;
};

type StatusFilter = "ALL" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type TypeFilter = "ALL" | "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

const STOCK_TYPE_LABEL: Record<string, string> = {
  SALE_ITEM: "เมนูขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

function statusTone(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "bg-amber-50 text-amber-900 ring-amber-300";
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "CANCELLED":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

function displayStatusLabel(
  status: string,
  financial: FinancialData | null,
  stockType: string,
  createdByAdmin: boolean,
) {
  if (status === "IN_PROGRESS") {
    if (createdByAdmin || financial?.source === "ADMIN") {
      return "รอ Convert · แอดมิน";
    }
    return "รอ Convert · หน้าร้าน";
  }
  if (status === "CANCELLED") return "ปฏิเสธแล้ว";
  if (status === "COMPLETED") {
    if (stockType === "SALE_ITEM" && financial?.pendingAdminApply === false) {
      return "Convert แล้ว";
    }
    if (
      stockType === "SALE_ITEM" &&
      financial?.pendingAdminApply == null &&
      !financial?.lines?.some((l) => l.menuItemId)
    ) {
      return "ระบบเก่า (ปรับแล้ว)";
    }
    if (financial?.source === "ADMIN" && stockType !== "SALE_ITEM") {
      return "แอดมินปรับแล้ว";
    }
    return stockType === "SALE_ITEM" ? "Convert แล้ว" : "บันทึกแล้ว";
  }
  return status;
}

function inferCountStockType(
  name: string,
  financial: FinancialData | null,
): string {
  if (
    financial?.stockType === "SALE_ITEM" ||
    financial?.stockType === "CONSUMABLE" ||
    financial?.stockType === "EQUIPMENT"
  ) {
    return financial.stockType;
  }
  if (name.includes("ของสิ้นเปลือง")) return "CONSUMABLE";
  if (name.includes("อุปกรณ์")) return "EQUIPMENT";
  return "SALE_ITEM";
}

function parseFinancial(note: string | null): FinancialData | null {
  if (!note || !note.startsWith("{")) return null;
  try {
    return JSON.parse(note) as FinancialData;
  } catch {
    return null;
  }
}

function getDisplayLines(count: Count, stockType: string, includesSales: boolean) {
  const financialData = parseFinancial(count.note);
  if (financialData?.lines && financialData.lines.length > 0) {
    return financialData.lines.map((l, i) => ({
      id: `note-${i}`,
      name: l.name,
      systemQty: l.systemQty,
      countedQty: l.countedQty,
    }));
  }
  return count.lines
    .filter((l) =>
      includesSales
        ? l.product.stockType === "SALE_ITEM"
        : l.product.stockType === stockType,
    )
    .map((l) => ({
      id: l.id,
      name: l.product.name,
      systemQty: l.systemQty,
      countedQty: l.countedQty ?? 0,
    }));
}

type Props = {
  branchId: string;
  onPendingChange?: (pending: number) => void;
};

export function BranchStockCountsView({ branchId, onPendingChange }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [counts, setCounts] = useState<Count[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState(() => bangkokDateKey());
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("IN_PROGRESS");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diffOnly, setDiffOnly] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/counts?date=${encodeURIComponent(dateStr)}`,
      );
      if (res.ok) {
        const json = await res.json();
        const next = (json.counts || []) as Count[];
        setCounts(next);
        setExpandedId(null);
        const pending = next.filter((c) => c.status === "IN_PROGRESS").length;
        onPendingChange?.(pending);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || err.message || "โหลดสรุปยอดไม่สำเร็จ");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [branchId, dateStr, toast, onPendingChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    let pending = 0;
    let done = 0;
    let cancelled = 0;
    for (const c of counts) {
      if (c.status === "IN_PROGRESS") pending += 1;
      else if (c.status === "CANCELLED") cancelled += 1;
      else done += 1;
    }
    return { pending, done, cancelled, total: counts.length };
  }, [counts]);

  const filteredCounts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = counts.filter((count) => {
      const financial = parseFinancial(count.note);
      const stockType = inferCountStockType(count.name, financial);
      const status = count.status || "COMPLETED";
      if (typeFilter !== "ALL" && stockType !== typeFilter) return false;
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (!needle) return true;
      const creator =
        count.createdByStaff?.name ||
        count.createdByAdmin?.username ||
        "";
      const lineNames = (
        financial?.lines?.map((l) => l.name) ??
        count.lines.map((l) => l.product.name)
      ).join(" ");
      const hay = [
        count.name,
        creator,
        count.note ?? "",
        lineNames,
        STOCK_TYPE_LABEL[stockType] ?? "",
        displayStatusLabel(
          status,
          financial,
          stockType,
          Boolean(count.createdByAdmin),
        ),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
    return [...list].sort((a, b) => {
      const sa = a.status === "IN_PROGRESS" ? 0 : 1;
      const sb = b.status === "IN_PROGRESS" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const ta = new Date(a.createdAt || a.completedAt || 0).getTime();
      const tb = new Date(b.createdAt || b.completedAt || 0).getTime();
      return tb - ta;
    });
  }, [counts, q, typeFilter, statusFilter]);

  async function applyCount(countId: string, action: "apply" | "reject") {
    const ok = await confirm({
      title: action === "apply" ? "Convert ยอดนับเป็น ADJUST?" : "ปฏิเสธสรุปยอด?",
      message:
        action === "apply"
          ? "ระบบจะตั้งยอดเมนูขายตามจำนวนที่นับได้ และสร้างประวัติ ADJUST"
          : "สรุปยอดนี้จะไม่ถูกนำไปปรับสต๊อก",
      confirmLabel: action === "apply" ? "Convert สต๊อก" : "ปฏิเสธ",
    });
    if (!ok) return;
    setBusyId(countId);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/counts/${countId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "ดำเนินการไม่สำเร็จ");
        return;
      }
      toast.success(
        action === "apply"
          ? `Convert สำเร็จ${
              typeof body.adjustedItemCount === "number"
                ? ` · ADJUST ${body.adjustedItemCount} รายการ`
                : ""
            }`
          : "ปฏิเสธสรุปยอดแล้ว",
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const today = bangkokDateKey();
  const statusChips: { id: StatusFilter; label: string; count: number }[] = [
    { id: "IN_PROGRESS", label: "รอ Convert", count: stats.pending },
    { id: "COMPLETED", label: "เสร็จแล้ว", count: stats.done },
    { id: "CANCELLED", label: "ปฏิเสธ", count: stats.cancelled },
    { id: "ALL", label: "ทั้งหมด", count: stats.total },
  ];
  const typeChips: { id: TypeFilter; label: string }[] = [
    { id: "ALL", label: "ทุกประเภท" },
    { id: "SALE_ITEM", label: "เมนูขาย" },
    { id: "CONSUMABLE", label: "ของสิ้นเปลือง" },
    { id: "EQUIPMENT", label: "อุปกรณ์" },
  ];

  return (
    <div className="space-y-4">
      {/* Header + primary actions */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-slate-900">
              สรุปยอดสต๊อกและขาย
            </h2>
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-500">
              ตรวจยอดนับจากหน้าร้านหรือเอกสารที่แอดมินสร้าง → Convert เป็น ADJUST
              สำหรับเมนูขาย
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              รีเฟรช
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-site-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              + สร้างเอกสารยอดนับ
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setStatusFilter("IN_PROGRESS")}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              statusFilter === "IN_PROGRESS"
                ? "border-amber-300 bg-amber-50"
                : "border-slate-200 bg-slate-50 hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500">รอ Convert</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-amber-800">
              {stats.pending}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("COMPLETED")}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              statusFilter === "COMPLETED"
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 bg-slate-50 hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500">เสร็จแล้ว</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-emerald-800">
              {stats.done}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("CANCELLED")}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              statusFilter === "CANCELLED"
                ? "border-slate-300 bg-slate-100"
                : "border-slate-200 bg-slate-50 hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500">ปฏิเสธ</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-700">
              {stats.cancelled}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              statusFilter === "ALL"
                ? "border-site-primary/40 bg-site-primary-soft"
                : "border-slate-200 bg-slate-50 hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500">ทั้งหมดวันนี้</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-900">
              {stats.total}
            </p>
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-[11rem]">
              <label className={adminLabelClass} htmlFor="stock-count-date">
                วันที่
              </label>
              <DateInput
                id="stock-count-date"
                className={adminInputClass}
                value={dateStr}
                max={today}
                onChange={(v) => {
                  if (v) setDateStr(v);
                }}
              />
            </div>
            {dateStr !== today ? (
              <button
                type="button"
                onClick={() => setDateStr(today)}
                className="mb-0.5 rounded-lg px-2 py-2 text-xs font-bold text-site-primary hover:underline"
              >
                วันนี้
              </button>
            ) : null}
            <div className="min-w-[12rem] flex-1">
              <label className={adminLabelClass} htmlFor="stock-count-q">
                ค้นหา
              </label>
              <input
                id="stock-count-q"
                type="search"
                className={adminInputClass}
                placeholder="ชื่อเอกสาร, ผู้บันทึก, ชื่อรายการ…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {statusChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStatusFilter(chip.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  statusFilter === chip.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {chip.label}
                <span className="ml-1 tabular-nums opacity-70">{chip.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {typeChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setTypeFilter(chip.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  typeFilter === chip.id
                    ? "bg-site-primary text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <AdminLoadingState className="py-8" />
      ) : filteredCounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-14 text-center shadow-sm">
          <p className="text-sm font-bold text-slate-700">
            {statusFilter === "IN_PROGRESS" && counts.length > 0
              ? "ไม่มีเอกสารรอ Convert ในวันนี้"
              : counts.length === 0
                ? "ยังไม่มีสรุปยอดในวันที่เลือก"
                : "ไม่พบรายการตามตัวกรอง"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            สร้างเอกสารยอดนับเอง หรือรอหน้าร้านส่งสรุปเมนูขาย
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-site-primary px-4 py-2 text-sm font-bold text-white"
            >
              + สร้างเอกสารยอดนับ
            </button>
            {statusFilter !== "ALL" && counts.length > 0 ? (
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
              >
                ดูทั้งหมดวันนี้
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <p className="text-sm font-semibold text-slate-600">
              แสดง {filteredCounts.length} เอกสาร
              {filteredCounts.length !== counts.length
                ? ` จาก ${counts.length}`
                : ""}
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={diffOnly}
                onChange={(e) => setDiffOnly(e.target.checked)}
              />
              ตอนเปิดดู: แสดงเฉพาะยอดต่าง
            </label>
          </div>

          {filteredCounts.map((count) => {
            const isExpanded = expandedId === count.id;
            const whenIso = count.completedAt || count.createdAt || "";
            const time = whenIso
              ? new Date(whenIso).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Bangkok",
                })
              : "—";
            const creator =
              count.createdByStaff?.name ||
              count.createdByAdmin?.username ||
              "ไม่ทราบชื่อ";
            const financialData = parseFinancial(count.note);
            const stockType = inferCountStockType(count.name, financialData);
            const typeLabel = STOCK_TYPE_LABEL[stockType] ?? "เมนูขาย";
            const includesSales = stockType === "SALE_ITEM";
            const status = count.status || "COMPLETED";
            const canApply =
              includesSales &&
              status === "IN_PROGRESS" &&
              Boolean(financialData?.lines?.length);
            const displayLines = getDisplayLines(
              count,
              stockType,
              includesSales,
            );
            const mismatchCount = displayLines.filter(
              (l) => l.countedQty !== l.systemQty,
            ).length;
            const visibleLines = diffOnly
              ? displayLines.filter((l) => l.countedQty !== l.systemQty)
              : displayLines;
            const statusLabel = displayStatusLabel(
              status,
              financialData,
              stockType,
              Boolean(count.createdByAdmin),
            );
            const salesTotal =
              (financialData?.cash || 0) + (financialData?.transfer || 0);
            const fromAdmin =
              Boolean(count.createdByAdmin) ||
              financialData?.source === "ADMIN";

            return (
              <article
                key={count.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                  status === "IN_PROGRESS"
                    ? "border-amber-300 ring-1 ring-amber-100"
                    : "border-slate-200"
                }`}
              >
                <div className="flex flex-col gap-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 sm:text-base">
                          {count.name || `สรุปยอด ${time} น.`}
                        </h3>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${statusTone(status)}`}
                        >
                          {statusLabel}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {typeLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                        {fromAdmin ? "แอดมิน" : "หน้าร้าน"}: {creator}
                        <span className="mx-1.5 text-slate-300">·</span>
                        {time} น.
                        {mismatchCount > 0 ? (
                          <>
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span className="font-bold text-red-600">
                              ยอดต่าง {mismatchCount} รายการ
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span className="text-emerald-700">ยอดตรงทั้งหมด</span>
                          </>
                        )}
                      </p>
                    </div>

                    {includesSales && financialData ? (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          ยอดเงิน (สด+โอน)
                        </p>
                        <p className="text-lg font-black tabular-nums text-slate-900">
                          ฿{salesTotal.toLocaleString("th-TH")}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* Always-visible actions for pending */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {canApply ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === count.id}
                          onClick={() => void applyCount(count.id, "apply")}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                        >
                          {busyId === count.id
                            ? "กำลัง Convert…"
                            : "Convert → ADJUST"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === count.id}
                          onClick={() => void applyCount(count.id, "reject")}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                        >
                          ปฏิเสธ
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : count.id)
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {isExpanded ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                    </button>
                    <span className="ml-auto text-xs tabular-nums text-slate-400">
                      {displayLines.length} รายการ
                    </span>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="border-t border-slate-100 bg-slate-50/80 p-4 sm:p-5">
                    {status === "COMPLETED" &&
                    includesSales &&
                    !financialData?.lines?.some((l) => l.menuItemId) ? (
                      <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                        สรุประบบเก่า (ปรับสต๊อกตอนหน้าร้านส่งแล้ว) — ไม่ต้อง
                        Convert ซ้ำ
                      </div>
                    ) : null}

                    {financialData && includesSales ? (
                      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                        {(
                          [
                            ["เงินสด", financialData.cash ?? 0],
                            ["เงินโอน", financialData.transfer ?? 0],
                            ["เงินทอน", financialData.change ?? 0],
                            ["ลูกค้า (คิว)", financialData.customers ?? 0],
                          ] as const
                        ).map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                          >
                            <p className="text-[11px] font-semibold text-slate-500">
                              {label}
                            </p>
                            <p className="mt-0.5 text-base font-black tabular-nums text-slate-900">
                              {label.startsWith("ลูกค้า")
                                ? value.toLocaleString("th-TH")
                                : `฿${value.toLocaleString("th-TH")}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900">
                        รายการนับ ({typeLabel})
                      </h4>
                      {mismatchCount > 0 && diffOnly ? (
                        <p className="text-xs font-semibold text-red-600">
                          แสดง {visibleLines.length} รายการที่ยอดต่าง
                          (จากทั้งหมด {displayLines.length})
                        </p>
                      ) : null}
                    </div>

                    {visibleLines.length === 0 ? (
                      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                        ไม่มียอดต่าง — ทุกรายการตรงกับสต๊อกตอนบันทึก
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                              <th className="px-3 py-2.5 font-semibold">
                                รายการ
                              </th>
                              <th className="px-3 py-2.5 text-right font-semibold">
                                ระบบ
                              </th>
                              <th className="px-3 py-2.5 text-right font-semibold">
                                นับได้
                              </th>
                              <th className="px-3 py-2.5 text-right font-semibold">
                                ผลต่าง
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {visibleLines.map((line) => {
                              const diff = line.countedQty - line.systemQty;
                              const isDiff = diff !== 0;
                              return (
                                <tr
                                  key={line.id}
                                  className={
                                    isDiff ? "bg-red-50/60" : undefined
                                  }
                                >
                                  <td
                                    className={`px-3 py-2.5 font-semibold ${
                                      isDiff ? "text-red-800" : "text-slate-900"
                                    }`}
                                  >
                                    {line.name}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                    {line.systemQty}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-900">
                                    {line.countedQty}
                                  </td>
                                  <td
                                    className={`px-3 py-2.5 text-right font-bold tabular-nums ${
                                      isDiff ? "text-red-700" : "text-slate-300"
                                    }`}
                                  >
                                    {diff > 0 ? "+" : ""}
                                    {diff}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <AdminCreateStockCountSheet
        branchId={branchId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setStatusFilter(
            statusFilter === "IN_PROGRESS" ? "IN_PROGRESS" : "ALL",
          );
          void load();
        }}
      />
    </div>
  );
}
