"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  AdminEmptyState,
  AdminLoadingState,
  adminInputClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";
import { MenuItemCodeBadge } from "@/components/MenuItemCodeDisplay";
import {
  DATA_QUALITY_TONE,
  dataQualityLabel,
  type TomorrowPlanApiResult,
  type TomorrowPlanApiRow,
} from "@/lib/inventory/inventory-shared-types";
import {
  INVENTORY_STATUS_TONE,
  type InventoryStatusSeverity,
} from "@/lib/inventory/inventory-status";
import {
  PAR_COMPARISON_LABELS,
  PAR_STOCK_LABEL,
  PAR_STOCK_SHORT_LABEL,
} from "@/lib/inventory/inventory-par-labels";
import { FORECAST_SOURCE_LABELS } from "@/lib/inventory/inventory-forecast";
import {
  bangkokWeekdayLabel,
  formatBangkokDateTime,
} from "@/lib/inventory/inventory-date";
import { bangkokDateKey } from "@/lib/constants";
import {
  formatTomorrowPlanShareText,
  PAR_COMPARISON_TONE,
} from "@/lib/inventory/inventory-tomorrow-plan-shared";
import {
  STOCK_RECOMMEND_GRADE_LABELS,
  type StockRecommendGrade,
} from "@/lib/stock-recommendation-shared";
import { MenuStockQtyCell } from "@/components/admin/MenuStockQtyCell";
import {
  ShareExportMenu,
  type ShareExportAction,
} from "@/components/staff/ShareExportMenu";
import {
  captureElementToPng,
  copyTextToClipboard,
  downloadPngDataUrl,
  sharePngDataUrl,
} from "@/lib/share-media";

type Props = {
  branchId: string;
  refreshKey?: number;
  onInventoryMutated?: () => void;
  onBackToList?: () => void;
};

type StatusFilter = "REFILL" | "BELOW_PAR" | "HAS_PAR" | "NO_PAR" | "ALL";
type GradeFilter = "AB" | "A" | "B" | "C" | "ALL";

const GRADE_TONE: Record<StockRecommendGrade, string> = {
  A: "bg-emerald-50 text-emerald-800 border-emerald-200",
  B: "bg-sky-50 text-sky-800 border-sky-200",
  C: "bg-amber-50 text-amber-800 border-amber-200",
  SKIP: "bg-gray-100 text-gray-600 border-gray-200",
};

function MenuThumb({ url, name }: { url: string | null | undefined; name: string }) {
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-gray-100">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-gray-400">
          ไม่มีรูป
        </div>
      )}
    </div>
  );
}

function matchesGradeFilter(
  grade: StockRecommendGrade,
  filter: GradeFilter,
): boolean {
  if (filter === "ALL") return true;
  if (filter === "AB") return grade === "A" || grade === "B";
  return grade === filter;
}

