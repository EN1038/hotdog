"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  AdminEmptyState,
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { MenuItemCodeBadge } from "@/components/MenuItemCodeDisplay";
import { bangkokDateKey, bangkokMonthRangeToToday } from "@/lib/constants";
import { formatBangkokDateTime } from "@/lib/inventory/inventory-date";
import {
  DATA_QUALITY_TONE,
  dataQualityLabel,
  type ParStockApiResult,
  type ParStockApiRow,
} from "@/lib/inventory/inventory-shared-types";
import { MenuStockQtyCell } from "@/components/admin/MenuStockQtyCell";
import {
  DEFAULT_SKEWER_PAR_POLICY,
  PAR_HOLD_DAYS_MAX,
  PAR_HOLD_DAYS_MIN,
  clampParHoldDays,
  factorsForHoldDays,
  skewerParPolicyToSearchParams,
  type SkewerParPolicy,
} from "@/lib/inventory/inventory-par-policy";
import {
  PAR_STOCK_LABEL,
  PAR_STOCK_SHORT_LABEL,
  parStockFeatureTitle,
} from "@/lib/inventory/inventory-par-labels";
import {
  formatParStockShareText,
  parStockShareRowsFromDisplayed,
} from "@/lib/inventory/inventory-par-stock-share";
import {
  captureElementToPng,
  copyTextToClipboard,
  downloadPngDataUrl,
  sharePngDataUrl,
} from "@/lib/share-media";
import {
  ShareExportMenu,
  type ShareExportAction,
} from "@/components/staff/ShareExportMenu";

type Props = {
  branchId: string;
  refreshKey?: number;
  onInventoryMutated?: () => void;
};

type RowFilter = "ELIGIBLE" | "ALL" | "NEW" | "NEEDS_APPLY" | "NO_PAR" | "HAS_PAR";

type ParSortKey =
  | "code"
  | "name"
  | "grade"
  | "category"
  | "sold"
  | "waste"
  | "avg"
  | "minDaily"
  | "maxDaily"
  | "stock"
  | "par"
  | "recommended"
  | "refill";

type SortDir = "asc" | "desc";

const GRADE_SORT_RANK: Record<string, number> = { A: 0, B: 1, C: 2, SKIP: 3 };

const NUMERIC_SORT_DEFAULT_DESC: ParSortKey[] = [
  "sold",
  "waste",
  "avg",
  "minDaily",
  "maxDaily",
  "stock",
  "par",
  "recommended",
  "refill",
];

function parSortValue(
  row: ParStockApiRow,
  key: ParSortKey,
  draft: Record<string, string>,
): number | string {
  switch (key) {
    case "code":
      return row.productCode ?? "";
    case "name":
      return row.name;
    case "grade":
      return GRADE_SORT_RANK[row.salesGrade] ?? 9;
    case "category":
      return row.category ?? "";
    case "sold":
      return row.totalSold ?? 0;
    case "waste":
      return row.wasteQty ?? 0;
    case "avg":
      return row.avgDailySales;
    case "minDaily":
      return row.minDailySales ?? 0;
    case "maxDaily":
      return row.maxDailySales ?? 0;
    case "stock":
      return row.availableStock;
    case "par":
      return rowParDraft(row, draft);
    case "recommended":
      return row.recommendedParStock;
    case "refill": {
      const par = rowParDraft(row, draft);
      return Math.max(par - (row.stockTracked ? row.availableStock : 0), 0);
    }
  }
}