function rowMatchesQuery(row: TomorrowPlanApiRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${row.name} ${row.productCode} ${row.category ?? ""}`
    .toLowerCase()
    .includes(q);
}

function KpiCard({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3">
      <p className="text-xl font-bold tabular-nums text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-600">{label}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

function rowConfirmQty(
  row: TomorrowPlanApiRow,
  draft: Record<string, string>,
): number {
  const raw = draft[row.menuItemId];
  const parsed = raw != null ? Number.parseInt(raw, 10) : NaN;
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  return row.confirmedQty ?? row.suggestedRefill;
}

function defaultConfirmDraft(items: TomorrowPlanApiRow[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const row of items) {
    next[row.menuItemId] = String(row.confirmedQty ?? row.suggestedRefill);
  }
  return next;
}

function toShareRows(
  rows: TomorrowPlanApiRow[],
  draft: Record<string, string>,
) {
  return rows.map((row) => ({
    productCode: row.productCode,
    name: row.name,
    category: row.category,
    salesGradeLabel: row.salesGradeLabel,
    totalSold: row.totalSold,
    sharePct: row.sharePct,
    parStock: row.parStock,
    availableStock: row.availableStock,
    belowParQty: row.belowParQty,
    parComparison: row.parComparison,
    tomorrowTarget: row.tomorrowTarget,
    suggestedRefill: row.suggestedRefill,
    forecastQty: row.forecastQty,
    confirmedQty: rowConfirmQty(row, draft),
  }));
}

export function BranchTomorrowPlanPanel({
  branchId,
  refreshKey = 0,
  onBackToList,
}: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [data, setData] = useState<TomorrowPlanApiResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("REFILL");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("AB");
  const [query, setQuery] = useState("");
  const [confirmDraft, setConfirmDraft] = useState<Record<string, string>>({});
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [exportBusy, setExportBusy] = useState<ShareExportAction | null>(null);
  const [exportMsg, setExportMsg] = useState("");
  const [exportCapturing, setExportCapturing] = useState(false);
  const [captureStamp, setCaptureStamp] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/tomorrow-plan`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("โหลดไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        setData(null);
        setLoadError(json.error ?? "โหลดไม่สำเร็จ");
        return;
      }
      setLoadError("");
      setData(json as TomorrowPlanApiResult);
      setConfirmDraft(defaultConfirmDraft((json as TomorrowPlanApiResult).items));
    } finally {
      setLoading(false);
    }
  }, [branchId, toast]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function recalculate() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("คำนวณใหม่ไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      if (json.tomorrowPlan) {
        const payload = json.tomorrowPlan as TomorrowPlanApiResult;
        setData(payload);
        setConfirmDraft(defaultConfirmDraft(payload.items));
      } else {
        await load();
      }
      toast.success("คำนวณแผนผลิต-เติมสินค้าขายใหม่แล้ว");
    } finally {
      setBusy(false);
    }
  }

  const noParCount = data?.summary.noParCount ?? 0;
  const hasParCount = useMemo(() => {
    if (!data) return 0;
    return data.items.filter((row) => row.parStock > 0).length;
  }, [data]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    const skipGrade =
      statusFilter === "NO_PAR" || statusFilter === "HAS_PAR";
    return data.items
      .filter((row) => {
        if (!rowMatchesQuery(row, query)) return false;
        if (!skipGrade && !matchesGradeFilter(row.salesGrade, gradeFilter)) {
          return false;
        }
        if (statusFilter === "REFILL") return row.suggestedRefill > 0;
        if (statusFilter === "BELOW_PAR") return row.parComparison === "BELOW_PAR";
        if (statusFilter === "HAS_PAR") return row.parStock > 0;
        if (statusFilter === "NO_PAR") return row.parComparison === "NO_PAR";
        return true;
      })
      .sort(
        (a, b) =>
          a.productCode.localeCompare(b.productCode, "th", {
            numeric: true,
            sensitivity: "base",
          }) || a.name.localeCompare(b.name, "th"),
      );
  }, [data, statusFilter, gradeFilter, query]);

  const confirmItems = useMemo(() => {
    return filteredItems.map((row) => ({
      menuItemId: row.menuItemId,
      confirmedQty: rowConfirmQty(row, confirmDraft),
    }));
  }, [filteredItems, confirmDraft]);

  const dirtyConfirmCount = useMemo(() => {
    let n = 0;
    for (const row of filteredItems) {
      const qty = rowConfirmQty(row, confirmDraft);
      if (row.confirmedQty == null || row.confirmedQty !== qty) n += 1;
    }
    return n;
  }, [filteredItems, confirmDraft]);

  async function saveConfirm() {
    if (confirmItems.length === 0) {
      toast.error("ไม่มีรายการยืนยัน", "เลือกตัวกรองที่มีเมนูในตารางก่อน");
      return;
    }
    const invalid = filteredItems.some((row) => {
      const raw = confirmDraft[row.menuItemId];
      if (raw == null || raw.trim() === "") return true;
      const n = Number.parseInt(raw, 10);
      return !Number.isInteger(n) || n < 0;
    });
    if (invalid) {
      toast.error("จำนวนไม่ถูกต้อง", "ยืนยันส่งผลิตต้องเป็นจำนวนเต็ม ≥ 0");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/tomorrow-plan`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: confirmItems }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ยืนยันไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      const payload = json as TomorrowPlanApiResult;
      setData(payload);
      setConfirmDraft(defaultConfirmDraft(payload.items));
      toast.success(`ยืนยันส่งผลิต ${confirmItems.length} รายการแล้ว`);
      onBackToList?.();
    } finally {
      setBusy(false);
    }
  }

  const shareText = useMemo(() => {
    if (!data || filteredItems.length === 0) return "";
    return formatTomorrowPlanShareText(data.branchName, {
      tomorrowDate: data.tomorrowDate,
      items: toShareRows(filteredItems, confirmDraft),
    });
  }, [data, filteredItems, confirmDraft]);

  const tomorrowLabel = data ? bangkokWeekdayLabel(data.tomorrowDate) : "";

  function exportCsv() {
    window.open(
      `/api/admin/branches/${branchId}/inventory/tomorrow-plan?format=csv&refillOnly=1`,
      "_blank",
    );
  }

  function planShareFilename() {
    const slug = (data?.branchName ?? "สาขา")
      .replace(/[^\w\u0E00-\u0E7F\-]+/g, "_")
      .slice(0, 40);
    return `PlanRefill_${slug}_${bangkokDateKey()}.png`;
  }

  async function capturePlanPng() {
    flushSync(() => {
      setExportCapturing(true);
      setCaptureStamp(formatBangkokDateTime(new Date().toISOString()));
    });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    const node = captureRef.current;
    if (!node) throw new Error("ไม่พบตาราง");
    try {
      return await captureElementToPng(node);
    } finally {
      setExportCapturing(false);
    }
  }

  async function handleShareImage() {
    if (exportBusy || filteredItems.length === 0) return;
    setExportBusy("share");
    setExportMsg("");
    try {
      const dataUrl = await capturePlanPng();
      const title = data?.branchName
        ? `แผนผลิต-เติม — ${data.branchName}`
        : "แผนผลิต-เติมสินค้าขาย";
      const result = await sharePngDataUrl(dataUrl, planShareFilename(), title);
      if (result.error === "cancelled") {
        setExportMsg("");
        return;
      }
      if (result.mode === "share") {
        setExportMsg("แชร์รูปแล้ว");
        toast.success("แชร์รูปแล้ว");
      } else if (result.ok) {
        setExportMsg("บันทึกรูปแล้ว — แชร์จากแกลเลอรีได้");
        toast.success("บันทึกรูปแล้ว", "เครื่องนี้แชร์ตรงไม่ได้ — บันทึกไว้ให้แล้ว");
      } else {
        setExportMsg(result.error || "แชร์รูปไม่สำเร็จ");
        toast.error("แชร์รูปไม่สำเร็จ", result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "แชร์รูปไม่สำเร็จ";
      setExportMsg(msg);
      toast.error("แชร์รูปไม่สำเร็จ", msg);
    } finally {
      setExportBusy(null);
    }
  }

  async function handleSaveImage() {
    if (exportBusy || filteredItems.length === 0) return;
    setExportBusy("save");
    setExportMsg("");
    try {
      const dataUrl = await capturePlanPng();
      const result = await downloadPngDataUrl(dataUrl, planShareFilename());
      if (result.ok) {
        setExportMsg("บันทึกรูปแล้ว");
        toast.success("บันทึกรูปแล้ว");
      } else {
        setExportMsg(result.error || "บันทึกรูปไม่สำเร็จ");
        toast.error("บันทึกรูปไม่สำเร็จ", result.error);
      }
    } catch {
      setExportMsg("บันทึกรูปไม่สำเร็จ");
      toast.error("บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleCopyText() {
    if (exportBusy || !shareText) {
      toast.error("ไม่มีรายการส่งผลิต", "เลือกรายการที่ควรเติมก่อน");
      return;
    }
    setExportBusy("copy");
    setExportMsg("");
    try {
      const ok = await copyTextToClipboard(shareText);
      if (ok) {
        setExportMsg("คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย");
        toast.success("คัดลอกข้อความแล้ว", "ไปวางในไลน์ได้เลย");
      } else {
        setExportMsg("คัดลอกไม่สำเร็จ");
        toast.error("คัดลอกไม่สำเร็จ");
      }
    } catch {
      setExportMsg("คัดลอกไม่สำเร็จ");
      toast.error("คัดลอกไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  const captureRows = filteredItems;

  const tableTotals = useMemo(() => {
    return captureRows.reduce(
      (acc, row) => ({
        parStock: acc.parStock + (row.parStock > 0 ? row.parStock : 0),
        availableStock: acc.availableStock + row.availableStock,
        forecastQty: acc.forecastQty + row.forecastQty,
        suggestedRefill: acc.suggestedRefill + row.suggestedRefill,
        confirmedQty: acc.confirmedQty + rowConfirmQty(row, confirmDraft),
      }),
      {
        parStock: 0,
        availableStock: 0,
        forecastQty: 0,
        suggestedRefill: 0,
        confirmedQty: 0,
      },
    );
  }, [captureRows, confirmDraft]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            <h3 className="text-base font-semibold text-gray-900">
              แผนผลิต-เติมสินค้าขาย
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              เติมถึง <span className="font-medium text-gray-800">ยอดที่ตั้งไว้</span>
              {" "}— พยากรณ์โชว์ประกอบ ไม่คำนวณเป้าคนละสูตร
            </p>
            {data ? (
              <p className="mt-2 text-sm text-gray-700">
                พรุ่งนี้ ({tomorrowLabel} {data.tomorrowDate}) · ส่งผลิต = {PAR_STOCK_SHORT_LABEL} −
                ของที่มี
              </p>
            ) : null}
            {data?.lastConfirmedAt ? (
              <p className="mt-1 text-xs text-gray-500">
                ยืนยันล่าสุด {formatBangkokDateTime(data.lastConfirmedAt)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                ยังไม่เคยยืนยันส่งผลิตสำหรับพรุ่งนี้
              </p>
            )}
            {data?.summary?.branchParTarget != null ? (
              <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
                ขายเฉลี่ย ~{(data.summary.totalAvgDailySales ?? 0).toLocaleString("th-TH")}{" "}
                ไม้/วัน · {PAR_STOCK_SHORT_LABEL}ตั้งไว้{" "}
                {(data.summary.sumCurrentPar ?? 0).toLocaleString("th-TH")} · คงเหลือ{" "}
                {(data.summary.sumAvailableStock ?? 0).toLocaleString("th-TH")} ·
                ควรเติม{" "}
                {data.summary.totalSuggestedRefill.toLocaleString("th-TH")}
              </p>
            ) : null}
            {exportMsg ? (
              <p className="mt-1 text-xs font-medium text-emerald-700">{exportMsg}</p>
            ) : null}
            <p className="mt-1 text-xs text-gray-500">
              {PAR_COMPARISON_LABELS.NO_PAR} = ไม่มีจำนวนส่งผลิต — ไปแท็บแนะนำ{PAR_STOCK_LABEL}เพื่อตั้งก่อน
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onBackToList ? (
              <button
                type="button"
                className={btnOutline}
                onClick={onBackToList}
              >
                กลับไปรายการแผน
              </button>
            ) : null}
            <button
              type="button"
              className={btnOutline}
              onClick={() => exportCsv()}
              disabled={loading || !data || filteredItems.length === 0}
            >
              Export CSV
            </button>
            <ShareExportMenu
              busy={exportBusy}
              message={exportMsg}
              disabled={busy || loading || filteredItems.length === 0}
              className={btnOutline}
              label={
                filteredItems.length > 0
                  ? `แชร์ (${filteredItems.length})`
                  : "แชร์"
              }
              sheetTitle="แชร์แผนผลิต-เติม"
              sheetHint="แชร์รูป บันทึกรูป หรือคัดลอกข้อความส่งทีมผลิต"
              onShareImage={handleShareImage}
              onSaveImage={handleSaveImage}
              onCopyText={handleCopyText}
            />
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void recalculate()}
              disabled={busy || loading}
            >
              {busy ? "กำลังสร้าง…" : "สร้างแผน"}
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void saveConfirm()}
              disabled={busy || loading || confirmItems.length === 0}
            >
              {`ยืนยันส่งผลิต${confirmItems.length > 0 ? ` (${confirmItems.length})` : ""}`}
            </button>
            <button
              type="button"
              className={btnOutline}
              onClick={() => void recalculate()}
              disabled={busy || loading}
            >
              {busy ? "กำลังคำนวณ…" : "คำนวณใหม่"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">ค้นหาเมนู</label>
            <input
              className={adminInputClass}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ชื่อ / รหัส"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <AdminLoadingState label="กำลังโหลดแผนผลิต-เติมสินค้าขาย…" />
      ) : !data ? (
        <AdminEmptyState
          title="ยังไม่มีแผน"
          description={
            loadError
              ? loadError
              : `กดสร้างแผน เพื่อคำนวณรายการส่งผลิตจาก${PAR_STOCK_SHORT_LABEL}และสต็อกปัจจุบัน`
          }
          action={
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void recalculate()}
              disabled={busy}
            >
              {busy ? "กำลังสร้าง…" : "สร้างแผน"}
            </button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              value={data.summary.refillRequiredCount.toLocaleString("th-TH")}
              label="ควรส่งผลิต"
              hint={PAR_COMPARISON_LABELS.BELOW_PAR}
            />
            <KpiCard
              value={data.summary.totalSuggestedRefill.toLocaleString("th-TH")}
              label="ชิ้นที่ควรส่ง"
            />
            <KpiCard
              value={tableTotals.confirmedQty.toLocaleString("th-TH")}
              label="ชิ้นที่ยืนยัน (ตารางนี้)"
              hint={dirtyConfirmCount > 0 ? `ยังไม่บันทึก ${dirtyConfirmCount}` : undefined}
            />
            <KpiCard
              value={(data.summary.sumCurrentPar ?? 0).toLocaleString("th-TH")}
              label="ยอดที่ตั้งไว้"
            />
            <KpiCard
              value={(data.summary.sumAvailableStock ?? 0).toLocaleString("th-TH")}
              label="คงเหลือรวม"
            />
            <KpiCard
              value={noParCount.toLocaleString("th-TH")}
              label={PAR_COMPARISON_LABELS.NO_PAR}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                สถานะ
              </p>
              <div className="flex flex-wrap gap-2 text-sm">
                {(
                  [
                    {
                      id: "REFILL" as const,
                      label: `ควรส่งผลิต (${data.summary.refillRequiredCount})`,
                    },
                    {
                      id: "BELOW_PAR" as const,
                      label: `${PAR_COMPARISON_LABELS.BELOW_PAR} (${data.summary.belowParCount})`,
                    },
                    {
                      id: "HAS_PAR" as const,
                      label: `ตั้ง${PAR_STOCK_SHORT_LABEL}แล้ว (${hasParCount})`,
                    },
                    {
                      id: "NO_PAR" as const,
                      label: `${PAR_COMPARISON_LABELS.NO_PAR} (${noParCount})`,
                    },
                    {
                      id: "ALL" as const,
                      label: `ทั้งหมด (${data.items.length})`,
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 font-medium ${
                      statusFilter === opt.id
                        ? "bg-site-primary text-white"
                        : "bg-gray-100 text-gray-700"
                    }`}
                    onClick={() => setStatusFilter(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                กลุ่มยอดขาย
              </p>
              <div className="flex flex-wrap gap-2 text-sm">
                {(
                  [
                    { id: "AB" as const, label: "A+B" },
                    {
                      id: "A" as const,
                      label: `A (${data.summary.gradeA})`,
                    },
                    {
                      id: "B" as const,
                      label: `B (${data.summary.gradeB})`,
                    },
                    {
                      id: "C" as const,
                      label: `C (${data.summary.gradeC})`,
                    },
                    { id: "ALL" as const, label: "ทุกกลุ่ม" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 font-medium ${
                      gradeFilter === opt.id
                        ? "bg-site-primary text-white"
                        : "bg-gray-100 text-gray-700"
                    }`}
                    onClick={() => setGradeFilter(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <AdminEmptyState
              title={
                query.trim()
                  ? "ไม่พบเมนูที่ตรงกับคำค้น"
                  : statusFilter === "NO_PAR"
                    ? `ทุกรายการตั้ง${PAR_STOCK_SHORT_LABEL}แล้ว`
                    : statusFilter === "HAS_PAR"
                      ? `ยังไม่มีรายการที่ตั้ง${PAR_STOCK_SHORT_LABEL}`
                      : statusFilter === "REFILL"
                      ? "ไม่มีรายการที่ต้องส่งผลิต"
                      : "ไม่มีรายการตามตัวกรอง"
              }
              description={
                query.trim()
                  ? "ลองค้นหาชื่อหรือรหัสอื่น"
                  : statusFilter === "HAS_PAR"
                    ? `ยังไม่มีเมนูที่${PAR_STOCK_SHORT_LABEL}มากกว่า 0 — ไปแท็บแนะนำ${PAR_STOCK_LABEL}เพื่อตั้งค่า`
                    : statusFilter === "REFILL"
                    ? `สต็อกถึง${PAR_STOCK_SHORT_LABEL}แล้ว หรือ${PAR_COMPARISON_LABELS.NO_PAR} — ดูแท็บแนะนำ${PAR_STOCK_LABEL}`
                    : "ลองเปลี่ยนตัวกรองสถานะหรือกลุ่มขาย"
              }
            />
          ) : (
            <div
              ref={captureRef}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            >
              {exportCapturing ? (
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">
                    แผนผลิต-เติม — {data.branchName}
                  </p>
                  <p className="text-xs text-gray-500">
                    พรุ่งนี้ {data.tomorrowDate} ({tomorrowLabel}) · เติมถึง{PAR_STOCK_SHORT_LABEL} ·{" "}
                    {captureStamp}
                  </p>
                </div>
              ) : null}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-3 py-3">รหัส</th>
                      <th className="px-3 py-3">สินค้า</th>
                      <th className="px-3 py-3">กลุ่มขาย</th>
                      <th className="px-3 py-3 text-right">{PAR_STOCK_SHORT_LABEL}</th>
                      <th className="px-3 py-3 text-right">คงเหลือ</th>
                      <th className="px-3 py-3 text-right">ควรส่ง</th>
                      <th className="px-3 py-3 text-right">ยืนยันส่งผลิต</th>
                      <th className="px-3 py-3">เทียบ{PAR_STOCK_SHORT_LABEL}</th>
                      <th className="px-3 py-3 text-right">คาดขาย</th>
                      {!exportCapturing ? (
                        <>
                          <th className="px-3 py-3 text-right">ขายช่วงนี้</th>
                          <th className="px-3 py-3 text-right">Avg 7</th>
                          <th className="px-3 py-3">สถานะ</th>
                          <th className="px-3 py-3">คุณภาพ</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {captureRows.map((row) => (
                      <tr key={row.menuItemId} className="hover:bg-gray-50/80">
                        <td className="px-3 py-2.5 align-top">
                          <MenuItemCodeBadge code={row.productCode} />
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex items-start gap-2.5">
                            <MenuThumb url={row.imageUrl} name={row.name} />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900">{row.name}</p>
                              {row.category ? (
                                <p className="text-xs text-gray-500">{row.category}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${GRADE_TONE[row.salesGrade]}`}
                          >
                            {STOCK_RECOMMEND_GRADE_LABELS[row.salesGrade]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums align-top font-medium">
                          {row.parStock > 0
                            ? row.parStock.toLocaleString("th-TH")
                            : "—"}
                        </td>
                        <MenuStockQtyCell
                          quantity={row.availableStock}
                          stockTracked={row.stockTracked}
                        />
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-800 align-top">
                          {row.suggestedRefill > 0
                            ? row.suggestedRefill.toLocaleString("th-TH")
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right align-top">
                          {exportCapturing ? (
                            <span className="text-base font-bold tabular-nums text-sky-800">
                              {rowConfirmQty(row, confirmDraft).toLocaleString(
                                "th-TH",
                              )}
                            </span>
                          ) : (
                            <input
                              className={`${adminInputClass} ml-auto w-20 py-1 text-right tabular-nums font-semibold ${
                                rowConfirmQty(row, confirmDraft) !==
                                row.suggestedRefill
                                  ? "border-sky-400 bg-sky-50"
                                  : ""
                              }`}
                              type="number"
                              min={0}
                              value={
                                confirmDraft[row.menuItemId] ??
                                String(row.confirmedQty ?? row.suggestedRefill)
                              }
                              onChange={(e) =>
                                setConfirmDraft((prev) => ({
                                  ...prev,
                                  [row.menuItemId]: e.target.value,
                                }))
                              }
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${PAR_COMPARISON_TONE[row.parComparison]}`}
                          >
                            {row.parComparisonLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums align-top text-gray-600">
                          {row.forecastQty > 0
                            ? row.forecastQty.toLocaleString("th-TH")
                            : "—"}
                        </td>
                        {!exportCapturing ? (
                          <>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top text-gray-700">
                              {row.totalSold.toLocaleString("th-TH")}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top text-gray-600">
                              {row.avg7.toLocaleString("th-TH")}
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                                  INVENTORY_STATUS_TONE[
                                    row.status.severity as InventoryStatusSeverity
                                  ]
                                }`}
                              >
                                {row.status.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${DATA_QUALITY_TONE[row.dataQuality]}`}
                              >
                                {dataQualityLabel(row.dataQuality)}
                              </span>
                              <p className="mt-1 text-[10px] text-gray-400">
                                {FORECAST_SOURCE_LABELS[
                                  row.forecastSource as keyof typeof FORECAST_SOURCE_LABELS
                                ] ?? row.forecastSource}
                              </p>
                            </td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900">
                    <tr>
                      <td className="px-3 py-3" colSpan={3}>
                        รวม {captureRows.length.toLocaleString("th-TH")} รายการ
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {tableTotals.parStock.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {tableTotals.availableStock.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-amber-800">
                        {tableTotals.suggestedRefill > 0
                          ? tableTotals.suggestedRefill.toLocaleString("th-TH")
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-base font-bold text-sky-800">
                        {tableTotals.confirmedQty.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3 text-right tabular-nums">
                        {tableTotals.forecastQty.toLocaleString("th-TH")}
                      </td>
                      {!exportCapturing ? (
                        <td className="px-3 py-3" colSpan={4} />
                      ) : null}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