function SortTh({
  label,
  sortKey,
  activeKey,
  dir,
  align = "left",
  title,
  onSort,
}: {
  label: string;
  sortKey: ParSortKey;
  activeKey: ParSortKey;
  dir: SortDir;
  align?: "left" | "right";
  title?: string;
  onSort: (key: ParSortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      className={`px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide ${
          active ? "text-gray-900" : "text-gray-600 hover:text-gray-900"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <span className={`text-[10px] ${active ? "text-sky-700" : "text-gray-300"}`}>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

const GRADE_TONE: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-800 border-emerald-200",
  B: "bg-sky-50 text-sky-800 border-sky-200",
  C: "bg-amber-50 text-amber-800 border-amber-200",
  SKIP: "bg-gray-100 text-gray-500 border-gray-200",
};

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
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-[11px] font-medium leading-4 text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-gray-900">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

const GRADE_SET_OPTIONS = [
  {
    id: "AB" as const,
    title: "A ขายดี + B ขายปานกลาง",
    hint: "แนะนำ",
  },
  {
    id: "A" as const,
    title: "A ขายดี อย่างเดียว",
    hint: null,
  },
  {
    id: "ABC" as const,
    title: "A ขายดี + B ขายปานกลาง + C ขายช้า",
    hint: null,
  },
];

function policyGradeSetId(policy: SkewerParPolicy): "A" | "AB" | "ABC" {
  if (policy.eligibleGrades.length === 1 && policy.eligibleGrades[0] === "A") {
    return "A";
  }
  if (policy.eligibleGrades.includes("C")) return "ABC";
  return "AB";
}

function policySearchParams(
  policy: SkewerParPolicy,
  from: string,
  to: string,
): URLSearchParams {
  const params = skewerParPolicyToSearchParams(policy);
  params.set("from", from);
  params.set("to", to);
  return params;
}

function rowMatchesQuery(row: ParStockApiRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${row.name} ${row.productCode} ${row.category ?? ""}`
    .toLowerCase()
    .includes(q);
}

function defaultSelected(rows: ParStockApiRow[]): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const row of rows) {
    next[row.menuItemId] =
      row.parEligible &&
      row.recommendedParStock > 0 &&
      row.parDiff !== 0;
  }
  return next;
}

function rowParDraft(
  row: ParStockApiRow,
  manualDraft: Record<string, string>,
): number {
  const raw = manualDraft[row.menuItemId];
  const parsed = raw != null ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : row.currentParStock;
}

function MenuThumb({ url, name }: { url: string | null; name: string }) {
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

function ParRefillCell({
  row,
  manualDraft,
}: {
  row: ParStockApiRow;
  manualDraft: Record<string, string>;
}) {
  const par = rowParDraft(row, manualDraft);
  const onHand = row.stockTracked ? row.availableStock : 0;
  const need = Math.max(par - onHand, 0);
  const extra = Math.max(onHand - par, 0);
  if (need > 0) {
    return (
      <span className="font-semibold text-amber-800">
        {need.toLocaleString("th-TH")}
      </span>
    );
  }
  if (extra > 0 && par > 0) {
    return (
      <span className="text-sky-700">เกิน {extra.toLocaleString("th-TH")}</span>
    );
  }
  return <span className="text-gray-400">0</span>;
}

function parPolicyRequestBody(policy: SkewerParPolicy) {
  return {
    parGrades:
      policy.eligibleGrades.length === 1 && policy.eligibleGrades[0] === "A"
        ? "A"
        : policy.eligibleGrades.includes("C")
          ? "ABC"
          : "AB",
    maxA: policy.gradeMax.A,
    maxB: policy.gradeMax.B,
    maxC: policy.gradeMax.C,
    branchParMin: policy.branchParMin,
    branchParMax: policy.branchParMax,
    holdDays: policy.holdDays,
  };
}

function holdDaysSubtitle(holdDays: number): string {
  if (holdDays <= 1) {
    return "ถือของประมาณ 1 วัน — ไม่ตั้งสต็อกถึง 2 วัน";
  }
  return `ถือของประมาณ ${holdDays} วัน`;
}

export function BranchParStockPanel({
  branchId,
  refreshKey = 0,
  onInventoryMutated,
}: Props) {
  const toast = useToast();
  const defaults = bangkokMonthRangeToToday();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [zeroIneligibleOnApply, setZeroIneligibleOnApply] = useState(true);
  const [data, setData] = useState<ParStockApiResult | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<RowFilter>("ELIGIBLE");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ParSortKey>("sold");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [parPolicy, setParPolicy] = useState<SkewerParPolicy>(DEFAULT_SKEWER_PAR_POLICY);
  const parPolicyRef = useRef(parPolicy);
  parPolicyRef.current = parPolicy;
  const [customHoldDraft, setCustomHoldDraft] = useState("3");
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [exportBusy, setExportBusy] = useState<ShareExportAction | null>(null);
  const [exportMsg, setExportMsg] = useState("");
  const [exportCapturing, setExportCapturing] = useState(false);
  const [captureStamp, setCaptureStamp] = useState("");

  function applyParPayload(payload: ParStockApiResult) {
    setData(payload);
    setSelected(defaultSelected(payload.items));
    const draft: Record<string, string> = {};
    for (const row of payload.items) {
      draft[row.menuItemId] = String(row.currentParStock);
    }
    setManualDraft(draft);
    if (payload.analysisFrom) setFrom(payload.analysisFrom);
    if (payload.analysisTo) setTo(payload.analysisTo);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = policySearchParams(parPolicyRef.current, from, to);
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/par-stock?${params.toString()}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("โหลดไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        setData(null);
        return;
      }
      const payload = json as ParStockApiResult;
      setData(payload);
      setSelected(defaultSelected(payload.items));
      const draft: Record<string, string> = {};
      for (const row of payload.items) {
        draft[row.menuItemId] = String(row.currentParStock);
      }
      setManualDraft(draft);
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to, toast]);

  function applyHoldDays(days: number) {
    const derived = factorsForHoldDays(days);
    const next = { ...parPolicyRef.current, ...derived };
    parPolicyRef.current = next;
    setParPolicy(next);
    if (derived.holdDays !== 1 && derived.holdDays !== 2) {
      setCustomHoldDraft(String(derived.holdDays));
    }
    void load();
  }

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const fillableItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter((row) => {
      if (row.salesGrade) {
        return parPolicy.eligibleGrades.includes(row.salesGrade);
      }
      return Boolean(row.parEligible);
    });
  }, [data, parPolicy.eligibleGrades]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    const q = query.trim();
    const pool =
      q.length > 0 ||
      filter === "ALL" ||
      filter === "NEW" ||
      filter === "NO_PAR" ||
      filter === "HAS_PAR"
        ? data.items
        : fillableItems;
    return pool.filter((row) => {
      if (!rowMatchesQuery(row, query)) return false;
      if (filter === "NEW") {
        return row.salesGrade === "SKIP" || (row.totalSold ?? 0) <= 0;
      }
      if (filter === "NEEDS_APPLY") {
        return row.parDiff !== 0 && row.recommendedParStock > 0;
      }
      if (filter === "NO_PAR") return row.currentParStock <= 0;
      if (filter === "HAS_PAR") return row.currentParStock > 0;
      return true;
    });
  }, [data, fillableItems, filter, query]);

  const displayedItems = useMemo(() => {
    const rows = [...filteredItems];
    rows.sort((a, b) => {
      const av = parSortValue(a, sortKey, manualDraft);
      const bv = parSortValue(b, sortKey, manualDraft);
      let cmp = 0;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv, "th");
      } else {
        cmp = Number(av) - Number(bv);
      }
      if (cmp === 0) return (b.totalSold ?? 0) - (a.totalSold ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filteredItems, sortKey, sortDir, manualDraft]);

  const shareText = useMemo(() => {
    if (!data || displayedItems.length === 0) return "";
    return formatParStockShareText({
      branchName: data.branchName,
      from: data.analysisFrom,
      to: data.analysisTo,
      lastParUpdatedAt: data.lastParUpdatedAt,
      branchParTarget: data.summary?.branchParTarget,
      holdDays: parPolicy.holdDays,
      items: parStockShareRowsFromDisplayed(displayedItems, manualDraft),
    });
  }, [data, displayedItems, manualDraft, parPolicy.holdDays]);

  async function captureParPng() {
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

  function parShareFilename() {
    const slug = (data?.branchName ?? "สาขา")
      .replace(/[^\w\u0E00-\u0E7F\-]+/g, "_")
      .slice(0, 40);
    return `ParStock_${slug}_${bangkokDateKey()}.png`;
  }

  async function handleShareImage() {
    if (exportBusy || displayedItems.length === 0) return;
    setExportBusy("share");
    setExportMsg("");
    try {
      const dataUrl = await captureParPng();
      const title = parStockFeatureTitle(data?.branchName);
      const result = await sharePngDataUrl(dataUrl, parShareFilename(), title);
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
    if (exportBusy || displayedItems.length === 0) return;
    setExportBusy("save");
    setExportMsg("");
    try {
      const dataUrl = await captureParPng();
      const result = await downloadPngDataUrl(dataUrl, parShareFilename());
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
      toast.error("ไม่มีรายการให้แชร์", "มีเมนูในตารางก่อน แล้วกดแชร์");
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

  function toggleSort(key: ParSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(NUMERIC_SORT_DEFAULT_DESC.includes(key) ? "desc" : "asc");
  }

  const selectedCount = filteredItems.filter((r) => selected[r.menuItemId]).length;

  const reviewItems = useMemo(
    () =>
      filteredItems.filter(
        (row) =>
          selected[row.menuItemId] &&
          row.recommendedParStock > 0 &&
          row.recommendedParStock !== row.currentParStock,
      ),
    [filteredItems, selected],
  );

  async function runAnalyze() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/par-stock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "analyze",
            from,
            to,
            ...parPolicyRequestBody(parPolicy),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("วิเคราะห์ไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      applyParPayload(json as ParStockApiResult);
      toast.success(`วิเคราะห์${PAR_STOCK_LABEL}แล้ว`);
    } finally {
      setBusy(false);
    }
  }

  async function saveManualPar(menuItemId: string) {
    const raw = manualDraft[menuItemId] ?? "0";
    const parStock = Number.parseInt(raw, 10);
    if (!Number.isInteger(parStock) || parStock < 0) {
      toast.error(`${PAR_STOCK_LABEL}ไม่ถูกต้อง`, "ต้องเป็นจำนวนเต็ม ≥ 0");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/par-stock`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            menuItemId,
            parStock,
            from,
            to,
            ...parPolicyRequestBody(parPolicy),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      applyParPayload(json as ParStockApiResult);
      onInventoryMutated?.();
      toast.success(`บันทึก${PAR_STOCK_LABEL}แล้ว`);
    } finally {
      setBusy(false);
    }
  }

  const dirtyParItems = useMemo(() => {
    const items: Array<{ menuItemId: string; parStock: number }> = [];
    for (const row of data?.items ?? []) {
      const raw = manualDraft[row.menuItemId];
      if (raw == null) continue;
      const parStock = Number.parseInt(raw, 10);
      if (!Number.isInteger(parStock) || parStock < 0) continue;
      if (parStock !== row.currentParStock) {
        items.push({ menuItemId: row.menuItemId, parStock });
      }
    }
    return items;
  }, [data?.items, manualDraft]);

  async function saveDirtyPar() {
    if (dirtyParItems.length === 0) {
      toast.error("ยังไม่มีค่าที่แก้", `ปรับตัวเลข${PAR_STOCK_SHORT_LABEL}ในตารางก่อน แล้วกดบันทึก`);
      return;
    }
    const invalid = (data?.items ?? []).some((row) => {
      const raw = manualDraft[row.menuItemId];
      if (raw == null) return false;
      const parsed = Number.parseInt(raw, 10);
      return !Number.isInteger(parsed) || parsed < 0;
    });
    if (invalid) {
      toast.error(`${PAR_STOCK_LABEL}ไม่ถูกต้อง`, "ต้องเป็นจำนวนเต็ม ≥ 0");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/par-stock`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: dirtyParItems,
            from,
            to,
            ...parPolicyRequestBody(parPolicy),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      applyParPayload(json as ParStockApiResult);
      onInventoryMutated?.();
      toast.success(`บันทึก${PAR_STOCK_SHORT_LABEL} ${json.updated ?? dirtyParItems.length} รายการแล้ว`);
    } finally {
      setBusy(false);
    }
  }

  const ineligiblePar = data?.summary?.ineligibleCurrentPar ?? 0;

  async function confirmApplyRecommended() {
    if (reviewItems.length === 0 && !(zeroIneligibleOnApply && ineligiblePar > 0)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/par-stock/apply-recommended`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            menuItemIds: reviewItems.map((r) => r.menuItemId),
            from,
            to,
            zeroIneligible: zeroIneligibleOnApply,
            ...parPolicyRequestBody(parPolicy),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ใช้ค่าแนะนำไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      applyParPayload(json as ParStockApiResult);
      setReviewOpen(false);
      onInventoryMutated?.();
      toast.success(`ใช้${PAR_STOCK_SHORT_LABEL}ที่แนะนำ ${json.applied ?? reviewItems.length} รายการแล้ว`);
    } finally {
      setBusy(false);
    }
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of filteredItems) {
        next[row.menuItemId] = checked;
      }
      return next;
    });
  }

  const kpis = useMemo(() => {
    if (!data) return null;
    return {
      total: fillableItems.length,
      hidden: data.items.length - fillableItems.length,
      needsApply: fillableItems.filter(
        (r) => r.recommendedParStock > 0 && r.parDiff !== 0,
      ).length,
      noParAll: data.items.filter((r) => r.currentParStock <= 0).length,
      hasParAll: data.items.filter((r) => r.currentParStock > 0).length,
    };
  }, [data, fillableItems]);

  const tableTotals = useMemo(() => {
    let avgDaily = 0;
    let currentPar = 0;
    let recommendedPar = 0;
    let available = 0;
    let sold = 0;
    let waste = 0;
    let refill = 0;
    let minDaily = Infinity;
    let maxDaily = 0;
    for (const row of filteredItems) {
      avgDaily += row.avgDailySales;
      sold += row.totalSold ?? 0;
      waste += row.wasteQty ?? 0;
      if ((row.minDailySales ?? 0) > 0) {
        minDaily = Math.min(minDaily, row.minDailySales ?? 0);
      }
      maxDaily = Math.max(maxDaily, row.maxDailySales ?? 0);
      const draft = manualDraft[row.menuItemId];
      const parsed = draft != null ? Number.parseInt(draft, 10) : NaN;
      const par =
        Number.isInteger(parsed) && parsed >= 0 ? parsed : row.currentParStock;
      currentPar += par;
      recommendedPar += row.recommendedParStock;
      if (row.stockTracked) available += row.availableStock;
      refill += Math.max(par - (row.stockTracked ? row.availableStock : 0), 0);
    }
    return {
      count: filteredItems.length,
      avgDaily,
      sold,
      waste,
      currentPar,
      recommendedPar,
      parDiff: recommendedPar - currentPar,
      available,
      refill,
      minDaily: minDaily === Infinity ? 0 : minDaily,
      maxDaily,
    };
  }, [filteredItems, manualDraft]);

  const gradeSetId = policyGradeSetId(parPolicy);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-xl">
            <h3 className="text-base font-semibold text-gray-900">
              แนะนำ{PAR_STOCK_LABEL}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {holdDaysSubtitle(parPolicy.holdDays)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500">ถือของ</span>
              {(
                [
                  { id: 1 as const, label: "1 วัน" },
                  { id: 2 as const, label: "2 วัน" },
                  { id: "custom" as const, label: "กำหนดเอง" },
                ] as const
              ).map((opt) => {
                const selected =
                  opt.id === "custom"
                    ? parPolicy.holdDays !== 1 && parPolicy.holdDays !== 2
                    : parPolicy.holdDays === opt.id;
                return (
                  <button
                    key={String(opt.id)}
                    type="button"
                    disabled={busy || loading}
                    onClick={() => {
                      if (opt.id === "custom") {
                        applyHoldDays(
                          clampParHoldDays(Number.parseInt(customHoldDraft, 10) || 3),
                        );
                        return;
                      }
                      applyHoldDays(opt.id);
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      selected
                        ? "border-sky-400 bg-sky-50 text-sky-900"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
              {parPolicy.holdDays !== 1 && parPolicy.holdDays !== 2 ? (
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    className={`${adminInputClass} w-16 py-1 tabular-nums`}
                    type="number"
                    min={PAR_HOLD_DAYS_MIN}
                    max={PAR_HOLD_DAYS_MAX}
                    value={customHoldDraft}
                    disabled={busy || loading}
                    onChange={(e) => setCustomHoldDraft(e.target.value)}
                    onBlur={() => {
                      const next = clampParHoldDays(
                        Number.parseInt(customHoldDraft, 10) || 3,
                      );
                      setCustomHoldDraft(String(next));
                      if (next !== parPolicy.holdDays) applyHoldDays(next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.currentTarget.blur();
                    }}
                  />
                  <span>วัน (1–{PAR_HOLD_DAYS_MAX})</span>
                </label>
              ) : null}
            </div>
            {exportMsg ? (
              <p className="mt-1 text-xs font-medium text-emerald-700">{exportMsg}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnOutline}
              onClick={() => void runAnalyze()}
              disabled={busy || loading}
            >
              {busy ? "กำลังวิเคราะห์…" : "วิเคราะห์ใหม่"}
            </button>
            <ShareExportMenu
              busy={exportBusy}
              message={exportMsg}
              disabled={busy || loading || displayedItems.length === 0}
              className={btnOutline}
              label={
                displayedItems.length > 0
                  ? `แชร์ (${displayedItems.length})`
                  : "แชร์"
              }
              sheetTitle={`แชร์แนะนำ${PAR_STOCK_LABEL}`}
              sheetHint="แชร์รูป บันทึกรูป หรือคัดลอกข้อความ"
              onShareImage={handleShareImage}
              onSaveImage={handleSaveImage}
              onCopyText={handleCopyText}
            />
            <button
              type="button"
              className={btnOutline}
              onClick={() => void saveDirtyPar()}
              disabled={busy || loading || dirtyParItems.length === 0}
            >
              {`บันทึก${dirtyParItems.length > 0 ? ` (${dirtyParItems.length})` : ""}`}
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                setZeroIneligibleOnApply(true);
                if (reviewItems.length === 0 && ineligiblePar <= 0) {
                  toast.error("ยังไม่ได้เลือกรายการ", "เลือกเมนูที่ต้องการใช้ค่าแนะนำ");
                  return;
                }
                setReviewOpen(true);
              }}
              disabled={
                busy ||
                loading ||
                (selectedCount === 0 && ineligiblePar <= 0)
              }
            >
              ใช้ค่าที่แนะนำ{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </button>
          </div>
        </div>

        {data?.summary ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              value={data.summary.totalAvgDailySales.toLocaleString("th-TH")}
              label="ขายเฉลี่ยรวม"
              hint="ไม้ / วัน"
            />
            <KpiCard
              value={(data.summary.branchParTarget ?? 0).toLocaleString("th-TH")}
              label="เป้าทั้งร้าน"
              hint={`${parPolicy.branchParMin}–${parPolicy.branchParMax} ไม้`}
            />
            <KpiCard
              value={data.summary.sumCurrentPar.toLocaleString("th-TH")}
              label="ยอดที่ตั้งไว้"
              hint={
                ineligiblePar > 0
                  ? `ในกลุ่ม ${data.summary.eligibleCurrentPar?.toLocaleString("th-TH") ?? "—"} · นอกกลุ่ม ${ineligiblePar.toLocaleString("th-TH")}`
                  : "รวมทุกรายการ"
              }
            />
            <KpiCard
              value={(
                data.summary.eligibleRecommendedPar ??
                data.summary.sumRecommendedPar
              ).toLocaleString("th-TH")}
              label="ยอดที่แนะนำ"
              hint="เฉพาะกลุ่มที่เลือก"
            />
          </div>
        ) : null}

        {kpis && data ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>
              ตั้ง{PAR_STOCK_SHORT_LABEL}ได้{" "}
              <strong className="tabular-nums text-gray-800">{kpis.total}</strong>{" "}
              เมนู
            </span>
            <span>
              แนะนำเปลี่ยน{" "}
              <strong className="tabular-nums text-gray-800">{kpis.needsApply}</strong>
            </span>
            <button
              type="button"
              onClick={() =>
                setFilter((prev) => (prev === "NO_PAR" ? "ELIGIBLE" : "NO_PAR"))
              }
              className={`rounded-full border px-2 py-0.5 text-xs font-medium transition ${
                filter === "NO_PAR"
                  ? "border-amber-400 bg-amber-50 text-amber-900"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              ไม่ได้ตั้ง / {PAR_STOCK_SHORT_LABEL} = 0{" "}
              <strong className="tabular-nums">{kpis.noParAll}</strong>
            </button>
            <button
              type="button"
              onClick={() =>
                setFilter((prev) => (prev === "HAS_PAR" ? "ELIGIBLE" : "HAS_PAR"))
              }
              className={`rounded-full border px-2 py-0.5 text-xs font-medium transition ${
                filter === "HAS_PAR"
                  ? "border-sky-400 bg-sky-50 text-sky-900"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              ตั้ง{PAR_STOCK_SHORT_LABEL}แล้ว{" "}
              <strong className="tabular-nums">{kpis.hasParAll}</strong>
            </button>
            {kpis.hidden > 0 ? (
              <span>
                ซ่อนนอกกลุ่ม{" "}
                <strong className="tabular-nums text-gray-800">{kpis.hidden}</strong>
              </span>
            ) : null}
            <span className="text-gray-400">
              วิเคราะห์ {data.analysisFrom} – {data.analysisTo}
            </span>
            <span className="text-gray-700">
              {PAR_STOCK_LABEL}อัปเดตล่าสุด{" "}
              <strong className="tabular-nums font-medium text-gray-900">
                {formatBangkokDateTime(data.lastParUpdatedAt) || "ยังไม่เคยปรับ"}
              </strong>
            </span>
          </div>
        ) : null}

        {ineligiblePar > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ยังมี{PAR_STOCK_SHORT_LABEL}นอกกลุ่มที่เลือก{" "}
            <strong>{ineligiblePar.toLocaleString("th-TH")}</strong> ไม้
            (ขายช้า/ไม่ขาย) — กดใช้ค่าที่แนะนำเพื่อเคลียร์เป็น 0 ไม่เก็บของ
          </div>
        ) : data?.summary &&
          data.summary.branchParTarget != null &&
          data.summary.sumCurrentPar > data.summary.branchParTarget * 1.2 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {PAR_STOCK_LABEL}ที่ตั้งไว้{" "}
            <strong>{data.summary.sumCurrentPar.toLocaleString("th-TH")}</strong>{" "}
            ไม้ สูงกว่าเป้า — กดวิเคราะห์ใหม่ แล้วใช้ค่าที่แนะนำ (
            {(
              data.summary.eligibleRecommendedPar ??
              data.summary.sumRecommendedPar
            ).toLocaleString("th-TH")}{" "}
            ไม้)
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <p className={`${adminLabelClass} mb-2`}>ช่วงยอดขายและตัวกรอง</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">ตั้งแต่</label>
                <DateInput className={adminInputClass} value={from} onChange={setFrom} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">ถึงวันที่</label>
                <DateInput className={adminInputClass} value={to} onChange={setTo} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">ค้นหาเมนู</label>
                <input
                  className={adminInputClass}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ชื่อ / รหัส เช่น รากบัว"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">แสดงในตาราง</label>
                <select
                  className={adminInputClass}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                >
                  <option value="ELIGIBLE">กลุ่มที่ตั้ง{PAR_STOCK_SHORT_LABEL}ได้</option>
                  <option value="ALL">ทั้งหมด</option>
                  <option value="NEW">สินค้าใหม่ / ยังไม่ขาย</option>
                  <option value="NEEDS_APPLY">ค่าแนะนำต่างจากปัจจุบัน</option>
                  <option value="NO_PAR">ไม่ได้ตั้ง{PAR_STOCK_SHORT_LABEL} / {PAR_STOCK_SHORT_LABEL} = 0</option>
                  <option value="HAS_PAR">ตั้ง{PAR_STOCK_SHORT_LABEL}แล้ว</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              สินค้าที่ยังไม่มียอดขายถูกซ่อนจากกลุ่ม A+B — ค้นหาชื่อ เลือก
              「ทั้งหมด」 / 「สินค้าใหม่」 / 「ไม่ได้ตั้ง{PAR_STOCK_SHORT_LABEL}」 / 「ตั้ง{PAR_STOCK_SHORT_LABEL}แล้ว」
            </p>
          </div>

          <div>
            <p className={`${adminLabelClass} mb-2`}>ตั้ง{PAR_STOCK_SHORT_LABEL}ให้กลุ่ม</p>
            <div className="grid gap-2">
              {GRADE_SET_OPTIONS.map((opt) => {
                const selectedOpt = gradeSetId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setParPolicy((prev) => ({
                        ...prev,
                        eligibleGrades:
                          opt.id === "A"
                            ? ["A"]
                            : opt.id === "ABC"
                              ? ["A", "B", "C"]
                              : ["A", "B"],
                      }));
                      setFilter("ELIGIBLE");
                    }}
                    className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      selectedOpt
                        ? "border-sky-400 bg-sky-50 text-sky-950 shadow-sm"
                        : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                    }`}
                  >
                    <span className="font-medium leading-snug">{opt.title}</span>
                    {opt.hint ? (
                      <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                        {opt.hint}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-sm font-medium text-gray-900">เพดานต่อเมนู (ไม้)</p>
            <p className="mt-0.5 text-xs text-gray-500">
              เพดานต่อเกรด × จำนวนวันถือของ — ไม่เกินเฉลี่ย{" "}
              {parPolicy.holdDays} วันของเมนูนั้น
              {parPolicy.holdDays <= 1 ? " (และไม่ถึง 2 วัน)" : ""}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">A ขายดี</label>
                <input
                  className={`${adminInputClass} tabular-nums`}
                  type="number"
                  min={0}
                  max={200}
                  value={parPolicy.gradeMax.A}
                  onChange={(e) =>
                    setParPolicy((prev) => ({
                      ...prev,
                      gradeMax: {
                        ...prev.gradeMax,
                        A: Number.parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">B ขายปานกลาง</label>
                <input
                  className={`${adminInputClass} tabular-nums`}
                  type="number"
                  min={0}
                  max={200}
                  value={parPolicy.gradeMax.B}
                  onChange={(e) =>
                    setParPolicy((prev) => ({
                      ...prev,
                      gradeMax: {
                        ...prev.gradeMax,
                        B: Number.parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                />
              </div>
              {gradeSetId === "ABC" ? (
                <div>
                  <label className="mb-1 block text-xs text-gray-500">C ขายช้า</label>
                  <input
                    className={`${adminInputClass} tabular-nums`}
                    type="number"
                    min={0}
                    max={200}
                    value={parPolicy.gradeMax.C}
                    onChange={(e) =>
                      setParPolicy((prev) => ({
                        ...prev,
                        gradeMax: {
                          ...prev.gradeMax,
                          C: Number.parseInt(e.target.value, 10) || 0,
                        },
                      }))
                    }
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-sm font-medium text-gray-900">เป้าทั้งร้าน (ไม้)</p>
            <p className="mt-0.5 text-xs text-gray-500">
              รวมทุกเมนูที่ตั้ง{PAR_STOCK_SHORT_LABEL} — ประมาณ {parPolicy.holdDays} วันขาย
              {parPolicy.holdDays <= 1 ? " (ไม่ให้ถึง 2 วัน)" : ""}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">ขั้นต่ำ</label>
                <input
                  className={`${adminInputClass} tabular-nums`}
                  type="number"
                  min={0}
                  value={parPolicy.branchParMin}
                  onChange={(e) =>
                    setParPolicy((prev) => ({
                      ...prev,
                      branchParMin: Number.parseInt(e.target.value, 10) || 0,
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">ขั้นสูง</label>
                <input
                  className={`${adminInputClass} tabular-nums`}
                  type="number"
                  min={0}
                  value={parPolicy.branchParMax}
                  onChange={(e) =>
                    setParPolicy((prev) => ({
                      ...prev,
                      branchParMax: Number.parseInt(e.target.value, 10) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              ปรับค่าแล้วกด <span className="font-medium text-gray-700">วิเคราะห์ใหม่</span>{" "}
              เพื่อคำนวณ{PAR_STOCK_SHORT_LABEL}ที่แนะนำ
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <AdminLoadingState label={`กำลังโหลด${PAR_STOCK_LABEL}…`} />
      ) : !data || filteredItems.length === 0 ? (
        <AdminEmptyState
          title={
            query.trim()
              ? "ไม่พบเมนูที่ตรงกับคำค้น"
              : filter === "NEW"
                ? "ยังไม่มีสินค้าใหม่ / ยังไม่ขาย"
                : filter === "NO_PAR"
                  ? `ทุกรายการตั้ง${PAR_STOCK_SHORT_LABEL}แล้ว`
                  : filter === "HAS_PAR"
                    ? `ยังไม่มีรายการที่ตั้ง${PAR_STOCK_SHORT_LABEL}`
                    : "ไม่มีเมนูในกลุ่มที่เลือก"
          }
          description={
            query.trim()
              ? "ลองค้นหาชื่อหรือรหัสอื่น หรือเลือกแสดงทั้งหมด"
              : filter === "NO_PAR"
                ? `ไม่มีเมนูที่${PAR_STOCK_SHORT_LABEL}เป็น 0 — เลือก 「ตั้ง${PAR_STOCK_SHORT_LABEL}แล้ว」 ถ้าต้องการดูรายการที่ตั้งไว้`
                : filter === "HAS_PAR"
                  ? `ยังไม่มีเมนูที่${PAR_STOCK_SHORT_LABEL}มากกว่า 0 — เลือก 「ไม่ได้ตั้ง${PAR_STOCK_SHORT_LABEL}」 เพื่อตั้งค่า`
                  : `ตารางปริยายแสดงเฉพาะกลุ่มที่ตั้ง${PAR_STOCK_SHORT_LABEL}ได้ — ค้นหาชื่อ หรือเลือก ทั้งหมด / สินค้าใหม่ / ไม่ได้ตั้ง${PAR_STOCK_SHORT_LABEL} / ตั้ง${PAR_STOCK_SHORT_LABEL}แล้ว`
          }
        />
      ) : (
        <>
          <div
            ref={captureRef}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
          >
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">
                แนะนำ{PAR_STOCK_LABEL}
                {data.branchName ? ` — ${data.branchName}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                ช่วง {data.analysisFrom} – {data.analysisTo}
                {formatBangkokDateTime(data.lastParUpdatedAt)
                  ? ` · ${PAR_STOCK_LABEL}อัปเดตล่าสุด ${formatBangkokDateTime(data.lastParUpdatedAt)}`
                  : ""}
                {captureStamp ? ` · แคป ${captureStamp}` : ""}
              </p>
            </div>
            {!exportCapturing ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-3 py-2.5">
              <span className="mr-1 text-xs text-gray-500">เรียง:</span>
              {(
                [
                  ["sold", "ขายมาก"],
                  ["waste", "เสียมาก"],
                  ["stock", "สต็อกน้อย"],
                  ["refill", "ควรเติมมาก"],
                  ["avg", "เฉลี่ย/วัน"],
                  ["maxDaily", "ขายสูงสุด"],
                  ["minDaily", "ขายต่ำสุด"],
                  ["name", "ชื่อ"],
                ] as const
              ).map(([key, label]) => {
                const presetDir: SortDir =
                  key === "stock" || key === "name" || key === "minDaily"
                    ? "asc"
                    : "desc";
                const active = sortKey === key && sortDir === presetDir;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSortKey(key);
                      setSortDir(presetDir);
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      active
                        ? "bg-sky-700 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs">
                  <tr>
                    {!exportCapturing ? (
                    <th className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={
                          displayedItems.length > 0 &&
                          displayedItems.every((r) => selected[r.menuItemId])
                        }
                        onChange={(e) => toggleAllVisible(e.target.checked)}
                        aria-label="เลือกทั้งหมด"
                      />
                    </th>
                    ) : null}
                    <SortTh
                      label="รหัส"
                      sortKey="code"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="เมนู"
                      sortKey="name"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="กลุ่มขาย"
                      sortKey="grade"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="หมวด"
                      sortKey="category"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="ขาย"
                      sortKey="sold"
                      activeKey={sortKey}
                      dir={sortDir}
                      align="right"
                      title="จำนวนขายในช่วงวันที่วิเคราะห์"
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="เสีย"
                      sortKey="waste"
                      activeKey={sortKey}
                      dir={sortDir}
                      align="right"
                      title="ของเสียในช่วงวันที่วิเคราะห์"
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="เฉลี่ย/วัน"
                      sortKey="avg"
                      activeKey={sortKey}
                      dir={sortDir}
                      align="right"
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="ต่ำสุด"
                      sortKey="minDaily"
                      activeKey={sortKey}
                      dir={sortDir}
                      align="right"
                      title="ยอดขายต่ำสุดต่อวัน (เฉพาะวันที่มียอดขาย)"
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="สูงสุด"
                      sortKey="maxDaily"
                      activeKey={sortKey}
                      dir={sortDir}
                      align="right"
                      title={`ยอดขายสูงสุดต่อวัน — เทียบกับ${PAR_STOCK_SHORT_LABEL}ว่าวันแน่นพอไหม`}
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="สต็อกปัจจุบัน"
                      sortKey="stock"
                      activeKey={sortKey}
                      dir={sortDir}
                      align="right"
                      onSort={toggleSort}
                    />
                    <SortTh
                      label={PAR_STOCK_SHORT_LABEL}
                      sortKey="par"
                      activeKey={sortKey}
                      dir={sortDir}
                      align="right"
                      title={`ค่า${PAR_STOCK_LABEL}ที่ตั้งไว้ — ใต้ช่องมีวันเวลาที่ปรับล่าสุด`}
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="แนะนำ"
                      sortKey="recommended"
                      activeKey={sortKey}
                      dir={sortDir}
                      align="right"
                      onSort={toggleSort}
                    />
                    <SortTh
                      label="ควรเติม"
                      sortKey="refill"
                      activeKey={sortKey}
                      dir={sortDir}
                      align="right"
                      title={`ควรเติม = ${PAR_STOCK_SHORT_LABEL} − สต็อกปัจจุบัน`}
                      onSort={toggleSort}
                    />
                    <th className="px-3 py-3 text-left font-semibold uppercase tracking-wide text-gray-600">
                      ข้อมูล
                    </th>
                    {!exportCapturing ? (
                    <th className="px-3 py-3 text-left font-semibold uppercase tracking-wide text-gray-600">
                      Action
                    </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedItems.map((row) => (
                    <tr
                      key={row.menuItemId}
                      className={`hover:bg-gray-50/80 ${!row.parEligible ? "opacity-60" : ""}`}
                    >
                      {!exportCapturing ? (
                      <td className="px-3 py-2.5 align-top">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[row.menuItemId])}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [row.menuItemId]: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      ) : null}
                      <td className="px-3 py-2.5 align-top">
                        <MenuItemCodeBadge code={row.productCode} />
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <MenuThumb url={row.imageUrl} name={row.name} />
                          <span className="font-medium text-gray-900">{row.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${GRADE_TONE[row.salesGrade] ?? GRADE_TONE.SKIP}`}
                        >
                          {row.salesGradeLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-gray-500">
                        {row.category ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums align-top">
                        {(row.totalSold ?? 0).toLocaleString("th-TH")}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums align-top ${
                          (row.wasteQty ?? 0) > 0 ? "font-medium text-rose-700" : "text-gray-500"
                        }`}
                      >
                        {(row.wasteQty ?? 0).toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums align-top text-gray-600">
                        {row.avgDailySales.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums align-top text-gray-600">
                        {(row.minDailySales ?? 0).toLocaleString("th-TH")}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums align-top ${
                          (row.maxDailySales ?? 0) > row.avgDailySales * 1.5
                            ? "font-medium text-amber-800"
                            : "text-gray-600"
                        }`}
                        title={`ยอดขายสูงสุดต่อวัน (เฉพาะวันที่มียอดขาย) — เทียบกับ${PAR_STOCK_SHORT_LABEL}ว่าวันแน่นพอไหม`}
                      >
                        {(row.maxDailySales ?? 0).toLocaleString("th-TH")}
                      </td>
                      <MenuStockQtyCell
                        quantity={row.availableStock}
                        stockTracked={row.stockTracked}
                      />
                      <td className="px-3 py-2.5 text-right align-top">
                        <div className="flex flex-col items-end gap-0.5">
                          <input
                            className={`${adminInputClass} w-20 text-right tabular-nums`}
                            type="number"
                            min={0}
                            value={manualDraft[row.menuItemId] ?? "0"}
                            onChange={(e) =>
                              setManualDraft((prev) => ({
                                ...prev,
                                [row.menuItemId]: e.target.value,
                              }))
                            }
                          />
                          <span
                            className="max-w-[7.5rem] text-[10px] leading-tight text-gray-400"
                            title={`วันเวลาที่ปรับ${PAR_STOCK_SHORT_LABEL}ล่าสุด`}
                          >
                            {formatBangkokDateTime(row.parUpdatedAt) || "ยังไม่ปรับ"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium align-top">
                        {row.parEligible ? (
                          row.recommendedParStock.toLocaleString("th-TH")
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums align-top">
                        <ParRefillCell row={row} manualDraft={manualDraft} />
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${DATA_QUALITY_TONE[row.dataQuality]}`}
                        >
                          {dataQualityLabel(row.dataQuality)}
                        </span>
                      </td>
                      {!exportCapturing ? (
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className={`${btnOutline} text-xs`}
                            disabled={busy}
                            onClick={() => void saveManualPar(row.menuItemId)}
                          >
                            บันทึก{PAR_STOCK_SHORT_LABEL}
                          </button>
                          <button
                            type="button"
                            className={`${btnPrimary} text-xs`}
                            disabled={
                              busy ||
                              row.recommendedParStock <= 0 ||
                              row.recommendedParStock === row.currentParStock
                            }
                            onClick={() => {
                              setZeroIneligibleOnApply(false);
                              setSelected({ [row.menuItemId]: true });
                              setReviewOpen(true);
                            }}
                          >
                            ใช้ค่าที่แนะนำ
                          </button>
                        </div>
                      </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900">
                  <tr>
                    <td className="px-3 py-3" colSpan={exportCapturing ? 4 : 5}>
                      รวม ({tableTotals.count.toLocaleString("th-TH")} รายการที่กรอกได้)
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {tableTotals.sold.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-rose-700">
                      {tableTotals.waste.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {tableTotals.avgDaily.toLocaleString("th-TH", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td
                      className="px-3 py-3 text-right tabular-nums text-gray-500"
                      title="ต่ำสุดของ SKU ที่แสดง (ไม่ใช่ผลรวมสาขา)"
                    >
                      {tableTotals.minDaily.toLocaleString("th-TH")}
                    </td>
                    <td
                      className="px-3 py-3 text-right tabular-nums"
                      title="สูงสุดของ SKU ที่แสดง (ไม่ใช่ผลรวมสาขา)"
                    >
                      {tableTotals.maxDaily.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {tableTotals.available.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {tableTotals.currentPar.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {tableTotals.recommendedPar.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-amber-800">
                      {tableTotals.refill.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-3" colSpan={exportCapturing ? 1 : 2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      <AdminModal
        open={reviewOpen}
        onClose={() => {
          if (!busy) setReviewOpen(false);
        }}
        busy={busy}
        title={`ยืนยันใช้${PAR_STOCK_LABEL}ที่แนะนำ`}
        description={
          zeroIneligibleOnApply && ineligiblePar > 0
            ? `เปลี่ยน${PAR_STOCK_SHORT_LABEL} ${reviewItems.length} เมนูในกลุ่มที่เลือก และเคลียร์${PAR_STOCK_SHORT_LABEL}นอกกลุ่ม ${ineligiblePar.toLocaleString("th-TH")} ไม้ เป็น 0 — ไม่กระทบสต๊อกคงเหลือ`
            : `เปลี่ยน${PAR_STOCK_SHORT_LABEL} ${reviewItems.length} เมนู — ไม่กระทบสต๊อกคงเหลือ`
        }
        maxWidthClassName="max-w-3xl"
      >
        <div className="space-y-4 p-5">
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
                <tr>
                  <th className="px-3 py-2">เมนู</th>
                  <th className="px-3 py-2">รหัส</th>
                  <th className="px-3 py-2 text-right">{PAR_STOCK_SHORT_LABEL}ปัจจุบัน</th>
                  <th className="px-3 py-2 text-right">{PAR_STOCK_SHORT_LABEL}ที่แนะนำ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reviewItems.map((row) => (
                  <tr key={row.menuItemId}>
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <MenuThumb url={row.imageUrl} name={row.name} />
                        <span className="font-medium">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">
                      {row.productCode}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.currentParStock.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {row.recommendedParStock.toLocaleString("th-TH")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              className={btnOutline}
              onClick={() => setReviewOpen(false)}
              disabled={busy}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void confirmApplyRecommended()}
              disabled={busy}
            >
              {busy ? "กำลังบันทึก…" : "ยืนยันใช้ค่าที่แนะนำ"}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
