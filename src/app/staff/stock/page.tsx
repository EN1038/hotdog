"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { toPng } from "html-to-image";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffBranchStockHistoryPanel } from "@/components/staff/StaffBranchStockHistoryPanel";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { compareThaiText } from "@/lib/thai-sort";
import {
  assignStableMenuSequence,
  sortStaffMenuItems,
} from "@/lib/staff-menu-order";
import { formatPrice, bangkokDateKey } from "@/lib/constants";
import { DateInput } from "@/components/DateInput";
import {
  IconCamera,
  IconClose,
  IconSkewerPlaceholder,
  IconUpload,
} from "@/components/icons";
import {
  DEFAULT_STOCK_COUNT_TIMING,
  STOCK_COUNT_TIMING_LABEL,
  STOCK_COUNT_TIMING_OPTIONS,
  type StockCountTiming,
} from "@/lib/stock-count-timing";
import {
  STOCK_OUTBOUND_PURPOSE_LABEL,
  type StockOutboundPurpose,
} from "@/lib/stock-outbound";
import { StockDocumentNoField } from "@/components/stock/StockDocumentNoField";
import { WAREHOUSE_UI_ENABLED } from "@/lib/warehouse-ui";
import {
  provisionalStockDocumentNo,
  type StockDocumentKind,
} from "@/lib/stock-document-no-format";
import { MAX_STOCK_MOVEMENT_IMAGES } from "@/lib/stock-movement-images";

type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

const STOCK_TYPE_LABEL: Record<StockType, string> = {
  SALE_ITEM: "เมนูขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

function formatBranchLabel(branchName: string) {
  return branchName.replace(/^สาขา\s*/, "").trim();
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function formatBangkokDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type StockQtyValue = {
  quantity: number;
  valueBaht: number;
};

type Product = {
  id: string;
  name: string;
  unit: string;
  stockType: StockType;
  category?: string | null;
  sortOrder?: number;
  categorySortOrder?: number;
  lowStockAlert: number | null;
  trackStock?: boolean;
  imageUrl?: string | null;
  price?: number;
  isMenu?: boolean;
  defaultShelfLifeDays?: number | null;
};

function StockItemName({
  name,
  unit,
  stockType,
}: {
  name: string;
  unit?: string | null;
  stockType?: StockType | null;
}) {
  const showUnit =
    (stockType === "CONSUMABLE" || stockType === "EQUIPMENT") &&
    Boolean(unit?.trim());
  return (
    <p className="truncate text-sm font-bold text-gray-900 leading-tight">
      {name}
      {showUnit ? (
        <span className="font-bold text-red-600"> ({unit!.trim()})</span>
      ) : null}
    </p>
  );
}

type Balance = {
  id: string;
  quantity: number;
  product: Product;
};

type Pending = {
  id: string;
  quantity: number;
  note: string | null;
  createdAt: string;
  kind?: string;
  product: { id: string; name: string; unit: string; stockType?: StockType };
  sourceBranch?: { id: string; name: string } | null;
};

type Payload = {
  stockActive: boolean;
  locationId: string | null;
  balances: Balance[];
  products: Product[];
  lowItems: Balance[];
  pending: Pending[];
  brandBranches?: Array<{ id: string; name: string }>;
  lastStockCountAt?: string | null;
  lastStockCountAtByType?: Partial<Record<StockType, string | null>>;
  lastSaleAt?: string | null;
  summary?: {
    monthLabel: string;
    currentByType: Record<StockType, StockQtyValue>;
    wasteByType: Record<StockType, StockQtyValue>;
  };
};

function issueNoteForBranch(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("สาขา") ? trimmed : `สาขา ${trimmed}`;
}

function formatStockActivityAt(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export default function StaffStockPage() {
  return (
    <Suspense
      fallback={
        <StaffAppShell active="stock">
          <LoadingState />
        </StaffAppShell>
      }
    >
      <StaffStockContent />
    </Suspense>
  );
}

function StaffStockContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openAsDailySummary = searchParams.get("action") === "summary";
  const openAsPending = searchParams.get("action") === "pending";
  const openAsView = searchParams.get("action") === "view";
  const openAsIssue = searchParams.get("action") === "issue";
  const openViewTypeParam = searchParams.get("type");
  const openViewStockType: StockType =
    openViewTypeParam === "CONSUMABLE" || openViewTypeParam === "EQUIPMENT"
      ? openViewTypeParam
      : "SALE_ITEM";
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiveBusyId, setReceiveBusyId] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);

  const [mode, setMode] = useState<
    | "menu"
    | "history"
    | "select_timing"
    | "select_issue_purpose"
    | "select_type"
    | "items"
    | "summary"
    | "pending"
  >("menu");
  const [actionType, setActionType] = useState<
    "stock_in" | "issue" | "pending" | "view" | "summary" | null
  >(null);
  const [issuePurpose, setIssuePurpose] = useState<StockOutboundPurpose | null>(
    null,
  );
  const [summaryTiming, setSummaryTiming] = useState<StockCountTiming>(
    DEFAULT_STOCK_COUNT_TIMING,
  );

  const [typeFilter, setTypeFilter] = useState<"ALL" | StockType>("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({});

  const [issueNote, setIssueNote] = useState("");
  const [issueTargetBranchId, setIssueTargetBranchId] = useState<string | null>(
    null,
  );
  const [documentNo, setDocumentNo] = useState("");
  const [docGenBusy, setDocGenBusy] = useState(false);
  const [producedAt, setProducedAt] = useState(() => bangkokDateKey());
  const [stockInImageUrls, setStockInImageUrls] = useState<string[]>([]);
  const [stockInImageBusy, setStockInImageBusy] = useState(false);
  const stockInImageInputRef = useRef<HTMLInputElement>(null);
  const [issueImageUrls, setIssueImageUrls] = useState<string[]>([]);
  const [issueImageBusy, setIssueImageBusy] = useState(false);
  const issueImageInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraFor, setCameraFor] = useState<"issue" | "stock_in">("issue");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cashVal, setCashVal] = useState("");
  const [transferVal, setTransferVal] = useState("");
  const [changeVal, setChangeVal] = useState("");
  const [customersVal, setCustomersVal] = useState("");
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [attemptedSummary, setAttemptedSummary] = useState(false);

  const stockCaptureRef = useRef<HTMLDivElement>(null);
  const [exportBusy, setExportBusy] = useState<"save" | "share" | "copy" | null>(
    null,
  );
  const [exportMsg, setExportMsg] = useState("");
  const [brandName, setBrandName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [stockViewDateTimeLabel, setStockViewDateTimeLabel] = useState(
    formatBangkokDateTime,
  );

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch("/api/staff/stock", {
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      if (res.status === 403 || res.status === 404) {
        setData({
          stockActive: false,
          locationId: null,
          balances: [],
          products: [],
          lowItems: [],
          pending: [],
        });
        return;
      }
      if (!res.ok) {
        setLoadError(
          res.status >= 500
            ? "เซิร์ฟเวอร์สต๊อกตอบช้า — ลองใหม่อีกครั้ง"
            : "โหลดสต๊อกไม่สำเร็จ",
        );
        return;
      }
      setData((await res.json()) as Payload);
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      setLoadError(
        aborted
          ? "โหลดสต๊อกนานเกินไป — ลองใหม่"
          : "เชื่อมต่อไม่ได้ — ตรวจเน็ตแล้วลองใหม่",
      );
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/staff/branding");
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const nextBrand =
          (typeof data.brand?.nameTh === "string" && data.brand.nameTh.trim()) ||
          (typeof data.brand?.name === "string" && data.brand.name.trim()) ||
          "";
        const nextBranch =
          typeof data.branchName === "string" ? data.branchName.trim() : "";
        if (nextBrand) setBrandName(nextBrand);
        if (nextBranch) setBranchName(nextBranch);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, []);

  useEffect(() => {
    setExportMsg("");
    setExportBusy(null);
  }, [mode, actionType, typeFilter, categoryFilter]);

  useEffect(() => {
    if (mode !== "items" || actionType !== "view") return;
    const tick = () => setStockViewDateTimeLabel(formatBangkokDateTime());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [mode, actionType, typeFilter]);

  useEffect(() => {
    if (!openAsDailySummary || loading || !data?.stockActive) return;
    setActionType("summary");
    setMode("select_timing");
    setSummaryTiming(DEFAULT_STOCK_COUNT_TIMING);
    setTypeFilter("ALL");
    setQtyByItemId({});
    setCashVal("");
    setTransferVal("");
    setChangeVal("");
    setCustomersVal("");
    setAttemptedSummary(false);
  }, [openAsDailySummary, loading, data?.stockActive]);

  useEffect(() => {
    if (!WAREHOUSE_UI_ENABLED) return;
    if (!openAsPending || loading || !data?.stockActive) return;
    setActionType("pending");
    setMode("pending");
  }, [openAsPending, loading, data?.stockActive]);

  useEffect(() => {
    if (!openAsView || loading || !data?.stockActive) return;
    setActionType("view");
    setMode("items");
    setTypeFilter(openViewStockType);
    setQtyByItemId({});
    setCategoryFilter("ALL");
  }, [openAsView, openViewStockType, loading, data?.stockActive]);

  useEffect(() => {
    if (!openAsIssue || loading || !data?.stockActive) return;
    setActionType("issue");
    setMode("select_issue_purpose");
    setTypeFilter(openViewStockType);
    setQtyByItemId({});
    setCategoryFilter("ALL");
    clearIssueFields();
  }, [openAsIssue, openViewStockType, loading, data?.stockActive]);

  const categories = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { id: string; name: string; categorySortOrder: number }
    >();
    for (const item of data.products) {
      if (typeFilter !== "ALL" && item.stockType !== typeFilter) continue;
      const name = item.category || "ไม่มีหมวดหมู่";
      const id = name;
      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          categorySortOrder: item.categorySortOrder ?? 999,
        });
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        a.categorySortOrder - b.categorySortOrder ||
        compareThaiText(a.name, b.name),
    );
  }, [data, typeFilter]);

  const typedCatalog = useMemo(() => {
    if (!data) return [];
    let list = data.products;
    if (typeFilter !== "ALL") {
      list = list.filter((item) => item.stockType === typeFilter);
    }
    return sortStaffMenuItems(list);
  }, [data, typeFilter]);

  const seqById = useMemo(
    () => assignStableMenuSequence(typedCatalog),
    [typedCatalog],
  );

  const visibleItems = useMemo(() => {
    let list = typedCatalog;
    if (categoryFilter !== "ALL") {
      list = list.filter(
        (item) => (item.category || "ไม่มีหมวดหมู่") === categoryFilter,
      );
    }
    return list;
  }, [typedCatalog, categoryFilter]);

  /** กลุ่มเมนูในหน้ารับเข้า / สต็อก / จ่ายออก */
  const visibleItemSections = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        categorySortOrder: number;
        items: Product[];
      }
    >();
    for (const item of visibleItems) {
      const name = item.category || "ไม่มีหมวดหมู่";
      const existing = map.get(name);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(name, {
          id: name,
          name,
          categorySortOrder: item.categorySortOrder ?? 999,
          items: [item],
        });
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        a.categorySortOrder - b.categorySortOrder ||
        compareThaiText(a.name, b.name),
    );
  }, [visibleItems]);

  const showItemCategoryHeaders =
    categoryFilter === "ALL" &&
    (categories.length > 1 ||
      (visibleItemSections.length === 1 &&
        visibleItemSections[0]?.name !== "ไม่มีหมวดหมู่"));

  const viewSummary = useMemo(() => {
    const empty = { quantity: 0, valueBaht: 0 };
    if (!data || typeFilter === "ALL") {
      return {
        monthLabel: data?.summary?.monthLabel ?? "",
        current: empty,
        waste: empty,
      };
    }
    return {
      monthLabel: data.summary?.monthLabel ?? "",
      current: data.summary?.currentByType?.[typeFilter] ?? empty,
      waste: data.summary?.wasteByType?.[typeFilter] ?? empty,
    };
  }, [data, typeFilter]);

  const selectedItems = useMemo(() => {
    const changes: { id: string; name: string; quantity: number }[] = [];
    if (!data) return changes;
    for (const prod of data.products) {
      const q = qtyByItemId[prod.id] ?? 0;
      if (q > 0) {
        changes.push({ id: prod.id, name: prod.name, quantity: q });
      }
    }
    return changes;
  }, [data, qtyByItemId]);

  const selectedTotalQty = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.quantity, 0),
    [selectedItems],
  );

  const summaryStockType: StockType =
    typeFilter !== "ALL" ? typeFilter : "SALE_ITEM";
  const summaryTypeLabel = STOCK_TYPE_LABEL[summaryStockType];
  const summaryTimingLabel = STOCK_COUNT_TIMING_LABEL[summaryTiming];
  const summaryIncludesSales = summaryStockType === "SALE_ITEM";

  const summaryItems = useMemo(() => {
    if (!data || typeFilter === "ALL") return [];
    return sortStaffMenuItems(
      data.products.filter((p) => p.stockType === typeFilter),
    );
  }, [data, typeFilter]);

  const summarySeqById = useMemo(
    () => assignStableMenuSequence(summaryItems),
    [summaryItems],
  );

  /** กลุ่มตามหมวดเมนู — ใช้แสดงหัวข้อตอนนับสต๊อก */
  const summarySections = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        categorySortOrder: number;
        items: Product[];
      }
    >();
    for (const item of summaryItems) {
      const name = item.category || "ไม่มีหมวดหมู่";
      const existing = map.get(name);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(name, {
          id: name,
          name,
          categorySortOrder: item.categorySortOrder ?? 999,
          items: [item],
        });
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        a.categorySortOrder - b.categorySortOrder ||
        compareThaiText(a.name, b.name),
    );
  }, [summaryItems]);

  const visibleSummarySections = useMemo(() => {
    if (categoryFilter === "ALL") return summarySections;
    return summarySections.filter((s) => s.id === categoryFilter);
  }, [summarySections, categoryFilter]);

  const summaryTodayLabel = useMemo(() => {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date());
  }, []);

  /** Untouched / blank counted qty = 0 */
  function summaryCountedQty(itemId: string): number {
    const raw = qtyByItemId[itemId];
    if (raw === undefined || (raw as unknown) === "") return 0;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  const summaryEnteredStats = useMemo(() => {
    let totalQty = 0;
    for (const item of summaryItems) {
      totalQty += summaryCountedQty(item.id);
    }
    return {
      itemCount: summaryItems.length,
      filledItems: summaryItems.length,
      totalQty,
      todayKey: bangkokDateKey(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- summaryCountedQty closes over qtyByItemId
  }, [summaryItems, qtyByItemId]);

  const summaryDiffItems = useMemo(() => {
    if (!data) return [];
    const balanceById = new Map(
      data.balances.map((b) => [b.product.id, b.quantity] as const),
    );
    const diffs: Array<{
      id: string;
      name: string;
      seq: number;
      systemQty: number;
      countedQty: number;
    }> = [];
    for (const item of summaryItems) {
      const counted = summaryCountedQty(item.id);
      const systemQty = balanceById.get(item.id) ?? 0;
      if (counted === systemQty) continue;
      diffs.push({
        id: item.id,
        name: item.name,
        seq: summarySeqById.get(item.id) ?? 0,
        systemQty,
        countedQty: counted,
      });
    }
    return diffs.sort(
      (a, b) =>
        (a.seq || 0) - (b.seq || 0) || a.name.localeCompare(b.name, "th"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- summaryCountedQty closes over qtyByItemId
  }, [data, summaryItems, qtyByItemId, summarySeqById]);

  function validateSummaryForm(): boolean {
    setAttemptedSummary(true);
    if (summaryItems.length === 0) {
      toast.error(`ไม่มีรายการ${summaryTypeLabel}ให้นับสต๊อก`);
      return false;
    }
    // Stock qty: untouched / blank = 0 (allowed). Only finance is required for SALE_ITEM.
    const missingFinance: string[] = [];
    if (summaryIncludesSales) {
      if (cashVal.trim() === "") missingFinance.push("เงินสด");
      if (transferVal.trim() === "") missingFinance.push("เงินโอน");
      if (changeVal.trim() === "") missingFinance.push("เงินทอน");
      if (customersVal.trim() === "") missingFinance.push("จำนวนลูกค้า");
    }

    if (missingFinance.length > 0) {
      toast.error(
        `ยังไม่ได้กรอก: ${missingFinance.join(", ")} — เลื่อนลงไปส่วน 2–3`,
      );
      setTimeout(() => {
        const target =
          document.querySelector<HTMLElement>("[data-summary-missing]") ||
          document.querySelector<HTMLElement>("#summary-finance-section");
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return false;
    }
    return true;
  }

  function setQty(itemId: string, next: number) {
    setQtyByItemId((prev) => {
      const q = Math.max(0, Math.floor(next));
      if (q === 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: q };
    });
  }

  const handleActionClick = (action: "stock_in" | "issue" | "pending" | "summary" | "view" | "history") => {
    if (action === "history") {
      setMode("history");
      setActionType(null);
      return;
    }
    if (action === "stock_in" || action === "issue") {
      startCreateFromHistory(action);
      return;
    }
    if (action === "pending") {
      if (!WAREHOUSE_UI_ENABLED) return;
      setActionType("pending");
      setMode("pending");
      return;
    }
    if (action === "summary") {
      setActionType("summary");
      setMode("select_timing");
      setSummaryTiming(DEFAULT_STOCK_COUNT_TIMING);
      setTypeFilter("ALL");
      setQtyByItemId({});
      setCategoryFilter("ALL");
      setCashVal("");
      setTransferVal("");
      setChangeVal("");
      setCustomersVal("");
      setAttemptedSummary(false);
      setShowSummaryModal(false);
      setShowReviewModal(false);
      return;
    }
    setActionType(action);
    setMode("select_type");
    setQtyByItemId({});
    setCategoryFilter("ALL");
    clearIssueFields();
  };

  function startCreateFromHistory(kind: "stock_in" | "issue") {
    setActionType(kind);
    setQtyByItemId({});
    setCategoryFilter("ALL");
    setDocumentNo(
      provisionalStockDocumentNo({
        kind: kind === "stock_in" ? "IN" : "OUT",
        branchCode: formatBranchLabel(branchName) || branchName,
      }),
    );
    if (kind === "stock_in") {
      setProducedAt(bangkokDateKey());
      setStockInImageUrls([]);
    }
    clearIssueFields();
    if (kind === "issue") {
      setIssuePurpose(null);
      setMode("select_issue_purpose");
      return;
    }
    setMode("select_type");
  }

  const handleTypeSelectClick = (type: StockType) => {
    setTypeFilter(type);
    setCategoryFilter("ALL");
    setQtyByItemId({});
    if (actionType === "summary") {
      setMode("summary");
      setCashVal("");
      setTransferVal("");
      setChangeVal("");
      setCustomersVal("");
      setAttemptedSummary(false);
      return;
    }
    setMode("items");
  };

  async function genDocumentNo(kind: StockDocumentKind): Promise<string> {
    setDocGenBusy(true);
    try {
      const res = await fetch(`/api/staff/stock/document-no?kind=${kind}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? "สร้างเลขที่เอกสารไม่สำเร็จ");
      }
      const next = String(json.documentNo ?? "").trim();
      if (next) {
        setDocumentNo(next);
        return next;
      }
    } catch {
      /* fall through to provisional */
    } finally {
      setDocGenBusy(false);
    }
    const fallback = provisionalStockDocumentNo({
      kind,
      branchCode: formatBranchLabel(branchName) || branchName,
    });
    setDocumentNo(fallback);
    return fallback;
  }

  useEffect(() => {
    if (mode !== "items") return;
    if (actionType !== "stock_in" && actionType !== "issue") return;
    const kind = actionType === "stock_in" ? "IN" : "OUT";
    setDocumentNo((prev) =>
      prev.trim()
        ? prev
        : provisionalStockDocumentNo({
            kind,
            branchCode: formatBranchLabel(branchName) || branchName,
          }),
    );
    void genDocumentNo(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gen when entering items mode
  }, [mode, actionType]);

  const stockTypeLabel =
    typeFilter !== "ALL" ? STOCK_TYPE_LABEL[typeFilter] : "สต็อก";

  async function captureStockViewPng(): Promise<string> {
    flushSync(() => {
      setStockViewDateTimeLabel(formatBangkokDateTime());
    });
    const node = stockCaptureRef.current;
    if (!node) throw new Error("ไม่พบเนื้อหาสต็อก");
    return toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
  }

  function stockExportFilename() {
    const typePart =
      typeFilter !== "ALL" ? STOCK_TYPE_LABEL[typeFilter] : "สต็อก";
    return `ยอดคงเหลือ_${typePart}_${bangkokDateKey()}.png`;
  }

  async function handleSaveStockImage() {
    if (exportBusy || actionType !== "view") return;
    setExportBusy("save");
    setExportMsg("");
    try {
      const dataUrl = await captureStockViewPng();
      downloadDataUrl(dataUrl, stockExportFilename());
      setExportMsg("บันทึกรูปแล้ว");
    } catch {
      setExportMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareStockImage() {
    if (exportBusy || actionType !== "view") return;
    setExportBusy("share");
    setExportMsg("");
    try {
      const dataUrl = await captureStockViewPng();
      const blob = await dataUrlToBlob(dataUrl);
      const file = new File([blob], stockExportFilename(), { type: "image/png" });
      const branchLabel = formatBranchLabel(branchName);

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          files: [file],
          title: [
            brandName,
            branchLabel ? `สาขา ${branchLabel}` : "",
            `ยอดคงเหลือ ${stockTypeLabel}`,
          ]
            .filter(Boolean)
            .join(" · "),
          text: `ยอดคงเหลือ ${stockTypeLabel}`,
        });
        setExportMsg("แชร์รูปแล้ว");
        return;
      }

      downloadDataUrl(dataUrl, stockExportFilename());
      setExportMsg("อุปกรณ์นี้แชร์ไม่ได้ — บันทึกรูปแทนแล้ว ส่งในไลน์จากแกลเลอรี");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setExportMsg("");
        return;
      }
      setExportMsg("แชร์รูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  function buildStockViewCopyText() {
    const branchLabel = formatBranchLabel(branchName);
    const when = formatBangkokDateTime();
    const lines: string[] = [];
    if (brandName) lines.push(brandName);
    if (branchLabel) lines.push(`สาขา ${branchLabel}`);
    lines.push(`ยอดคงเหลือ · ${stockTypeLabel}`);
    lines.push(when);
    if (categoryFilter !== "ALL") lines.push(`หมวด ${categoryFilter}`);
    lines.push("");
    lines.push(
      `สต๊อกปัจจุบัน คงเหลือ: ${formatPrice(viewSummary.current.quantity)} (มูลค่า ${formatPrice(Math.round(viewSummary.current.valueBaht))} บาท)`,
    );
    lines.push(
      `สต๊อกสะสมของเสีย: ${formatPrice(viewSummary.waste.quantity)} (มูลค่า ${formatPrice(Math.round(viewSummary.waste.valueBaht))} บาท)${
        viewSummary.monthLabel ? ` · ${viewSummary.monthLabel}` : ""
      }`,
    );
    lines.push("");
    lines.push("รายการ:");
    if (!data || visibleItems.length === 0) {
      lines.push("- ไม่มีรายการ");
    } else {
      for (const item of visibleItems) {
        const qty =
          data.balances.find((b) => b.product.id === item.id)?.quantity ?? 0;
        const seq = seqById.get(item.id) ?? 0;
        const unit =
          (item.stockType === "CONSUMABLE" || item.stockType === "EQUIPMENT") &&
          item.unit?.trim()
            ? ` (${item.unit.trim()})`
            : "";
        lines.push(
          `${seq}. ${item.name}${unit}: ${qty.toLocaleString("th-TH")}`,
        );
      }
    }
    return lines.join("\n");
  }

  async function copyTextToClipboard(text: string) {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("copy failed");
  }

  async function handleCopyStockText() {
    if (exportBusy || actionType !== "view") return;
    setExportBusy("copy");
    setExportMsg("");
    try {
      flushSync(() => {
        setStockViewDateTimeLabel(formatBangkokDateTime());
      });
      await copyTextToClipboard(buildStockViewCopyText());
      setExportMsg("คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย");
    } catch {
      setExportMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  function clearIssueFields() {
    setIssueNote("");
    setIssueTargetBranchId(null);
    setIssuePurpose(null);
    setIssueImageUrls([]);
  }

  function selectIssueTargetBranch(branch: { id: string; name: string }) {
    if (issueTargetBranchId === branch.id) {
      setIssueTargetBranchId(null);
      const auto = issueNoteForBranch(branch.name);
      if (issueNote.trim() === auto) setIssueNote("");
      return;
    }
    setIssueTargetBranchId(branch.id);
    setIssueNote(issueNoteForBranch(branch.name));
  }

  const handleBack = () => {
    if (mode === "history") {
      setMode("menu");
      return;
    }
    if (mode === "pending") {
      if (openAsPending) {
        router.replace("/staff");
        return;
      }
      setMode("menu");
      setActionType(null);
      return;
    }
    if (mode === "items") {
      if (actionType === "view" && openAsView) {
        router.replace("/staff/summary");
        return;
      }
      setMode("select_type");
      setQtyByItemId({});
      clearIssueFields();
      closeIssueCamera();
    } else if (mode === "select_type" && actionType === "issue") {
      setMode("select_issue_purpose");
      setTypeFilter("ALL");
    } else if (mode === "select_issue_purpose") {
      setMode("menu");
      setActionType(null);
      setIssuePurpose(null);
    } else if (mode === "summary") {
      setMode("select_type");
      setQtyByItemId({});
      setCashVal("");
      setTransferVal("");
      setChangeVal("");
      setCustomersVal("");
      setAttemptedSummary(false);
      setShowSummaryModal(false);
      setShowReviewModal(false);
    } else if (mode === "select_type" && actionType === "summary") {
      setMode("select_timing");
      setTypeFilter("ALL");
      setQtyByItemId({});
    } else if (
      mode === "select_timing" &&
      actionType === "summary" &&
      openAsDailySummary
    ) {
      router.replace("/staff");
    } else if (mode === "select_timing" && actionType === "summary") {
      setMode("menu");
      setActionType(null);
      setSummaryTiming(DEFAULT_STOCK_COUNT_TIMING);
    } else if (mode === "select_type" && actionType === "view" && openAsView) {
      router.replace("/staff/summary");
    } else {
      setMode("menu");
      setActionType(null);
      setSummaryTiming(DEFAULT_STOCK_COUNT_TIMING);
      setQtyByItemId({});
      clearIssueFields();
      closeIssueCamera();
    }
  };

  async function confirmPendingReceive(transferId: string) {
    setReceiveBusyId(transferId);
    try {
      const res = await fetch(`/api/staff/stock/transfers/${transferId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "รับของไม่สำเร็จ");
      toast.success("รับเข้าสาขาแล้ว");
      await load();
    } catch (e) {
      toast.error("รับของไม่สำเร็จ", e instanceof Error ? e.message : "");
    } finally {
      setReceiveBusyId(null);
    }
  }

  function stopCameraStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function openIssueCamera() {
    if (issueImageUrls.length >= MAX_STOCK_MOVEMENT_IMAGES) {
      toast.error(`แนบได้ไม่เกิน ${MAX_STOCK_MOVEMENT_IMAGES} รูป`);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("อุปกรณ์นี้ไม่รองรับกล้อง", "ลองแนบจากแกลเลอรีแทน");
      return;
    }
    setCameraFor("issue");
    setCameraOpen(true);
  }

  async function openStockInCamera() {
    if (stockInImageUrls.length >= MAX_STOCK_MOVEMENT_IMAGES) {
      toast.error(`แนบได้ไม่เกิน ${MAX_STOCK_MOVEMENT_IMAGES} รูป`);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("อุปกรณ์นี้ไม่รองรับกล้อง", "ลองแนบจากแกลเลอรีแทน");
      return;
    }
    setCameraFor("stock_in");
    setCameraOpen(true);
  }

  async function uploadMovementImages(
    files: FileList | File[],
    kind: "stock_in" | "issue",
  ) {
    const currentUrls =
      kind === "stock_in" ? stockInImageUrls : issueImageUrls;
    const setBusy =
      kind === "stock_in" ? setStockInImageBusy : setIssueImageBusy;
    const setUrls =
      kind === "stock_in" ? setStockInImageUrls : setIssueImageUrls;
    const inputRef =
      kind === "stock_in" ? stockInImageInputRef : issueImageInputRef;

    const picked = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    const room = MAX_STOCK_MOVEMENT_IMAGES - currentUrls.length;
    if (room <= 0) {
      toast.error(`แนบได้ไม่เกิน ${MAX_STOCK_MOVEMENT_IMAGES} รูป`);
      return;
    }
    const take = picked.slice(0, room);
    if (take.length === 0) return;
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const file of take) {
        const body = new FormData();
        body.append("file", file);
        body.append("folder", "Branch");
        const res = await fetch("/api/staff/uploads", { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof json.error === "string" ? json.error : "อัปโหลดรูปไม่สำเร็จ",
          );
        }
        const url = typeof json.url === "string" ? json.url.trim() : "";
        if (url) uploaded.push(url);
      }
      setUrls((prev) =>
        [...prev, ...uploaded].slice(0, MAX_STOCK_MOVEMENT_IMAGES),
      );
    } catch (e) {
      toast.error(
        "อัปโหลดรูปไม่สำเร็จ",
        e instanceof Error ? e.message : "",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function uploadStockInImages(files: FileList | File[]) {
    await uploadMovementImages(files, "stock_in");
  }

  async function uploadIssueImages(files: FileList | File[]) {
    await uploadMovementImages(files, "issue");
  }

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    (async () => {
      setCameraBusy(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
      } catch {
        if (!cancelled) {
          stopCameraStream();
          setCameraOpen(false);
          toast.error("เปิดกล้องไม่สำเร็จ", "อนุญาตการใช้กล้องแล้วลองใหม่");
        }
      } finally {
        if (!cancelled) setCameraBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraOpen]);

  function closeIssueCamera() {
    stopCameraStream();
    setCameraOpen(false);
    setCameraBusy(false);
  }

  /** ปิดกล้องโดยไม่บันทึกรูปใหม่ */
  function dismissIssueCamera() {
    closeIssueCamera();
  }

  function captureIssuePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0) {
      toast.error("กล้องยังไม่พร้อม", "รอสักครู่แล้วลองใหม่");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("บันทึกรูปไม่สำเร็จ");
          return;
        }
        const file = new File(
          [blob],
          `${cameraFor === "stock_in" ? "stock-in" : "issue"}-${Date.now()}.jpg`,
          { type: "image/jpeg" },
        );
        closeIssueCamera();
        if (cameraFor === "stock_in") {
          void uploadStockInImages([file]);
          return;
        }
        void uploadIssueImages([file]);
      },
      "image/jpeg",
      0.85,
    );
  }

  async function submitChanges() {
    if (selectedItems.length === 0 || !actionType) return;
    if (actionType === "issue") {
      if (!issuePurpose) {
        toast.error("กรุณาเลือกประเภทการจ่ายออก");
        return;
      }
      if (!issueNote.trim()) {
        toast.error("กรุณากรอกรายละเอียด");
        return;
      }
      if (issuePurpose === "waste" && issueImageUrls.length === 0) {
        toast.error("กรุณาแนบรูปอย่างน้อย 1 รูป", "ของเสียต้องมีรูปประกอบ");
        return;
      }
    }

    setBusy(true);
    try {
      let resolvedDocumentNo = documentNo.trim();
      if (actionType === "stock_in" || actionType === "issue") {
        if (!resolvedDocumentNo) {
          resolvedDocumentNo = await genDocumentNo(
            actionType === "stock_in" ? "IN" : "OUT",
          );
        }
        if (!resolvedDocumentNo) {
          toast.error("กรุณาระบุเลขที่เอกสาร");
          return;
        }
      }

      const batchId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const postAction =
        actionType === "issue" && issuePurpose
          ? STOCK_OUTBOUND_PURPOSE_LABEL[issuePurpose].apiAction
          : actionType;

      let hasError = false;
      let lastError = "";
      for (const [index, item] of selectedItems.entries()) {
        const payload: Record<string, unknown> = {
          action: postAction,
          brandProductId: item.id,
          quantity: item.quantity,
          note: actionType === "stock_in" ? "เพิ่มผ่านระบบมือถือ" : issueNote,
          batchId,
          documentNo: resolvedDocumentNo,
          skipDocumentCheck: index > 0,
        };
        if (actionType === "issue" && issueImageUrls.length > 0) {
          payload.imageUrls = issueImageUrls;
        }
        if (actionType === "stock_in") {
          if (producedAt) payload.receivedAt = producedAt;
          if (stockInImageUrls.length > 0) {
            payload.imageUrls = stockInImageUrls;
          }
        }

        const res = await fetch("/api/staff/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          hasError = true;
          const err = await res.json().catch(() => ({}));
          lastError =
            typeof err.error === "string" ? err.error : "บันทึกไม่สำเร็จ";
          console.error("API error:", err);
        }
      }

      if (hasError) {
        toast.error("บันทึกบางรายการไม่สำเร็จ", lastError || "ลองใหม่");
      } else {
        const okTitle =
          actionType === "stock_in"
            ? "รับเข้าสำเร็จ"
            : issuePurpose === "waste"
              ? "บันทึกของเสียสำเร็จ"
              : "จ่ายออกจากสต๊อกสำเร็จ";
        toast.success(
          okTitle,
          `${resolvedDocumentNo} · ${selectedItems.length} รายการ`,
        );
        setMode("menu");
        setActionType(null);
        setQtyByItemId({});
        setDocumentNo("");
        setProducedAt(bangkokDateKey());
        setStockInImageUrls([]);
        clearIssueFields();
      }
      await load();
    } catch (e: any) {
      toast.error("เกิดข้อผิดพลาด", e.message || "ไม่สามารถบันทึกได้");
    } finally {
      setBusy(false);
    }
  }

  async function submitSummary() {
    const lines = summaryItems.map((p) => ({
      brandProductId: p.id,
      countedQty: summaryCountedQty(p.id),
    }));

    if (lines.length === 0) {
      toast.error(`ไม่มีรายการ${summaryTypeLabel}ให้นับสต๊อก`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/staff/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "summary",
          stockType: summaryStockType,
          timing: summaryTiming,
          lines,
          cash: summaryIncludesSales ? Number(cashVal) || 0 : 0,
          transfer: summaryIncludesSales ? Number(transferVal) || 0 : 0,
          change: summaryIncludesSales ? Number(changeVal) || 0 : 0,
          customers: summaryIncludesSales ? Number(customersVal) || 0 : 0,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "บันทึกไม่สำเร็จ");
      }
      toast.success(
        body.pendingAdminApply || body.status === "IN_PROGRESS"
          ? "ส่งสรุปยอดเมนูขายแล้ว — รอแอดมินกดปรับสต๊อก"
          : summaryIncludesSales
            ? "บันทึกสรุปยอดสต๊อกและขายรายเรียบร้อย"
            : `บันทึกสรุปยอดสต๊อก · ${summaryTimingLabel} · ${summaryTypeLabel} เรียบร้อย`,
      );
      setShowSummaryModal(false);
      setCashVal("");
      setTransferVal("");
      setChangeVal("");
      setCustomersVal("");
      setQtyByItemId({});
      setAttemptedSummary(false);
      setSummaryTiming(DEFAULT_STOCK_COUNT_TIMING);
      if (openAsDailySummary) {
        router.replace("/staff");
        return;
      }
      setActionType(null);
      setMode("menu");
      await load();
    } catch (e: any) {
      toast.error("บันทึกไม่สำเร็จ", e.message || "กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" recoveryAfterMs={8000} />
      </main>
    );
  }

  if (loadError && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white px-6 py-10 text-center shadow-sm">
          <p className="text-[15px] font-semibold text-slate-800">
            โหลดหน้าสต๊อกไม่สำเร็จ
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-6 w-full rounded-xl bg-site-primary px-4 py-3 text-sm font-semibold text-white"
          >
            ลองใหม่
          </button>
          <button
            type="button"
            onClick={() => router.replace("/staff")}
            className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600"
          >
            กลับหน้าหลัก
          </button>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  const lastStockCountLabel = formatStockActivityAt(data.lastStockCountAt);
  const lastSaleLabel = formatStockActivityAt(data.lastSaleAt);

  return (
    <StaffAppShell active="stock">
      <div className="space-y-4 px-4 py-6 max-w-lg mx-auto pb-32">
        {!data.stockActive ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm text-center">
            <p className="text-sm font-bold text-slate-900">สาขานี้ยังไม่เปิดระบบสต๊อก</p>
          </div>
        ) : (
          <>
            {mode === "menu" ? (
              <>
                <div className="mb-4">
                  <h2 className="text-lg font-extrabold text-slate-900">จัดการสต๊อก</h2>
                  <p className="text-xs text-slate-500">ปรับปรุงจำนวนสต๊อกของเมนูที่หน้าร้าน</p>
                </div>
                <div className="space-y-4 mt-6">
                  {WAREHOUSE_UI_ENABLED && (data.pending?.length ?? 0) > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleActionClick("pending")}
                      className="w-full flex items-center justify-between rounded-2xl bg-teal-600 p-6 text-white shadow-md active:scale-[0.98] transition-transform"
                    >
                      <div className="text-left">
                        <h3 className="text-2xl font-black">มีของรอรับ</h3>
                        <p className="mt-1 text-teal-100 text-sm">
                          {data.pending.length} รายการ — กดเพื่อยืนยันรับเข้าสาขา
                        </p>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1.5 text-sm font-bold text-teal-800">
                        {data.pending.length}
                      </div>
                    </button>
                  ) : null}

                  <button
                    onClick={() => handleActionClick("stock_in")}
                    className="w-full flex items-center justify-between rounded-2xl bg-emerald-600 p-6 text-white shadow-md active:scale-[0.98] transition-transform"
                  >
                    <div className="text-left">
                      <h3 className="text-2xl font-black">รับเข้า</h3>
                      <p className="mt-1 text-emerald-100 text-sm">เพิ่มจำนวนสต๊อกเมนู (ของมาส่ง/ทำเพิ่ม)</p>
                    </div>
                    <div className="text-4xl">📦</div>
                  </button>

                  <button
                    onClick={() => handleActionClick("view")}
                    className="w-full flex items-center justify-between rounded-2xl bg-slate-800 p-6 text-white shadow-md active:scale-[0.98] transition-transform"
                  >
                    <div className="text-left">
                      <h3 className="text-2xl font-black">ภาพรวมสต๊อก</h3>
                      <p className="mt-1 text-slate-300 text-sm">
                        ดูคงเหลือตอนนี้ · กดดูรายการว่ามีอะไรบ้าง
                      </p>
                    </div>
                    <div className="text-4xl">📋</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push("/staff/stock/aging")}
                    className="w-full flex items-center justify-between rounded-2xl bg-orange-600 p-6 text-white shadow-md active:scale-[0.98] transition-transform"
                  >
                    <div className="text-left">
                      <h3 className="text-2xl font-black">ของค้าง / ใกล้เสีย</h3>
                      <p className="mt-1 text-orange-100 text-sm">
                        ดูจำนวนที่ค้าง · ตัดสินใจเองว่าเช็ค แยก หรือลดราคา
                      </p>
                    </div>
                    <div className="text-4xl">⏳</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleActionClick("summary")}
                    className="w-full flex items-center justify-between rounded-2xl bg-blue-600 p-6 text-white shadow-md active:scale-[0.98] transition-transform"
                  >
                    <div className="min-w-0 text-left pr-3">
                      <h3 className="text-2xl font-black">นับสต๊อก</h3>
                      <p className="mt-1 text-blue-100 text-sm">
                        นับคงเหลือจริงตามกลุ่มเมนู แล้วบันทึกสรุปยอด
                      </p>
                      <div className="mt-2.5 space-y-0.5 text-[12px] font-semibold leading-snug text-blue-50/95">
                        <p>
                          นับสต๊อกล่าสุด{" "}
                          <span className="font-bold text-white">
                            {lastStockCountLabel
                              ? `${lastStockCountLabel} น.`
                              : "ยังไม่เคยนับ"}
                          </span>
                        </p>
                        <p>
                          ขายล่าสุด{" "}
                          <span className="font-bold text-white">
                            {lastSaleLabel
                              ? `${lastSaleLabel} น.`
                              : "ยังไม่มียอดขาย"}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="text-4xl shrink-0">🧮</div>
                  </button>

                  <button
                    onClick={() => handleActionClick("issue")}
                    className="w-full flex items-center justify-between rounded-2xl bg-amber-500 p-6 text-white shadow-md active:scale-[0.98] transition-transform"
                  >
                    <div className="text-left">
                      <h3 className="text-2xl font-black">จ่ายออก</h3>
                      <p className="mt-1 text-amber-100 text-sm">
                        ของเสีย หรือ จ่ายออกจากสต๊อก
                      </p>
                    </div>
                    <div className="text-4xl">📤</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleActionClick("history")}
                    className="w-full flex items-center justify-between rounded-2xl bg-indigo-600 p-6 text-white shadow-md active:scale-[0.98] transition-transform"
                  >
                    <div className="text-left">
                      <h3 className="text-2xl font-black">ประวัติ</h3>
                      <p className="mt-1 text-indigo-100 text-sm">
                        รับ · ขาย · ของเสีย · จ่ายออก — ดูรายละเอียดตามเลขเอกสาร
                      </p>
                    </div>
                    <div className="text-4xl">🧾</div>
                  </button>
                </div>
              </>
            ) : mode === "history" ? (
              <StaffBranchStockHistoryPanel
                onBack={() => setMode("menu")}
              />
            ) : mode === "pending" && WAREHOUSE_UI_ENABLED ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
                  >
                    ← กลับ
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-lg font-extrabold text-slate-900">
                      รอรับของ
                    </h2>
                    <p className="text-xs font-semibold text-slate-600">
                      {(data.pending?.length ?? 0).toLocaleString("th-TH")} รายการ
                    </p>
                  </div>
                </div>
                {(data.pending?.length ?? 0) === 0 ? (
                  <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-800">ไม่มีของรอรับ</p>
                    <p className="mt-1 text-xs text-slate-500">
                      เมื่อมีการส่งของมา จะโผล่ที่นี่ให้กดรับ
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {data.pending.map((row) => (
                      <li
                        key={row.id}
                        className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-base font-extrabold text-slate-900">
                              {row.product.name}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-teal-700">
                              {row.quantity.toLocaleString("th-TH")} {row.product.unit}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {row.sourceBranch
                                ? `จากสาขา ${row.sourceBranch.name}`
                                : "จากคลัง"}
                              {row.note ? ` · ${row.note}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={receiveBusyId === row.id || busy}
                            onClick={() => void confirmPendingReceive(row.id)}
                            className="shrink-0 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                          >
                            {receiveBusyId === row.id ? "กำลังรับ…" : "รับเข้า"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : mode === "summary" ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={handleBack}
                    className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
                  >
                    ← กลับ
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-lg font-extrabold text-slate-900">
                      {summaryIncludesSales
                        ? "สรุปยอดสต๊อกและขายราย"
                        : "สรุปยอดสต๊อก"}
                    </h2>
                    <p className="text-xs font-semibold text-slate-700">
                      {summaryTimingLabel} · {summaryTypeLabel} · วันที่{" "}
                      {summaryTodayLabel}
                      <span className="ml-1 font-medium text-slate-500">
                        (วันนี้เสมอ)
                      </span>
                    </p>
                  </div>
                </div>

                <div className="space-y-6 mt-4 pb-36">
                  <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
                    <div className="mb-4 flex items-end justify-between gap-3 border-b pb-2">
                      <h3 className="font-bold text-slate-900">
                        1. กรอกยอดคงเหลือ ({summaryTypeLabel})
                      </h3>
                      <div className="text-right text-xs font-semibold text-slate-800">
                        <p>
                          จำนวนรายการ{" "}
                          <span className="tabular-nums font-black text-slate-900">
                            {summaryEnteredStats.itemCount}
                          </span>
                        </p>
                        <p className="mt-0.5">
                          รวมสต๊อกปัจจุบัน{" "}
                          <span className="tabular-nums font-black text-slate-900">
                            {formatPrice(
                              summaryItems.reduce((sum, item) => {
                                const bal =
                                  data.balances.find(
                                    (b) => b.product.id === item.id,
                                  )?.quantity ?? 0;
                                return sum + bal;
                              }, 0),
                            )}
                          </span>
                        </p>
                        <p className="mt-0.5">
                          รวมสต๊อกที่นับได้{" "}
                          <span className="tabular-nums font-black text-slate-900">
                            {formatPrice(summaryEnteredStats.totalQty)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <p className="mb-3 text-xs font-medium text-slate-500">
                      ช่องที่ไม่กรอกถือเป็น 0
                      {summaryIncludesSales
                        ? " — เมนูขายต้องเลื่อนลงกรอกเงินสด / โอน / ทอน / จำนวนลูกค้าด้วย"
                        : " — นับของจริงท้ายวัน (เช่น น้ำแข็งเหลือกี่กระสอบ แก้วเหลือกี่ใบ) เพื่อให้หลังบ้านสรุปการใช้/ต้นทุนได้"}
                    </p>
                    {summaryDiffItems.length > 0 ? (
                      <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                        พบ {summaryDiffItems.length} รายการที่ยอดกรอกต่างจากสต๊อกปัจจุบัน
                        — ช่องสีแดง
                      </div>
                    ) : null}
                    {summarySections.length > 1 ? (
                      <div className="mb-3 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <div className="flex w-max min-w-full gap-2">
                          <button
                            type="button"
                            onClick={() => setCategoryFilter("ALL")}
                            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                              categoryFilter === "ALL"
                                ? "bg-site-primary text-white"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            ทั้งหมด
                          </button>
                          {summarySections.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setCategoryFilter(cat.id)}
                              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                                categoryFilter === cat.id
                                  ? "bg-site-primary text-white"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {cat.name}
                              <span className="ml-1 tabular-nums opacity-80">
                                ({cat.items.length})
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mb-2 grid grid-cols-[minmax(0,1fr)_4.5rem_5rem] items-center gap-2 px-0.5 text-[11px] font-bold text-slate-500">
                      <span>รายการ</span>
                      <span className="text-center">ปัจจุบัน</span>
                      <span className="text-center">นับได้</span>
                    </div>
                    {summaryItems.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">
                        ไม่มีรายการ{summaryTypeLabel}ให้นับสต๊อก
                      </p>
                    ) : visibleSummarySections.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">
                        ไม่มีเมนูในหมวดนี้
                      </p>
                    ) : null}
                    <div className="space-y-4">
                      {visibleSummarySections.map((section) => (
                        <div key={section.id}>
                          {summarySections.length > 1 ||
                          section.name !== "ไม่มีหมวดหมู่" ? (
                            <div className="mb-1 flex items-center gap-2 border-b border-slate-100 pb-1.5">
                              <h4 className="text-sm font-extrabold text-slate-800">
                                {section.name}
                              </h4>
                              <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                                {section.items.length} รายการ
                              </span>
                            </div>
                          ) : null}
                          <ul className="divide-y divide-gray-100">
                            {section.items.map((item) => {
                              const rawQty = qtyByItemId[item.id];
                              const qty =
                                rawQty === undefined ||
                                (rawQty as unknown) === ""
                                  ? 0
                                  : rawQty;
                              const dbBalance =
                                data.balances.find(
                                  (b) => b.product.id === item.id,
                                )?.quantity ?? 0;
                              const counted = summaryCountedQty(item.id);
                              const isDiff = counted !== dbBalance;
                              const seq = summarySeqById.get(item.id) ?? 0;
                              return (
                                <li
                                  key={item.id}
                                  className={`grid grid-cols-[minmax(0,1fr)_4.5rem_5rem] items-center gap-2 py-3 ${
                                    isDiff
                                      ? "-mx-2 rounded-xl bg-red-50 px-2 ring-1 ring-red-200"
                                      : ""
                                  }`}
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span
                                      className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${
                                        isDiff
                                          ? "text-red-600"
                                          : "text-slate-500"
                                      }`}
                                    >
                                      {seq}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div
                                        className={
                                          isDiff
                                            ? "[&_p]:text-red-800"
                                            : undefined
                                        }
                                      >
                                        <StockItemName
                                          name={item.name}
                                          unit={item.unit}
                                          stockType={item.stockType}
                                        />
                                      </div>
                                      {isDiff ? (
                                        <p className="mt-0.5 text-[11px] font-bold text-red-600">
                                          ต่างจากสต๊อกปัจจุบัน
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div
                                    className={`rounded-lg px-1 py-2 text-center ${
                                      isDiff ? "bg-red-100/80" : "bg-slate-50"
                                    }`}
                                    title="สต๊อกปัจจุบันในระบบ"
                                  >
                                    <p
                                      className={`text-[10px] font-semibold ${
                                        isDiff
                                          ? "text-red-600"
                                          : "text-slate-500"
                                      }`}
                                    >
                                      ปัจจุบัน
                                    </p>
                                    <p
                                      className={`text-sm font-black tabular-nums ${
                                        isDiff
                                          ? "text-red-800"
                                          : "text-slate-900"
                                      }`}
                                    >
                                      {dbBalance}
                                    </p>
                                  </div>
                                  <div className="text-center">
                                    <p
                                      className={`mb-0.5 text-[10px] font-semibold ${
                                        isDiff
                                          ? "text-red-600"
                                          : "text-slate-500"
                                      }`}
                                    >
                                      นับได้
                                    </p>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      placeholder="0"
                                      aria-label={`สต๊อกที่นับได้ ${item.name}`}
                                      value={qty}
                                      onChange={(e) =>
                                        setQtyByItemId((p) => ({
                                          ...p,
                                          [item.id]:
                                            e.target.value === ""
                                              ? ("" as unknown as number)
                                              : parseInt(e.target.value),
                                        }))
                                      }
                                      className={`w-full rounded-lg border-2 px-2 py-2 text-center text-sm font-bold tabular-nums focus:outline-none focus:ring-1 ${
                                        isDiff
                                          ? "border-red-500 bg-red-50 text-red-800 focus:border-red-500 focus:ring-red-500"
                                          : "border-slate-300 bg-white text-black focus:border-site-primary focus:ring-site-primary"
                                      }`}
                                    />
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>

                  {summaryIncludesSales ? (
                    <>
                      <section
                        id="summary-finance-section"
                        className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 space-y-4"
                      >
                        <h3 className="font-bold text-slate-900 mb-2 border-b pb-2">2. สรุปการเงิน (ต้องกรอก)</h3>

                        <div>
                          <label className="mb-1 block text-sm font-bold text-slate-700">เงินสด (บาท) <span className="text-red-500">*</span></label>
                          <input
                            type="number"
                            value={cashVal}
                            onChange={e => setCashVal(e.target.value)}
                            data-summary-missing={
                              attemptedSummary && cashVal.trim() === ""
                                ? "true"
                                : undefined
                            }
                            className={`w-full rounded-xl border-2 px-4 py-3 font-bold tabular-nums text-black focus:bg-white focus:outline-none ${attemptedSummary && cashVal.trim() === ""
                                ? "border-red-500 bg-red-50 focus:border-red-500"
                                : "border-slate-300 bg-white focus:border-site-primary"
                              }`}
                            placeholder="0"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-bold text-slate-700">เงินโอน (บาท) <span className="text-red-500">*</span></label>
                          <input
                            type="number"
                            value={transferVal}
                            onChange={e => setTransferVal(e.target.value)}
                            data-summary-missing={
                              attemptedSummary && transferVal.trim() === ""
                                ? "true"
                                : undefined
                            }
                            className={`w-full rounded-xl border-2 px-4 py-3 font-bold tabular-nums text-black focus:bg-white focus:outline-none ${attemptedSummary && transferVal.trim() === ""
                                ? "border-red-500 bg-red-50 focus:border-red-500"
                                : "border-slate-300 bg-white focus:border-site-primary"
                              }`}
                            placeholder="0"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-bold text-slate-700">เงินทอน (บาท) <span className="text-red-500">*</span></label>
                          <input
                            type="number"
                            value={changeVal}
                            onChange={e => setChangeVal(e.target.value)}
                            data-summary-missing={
                              attemptedSummary && changeVal.trim() === ""
                                ? "true"
                                : undefined
                            }
                            className={`w-full rounded-xl border-2 px-4 py-3 font-bold tabular-nums text-black focus:bg-white focus:outline-none ${attemptedSummary && changeVal.trim() === ""
                                ? "border-red-500 bg-red-50 focus:border-red-500"
                                : "border-slate-300 bg-white focus:border-site-primary"
                              }`}
                            placeholder="0"
                          />
                        </div>

                        <div className="pt-2">
                          <label className="mb-1 block text-sm font-bold text-slate-700">รวมเงินทั้งหมด</label>
                          <input type="text" readOnly value={(Number(cashVal || 0) + Number(transferVal || 0)).toLocaleString()} className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 bg-slate-100 font-bold text-lg tabular-nums text-black focus:outline-none" />
                        </div>
                      </section>

                      <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
                        <h3 className="font-bold text-slate-900 mb-2 border-b pb-2">3. สถิติ</h3>
                        <div>
                          <label className="mb-1 block text-sm font-bold text-slate-700">จำนวนลูกค้า (คิว) <span className="text-red-500">*</span></label>
                          <input
                            type="number"
                            value={customersVal}
                            onChange={e => setCustomersVal(e.target.value)}
                            data-summary-missing={
                              attemptedSummary && customersVal.trim() === ""
                                ? "true"
                                : undefined
                            }
                            className={`w-full rounded-xl border-2 px-4 py-3 font-bold tabular-nums text-black focus:bg-white focus:outline-none ${attemptedSummary && customersVal.trim() === ""
                                ? "border-red-500 bg-red-50 focus:border-red-500"
                                : "border-slate-300 bg-white focus:border-site-primary"
                              }`}
                            placeholder="0"
                          />
                        </div>
                      </section>
                    </>
                  ) : null}


                </div>

                <div className="fixed inset-x-0 bottom-[4.8rem] z-20 px-4 pb-[env(safe-area-inset-bottom)]">
                  <div className="mx-auto max-w-lg rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500">
                          รวมสต๊อกปัจจุบัน
                        </p>
                        <p className="text-lg font-black tabular-nums leading-none text-black">
                          {formatPrice(
                            summaryItems.reduce((sum, item) => {
                              const bal =
                                data?.balances.find(
                                  (b) => b.product.id === item.id,
                                )?.quantity ?? 0;
                              return sum + bal;
                            }, 0),
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        {summaryDiffItems.length > 0 ? (
                          <>
                            <p className="text-[11px] font-semibold text-red-600">
                              ยอดต่างจากปัจจุบัน
                            </p>
                            <p className="text-lg font-black tabular-nums leading-none text-red-600">
                              {summaryDiffItems.length} รายการ
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-[11px] font-semibold text-slate-500">
                              รวมสต๊อกที่นับได้
                            </p>
                            <p className="text-lg font-black tabular-nums leading-none text-black">
                              {formatPrice(summaryEnteredStats.totalQty)}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={summaryItems.length === 0}
                        onClick={() => {
                          if (!validateSummaryForm()) return;
                          setShowReviewModal(true);
                        }}
                        className="flex-1 rounded-xl border-2 border-slate-300 bg-white py-3.5 text-center text-base font-bold text-slate-800 shadow-sm active:scale-[0.98] transition-transform disabled:opacity-50"
                      >
                        ตรวจสอบก่อน
                      </button>
                      <button
                        type="button"
                        disabled={summaryItems.length === 0}
                        onClick={() => {
                          if (!validateSummaryForm()) return;
                          setShowSummaryModal(true);
                        }}
                        className="flex-1 rounded-xl py-3.5 text-center text-base font-bold text-white shadow-md active:scale-[0.98] transition-transform bg-blue-600 disabled:opacity-50"
                      >
                        บันทึกสรุปยอด
                      </button>
                    </div>
                  </div>
                </div>

                {showReviewModal && (
                  <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
                    <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
                      <div className="border-b border-slate-100 px-5 pt-5 pb-3">
                        <h3 className="text-xl font-black text-slate-900">
                          ตรวจสอบก่อนบันทึก
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {summaryTypeLabel} · วันที่ {summaryTodayLabel}
                          {summaryIncludesSales ? (
                            <>
                              {" "}
                              · เงินสด <strong>{cashVal || 0}</strong> · โอน{" "}
                              <strong>{transferVal || 0}</strong> · ทอน{" "}
                              <strong>{changeVal || 0}</strong> · ลูกค้า{" "}
                              <strong>{customersVal || 0}</strong> คิว
                            </>
                          ) : (
                            <>
                              {" "}
                              · {summaryItems.length.toLocaleString("th-TH")}{" "}
                              รายการ
                            </>
                          )}
                        </p>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                        {summaryDiffItems.length === 0 ? (
                          <p className="rounded-xl bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800">
                            ยอดที่นับได้ตรงกับสต๊อกปัจจุบันทุกรายการ
                          </p>
                        ) : (
                          <>
                            <p className="mb-2 text-sm font-bold text-red-700">
                              พบ {summaryDiffItems.length} รายการที่ยอดต่างจากสต๊อกปัจจุบัน
                            </p>
                            <ul className="divide-y divide-red-100 rounded-xl border border-red-200 bg-red-50">
                              {summaryDiffItems.map((d) => (
                                <li
                                  key={d.id}
                                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-red-900">
                                      {d.seq ? `${d.seq}. ` : ""}
                                      {d.name}
                                    </p>
                                    <p className="mt-0.5 text-xs font-semibold text-red-700">
                                      สต๊อกปัจจุบัน {d.systemQty} → นับได้{" "}
                                      {d.countedQty}{" "}
                                      <span className="tabular-nums">
                                        ({d.countedQty - d.systemQty > 0 ? "+" : ""}
                                        {d.countedQty - d.systemQty})
                                      </span>
                                    </p>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                      <div className="flex gap-3 border-t border-slate-100 p-4">
                        <button
                          type="button"
                          onClick={() => setShowReviewModal(false)}
                          className="flex-1 rounded-xl bg-slate-100 py-3 font-bold text-slate-700 active:scale-95"
                        >
                          กลับไปแก้
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowReviewModal(false);
                            setShowSummaryModal(true);
                          }}
                          className="flex-1 rounded-xl bg-blue-600 py-3 font-bold text-white active:scale-95"
                        >
                          ไปบันทึก
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {showSummaryModal && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                      <h3 className="text-xl font-black text-slate-900">ยืนยันบันทึกสรุปยอด</h3>
                      <p className="mt-2 text-sm font-semibold text-slate-600">
                        {summaryIncludesSales ? (
                          <>
                            {summaryTypeLabel} · วันที่ {summaryTodayLabel} ·
                            ยอดเงินสด {formatPrice(Number(cashVal) || 0)} บ.,
                            ยอดโอน {formatPrice(Number(transferVal) || 0)} บ.
                            และ ยอดลูกค้า{" "}
                            {(Number(customersVal) || 0).toLocaleString("th-TH")}{" "}
                            คิว — ส่งให้แอดมินตรวจก่อน ระบบยังไม่ปรับสต๊อก
                          </>
                        ) : (
                          <>
                            สรุปยอดสต๊อก · {summaryTypeLabel} · วันที่{" "}
                            {summaryTodayLabel} ·{" "}
                            {summaryItems.length.toLocaleString("th-TH")} รายการ
                            — ระบบจะปรับยอดตามที่นับได้
                          </>
                        )}
                      </p>
                      {summaryDiffItems.length > 0 ? (
                        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                          มี {summaryDiffItems.length} รายการที่ยอดนับได้ต่างจากสต๊อกปัจจุบัน
                          {summaryIncludesSales
                            ? " — แอดมินจะปรับยอดเมื่อกด Convert"
                            : " — ระบบจะปรับยอดตามที่นับได้"}
                        </p>
                      ) : null}
                      <div className="mt-6 flex gap-3">
                        <button onClick={() => setShowSummaryModal(false)} disabled={busy} className="flex-1 rounded-xl bg-slate-100 py-3 font-bold text-slate-700 active:scale-95 disabled:opacity-50">ยกเลิก</button>
                        <button onClick={() => void submitSummary()} disabled={busy} className="flex-1 rounded-xl bg-blue-600 py-3 font-bold text-white active:scale-95 disabled:opacity-50">
                          {busy ? "กำลังบันทึก..." : "ยืนยัน"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : mode === "select_timing" ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={handleBack}
                    className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
                  >
                    ← กลับ
                  </button>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    เลือกจังหวะนับสต๊อก
                  </h2>
                </div>

                <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600">
                  ขั้นที่ 1 จาก 2 · เลือกก่อนว่านับตอนไหน แล้วค่อยเลือกประเภทสต๊อก
                </div>

                <div className="mt-4 grid gap-3">
                  {STOCK_COUNT_TIMING_OPTIONS.map((opt) => {
                    const selected = summaryTiming === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSummaryTiming(opt.value);
                          setMode("select_type");
                          setTypeFilter("ALL");
                          setQtyByItemId({});
                        }}
                        className={`w-full rounded-2xl border-2 bg-white px-5 py-5 text-left shadow-sm transition-all active:scale-[0.98] ${
                          selected
                            ? "border-site-primary text-slate-900"
                            : "border-slate-200 text-slate-800 hover:border-site-primary"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xl font-bold text-slate-900">
                            {opt.label}
                          </p>
                          {opt.value === DEFAULT_STOCK_COUNT_TIMING ? (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                              ค่าเริ่มต้น
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[13px] font-medium text-slate-500">
                          {opt.hint}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : mode === "select_issue_purpose" ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
                  >
                    ← กลับ
                  </button>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    ประเภทการจ่ายออก
                  </h2>
                </div>
                <p className="mb-3 text-[13px] font-medium text-slate-600">
                  เลือกให้ตรงกับเหตุผลจริง — ของเสียจะไปกลุ่มของเสีย
                  ส่วนจ่ายออกจากสต๊อกจะนับเป็นการจ่ายออก
                </p>
                <div className="grid gap-3">
                  {(
                    [
                      "waste",
                      "stock_out",
                    ] as const satisfies readonly StockOutboundPurpose[]
                  ).map((id) => {
                    const meta = STOCK_OUTBOUND_PURPOSE_LABEL[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setIssuePurpose(id);
                          if (openAsIssue) {
                            setTypeFilter(openViewStockType);
                            setMode("items");
                            return;
                          }
                          setMode("select_type");
                        }}
                        className={`w-full rounded-2xl border-2 p-5 text-left shadow-sm transition active:scale-[0.98] ${
                          id === "waste"
                            ? "border-orange-200 bg-orange-50 hover:border-orange-400"
                            : "border-amber-200 bg-amber-50 hover:border-amber-400"
                        }`}
                      >
                        <h3 className="text-xl font-black text-slate-900">
                          {meta.title}
                        </h3>
                        <p className="mt-1 text-[13px] font-medium text-slate-600">
                          {meta.hint}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : mode === "select_type" ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={handleBack}
                    className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
                  >
                    ← กลับ
                  </button>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {actionType === "view"
                      ? "เลือกประเภทสต็อก"
                      : actionType === "stock_in"
                        ? "เลือกประเภทรับเข้า"
                        : actionType === "issue"
                          ? issuePurpose
                            ? `เลือกประเภท · ${STOCK_OUTBOUND_PURPOSE_LABEL[issuePurpose].title}`
                            : "เลือกประเภทจ่ายออก"
                          : actionType === "summary"
                            ? "เลือกประเภทสต๊อก"
                            : ""}
                  </h2>
                </div>

                {(actionType === "stock_in" ||
                  actionType === "issue" ||
                  actionType === "summary") && (
                  <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600">
                    {actionType === "stock_in"
                      ? "ของสิ้นเปลือง (น้ำแข็ง/แก้ว/ถุง/แก๊ส/น้ำจิ้ม): รับเข้าเมื่อของมาส่ง"
                      : actionType === "issue"
                        ? issuePurpose === "waste"
                          ? "บันทึกของเสีย เช่น ทำหล่น ชำรุด ใช้ไม่ได้"
                          : "จ่ายออกจากสต๊อกเมื่อเบิกใช้ชัดเจน เช่น เปลี่ยนแก๊ส 1 ถัง"
                        : `ขั้นที่ 2 จาก 2 · จังหวะ: ${summaryTimingLabel} · เลือกประเภทที่จะนับ`}
                  </div>
                )}

                <div className="grid gap-4 mt-4">
                  {(
                    [
                      {
                        type: "SALE_ITEM" as const,
                        label: "เมนูขาย",
                        icon: "🍜",
                        hint: null as string | null,
                      },
                      {
                        type: "CONSUMABLE" as const,
                        label: "ของสิ้นเปลือง",
                        icon: "📦",
                        hint: "น้ำแข็ง · แก๊ส · แก้ว · ถุง · น้ำจิ้ม",
                      },
                      {
                        type: "EQUIPMENT" as const,
                        label: "อุปกรณ์",
                        icon: "🛠️",
                        hint: null as string | null,
                      },
                    ] as const
                  ).map((opt) => {
                    const lastAt =
                      actionType === "summary"
                        ? formatStockActivityAt(
                            data.lastStockCountAtByType?.[opt.type],
                          )
                        : null;
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => handleTypeSelectClick(opt.type)}
                        className="w-full flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-slate-200 bg-white p-6 text-slate-700 shadow-sm hover:border-site-primary hover:text-site-primary transition-all active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-3xl">{opt.icon}</div>
                          <h3 className="text-xl font-bold">{opt.label}</h3>
                        </div>
                        {opt.hint ? (
                          <p className="text-xs font-medium text-slate-500">
                            {opt.hint}
                          </p>
                        ) : null}
                        {actionType === "summary" ? (
                          <p className="mt-1 text-[12px] font-semibold text-slate-500">
                            นับล่าสุด{" "}
                            <span className="font-bold text-slate-700">
                              {lastAt ? `${lastAt} น.` : "ยังไม่เคยนับ"}
                            </span>
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={handleBack}
                    className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
                  >
                    ← กลับ
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-lg font-extrabold text-slate-900">
                      {actionType === "view"
                        ? "ภาพรวมสต๊อก"
                        : actionType === "stock_in"
                          ? "รับเข้า"
                          : actionType === "issue"
                            ? "จ่ายออก"
                            : ""}
                    </h2>
                    {typeFilter !== "ALL" &&
                    (actionType === "stock_in" ||
                      actionType === "issue" ||
                      actionType === "view") ? (
                      <p className="text-xs font-semibold text-slate-600">
                        {STOCK_TYPE_LABEL[typeFilter] ?? stockTypeLabel}
                      </p>
                    ) : null}
                  </div>
                </div>

                {(actionType === "stock_in" || actionType === "issue") &&
                mode === "items" ? (
                  <section
                    className={`mb-4 rounded-2xl border p-4 shadow-sm ${
                      actionType === "stock_in"
                        ? "border-emerald-100 bg-emerald-50/80"
                        : "border-amber-100 bg-amber-50/80"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`min-w-0 text-[13px] font-extrabold leading-tight ${
                          actionType === "stock_in"
                            ? "text-emerald-900"
                            : "text-amber-950"
                        }`}
                      >
                        {actionType === "stock_in"
                          ? "หัวบิลรับเข้าครั้งนี้"
                          : "หัวบิลจ่ายออกครั้งนี้"}
                      </p>
                      {actionType === "stock_in" ? (
                        <label className="flex shrink-0 items-center gap-1.5">
                          <span className="whitespace-nowrap text-[11px] font-semibold text-emerald-800/90">
                            วันที่ผลิต
                          </span>
                          <span className="block w-[7.75rem]">
                            <DateInput
                              value={producedAt}
                              onChange={setProducedAt}
                              aria-label="วันที่ผลิต"
                              className="w-full rounded-xl border border-emerald-200 bg-white px-2 py-1.5 text-center text-[12px] font-bold text-slate-900"
                            />
                          </span>
                        </label>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <StockDocumentNoField
                        value={documentNo}
                        onChange={setDocumentNo}
                        onGenerate={() =>
                          void genDocumentNo(
                            actionType === "stock_in" ? "IN" : "OUT",
                          )
                        }
                        generating={docGenBusy}
                      />
                    </div>
                    {actionType === "stock_in" ? (
                      <div className="mt-3">
                        <p className="mb-1 text-[12px] font-semibold text-emerald-900">
                          แนบรูป{" "}
                          <span className="font-medium text-emerald-800/70">
                            (ถ้ามี)
                          </span>
                        </p>
                        <p className="mb-2 text-[11px] font-medium text-emerald-800/70">
                          ถ่ายรูปหรือเลือกจากแกลเลอรี · ได้หลายรูป สูงสุด{" "}
                          {MAX_STOCK_MOVEMENT_IMAGES} รูป
                        </p>
                        <input
                          ref={stockInImageInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            if (e.target.files?.length) {
                              void uploadStockInImages(e.target.files);
                            }
                          }}
                        />
                        <div className="flex flex-wrap gap-2">
                          {stockInImageUrls.map((url) => (
                            <div key={url} className="relative h-16 w-16">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt=""
                                className="h-16 w-16 rounded-xl object-cover ring-1 ring-emerald-200"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setStockInImageUrls((prev) =>
                                    prev.filter((item) => item !== url),
                                  )
                                }
                                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white"
                                aria-label="ลบรูป"
                              >
                                <IconClose size={12} />
                              </button>
                            </div>
                          ))}
                          {stockInImageUrls.length < MAX_STOCK_MOVEMENT_IMAGES ? (
                            <>
                              <button
                                type="button"
                                disabled={stockInImageBusy}
                                onClick={() => void openStockInCamera()}
                                className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-white text-emerald-800 disabled:opacity-60"
                                aria-label="ถ่ายรูป"
                              >
                                <IconCamera size={20} />
                                <span className="mt-0.5 text-[10px] font-bold">
                                  ถ่าย
                                </span>
                              </button>
                              <button
                                type="button"
                                disabled={stockInImageBusy}
                                onClick={() =>
                                  stockInImageInputRef.current?.click()
                                }
                                className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-white text-emerald-800 disabled:opacity-60"
                                aria-label="แนบจากแกลเลอรี"
                              >
                                <IconUpload size={20} />
                                <span className="mt-0.5 text-[10px] font-bold">
                                  {stockInImageBusy ? "…" : "แนบ"}
                                </span>
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {actionType === "issue" && issuePurpose ? (
                      <div className="mt-3 space-y-3">
                        <p className="rounded-xl bg-white/80 px-3 py-2 text-[12px] font-bold text-slate-700 ring-1 ring-slate-200">
                          ประเภท ·{" "}
                          {STOCK_OUTBOUND_PURPOSE_LABEL[issuePurpose].title}
                        </p>
                        <div>
                          <p className="mb-1 text-[12px] font-semibold text-amber-950">
                            แนบรูป{" "}
                            {issuePurpose === "waste" ? (
                              <span className="font-bold text-red-600">*</span>
                            ) : (
                              <span className="font-medium text-amber-900/70">
                                (ถ้ามี)
                              </span>
                            )}
                          </p>
                          <p className="mb-2 text-[11px] font-medium text-amber-900/70">
                            {issuePurpose === "waste"
                              ? "ของเสียต้องแนบอย่างน้อย 1 รูป · "
                              : ""}
                            ถ่ายรูปหรือเลือกจากแกลเลอรี · สูงสุด{" "}
                            {MAX_STOCK_MOVEMENT_IMAGES} รูป
                          </p>
                          <input
                            ref={issueImageInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            onChange={(e) => {
                              if (e.target.files?.length) {
                                void uploadIssueImages(e.target.files);
                              }
                            }}
                          />
                          <div className="flex flex-wrap gap-2">
                            {issueImageUrls.map((url) => (
                              <div key={url} className="relative h-16 w-16">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt=""
                                  className="h-16 w-16 rounded-xl object-cover ring-1 ring-amber-200"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIssueImageUrls((prev) =>
                                      prev.filter((item) => item !== url),
                                    )
                                  }
                                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white"
                                  aria-label="ลบรูป"
                                >
                                  <IconClose size={12} />
                                </button>
                              </div>
                            ))}
                            {issueImageUrls.length <
                            MAX_STOCK_MOVEMENT_IMAGES ? (
                              <>
                                <button
                                  type="button"
                                  disabled={issueImageBusy}
                                  onClick={() => void openIssueCamera()}
                                  className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-white text-amber-800 disabled:opacity-60"
                                  aria-label="ถ่ายรูป"
                                >
                                  <IconCamera size={20} />
                                  <span className="mt-0.5 text-[10px] font-bold">
                                    ถ่าย
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  disabled={issueImageBusy}
                                  onClick={() =>
                                    issueImageInputRef.current?.click()
                                  }
                                  className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-white text-amber-800 disabled:opacity-60"
                                  aria-label="แนบจากแกลเลอรี"
                                >
                                  <IconUpload size={20} />
                                  <span className="mt-0.5 text-[10px] font-bold">
                                    {issueImageBusy ? "…" : "แนบ"}
                                  </span>
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {actionType === "view" && typeFilter === "SALE_ITEM" ? (
                  <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2.5">
                    <p className="min-w-0 text-[12px] font-medium text-orange-800">
                      ดูของค้างตามอายุ · ตัดสินใจเช็ค/แยก/ลดราคาเอง
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/staff/stock/aging")}
                      className="shrink-0 rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                      เปิด
                    </button>
                  </div>
                ) : null}

                {categories.length > 1 ? (
                  <div className="mb-3 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex w-max min-w-full gap-2">
                      <button
                        type="button"
                        onClick={() => setCategoryFilter("ALL")}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${categoryFilter === "ALL"
                            ? "bg-site-primary text-white"
                            : "bg-gray-100 text-gray-700"
                          }`}
                      >
                        ทั้งหมด
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategoryFilter(cat.id)}
                          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${categoryFilter === cat.id
                              ? "bg-site-primary text-white"
                              : "bg-gray-100 text-gray-700"
                            }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {actionType === "view" ? (
                  <>
                    <div
                      ref={stockCaptureRef}
                      className="space-y-3 rounded-2xl bg-white p-3"
                    >
                      <div className="border-b border-gray-100 pb-2.5">
                        {brandName ? (
                          <p className="text-sm font-extrabold text-gray-900">
                            {brandName}
                          </p>
                        ) : null}
                        {formatBranchLabel(branchName) ? (
                          <p className="text-xs font-semibold text-gray-600">
                            สาขา {formatBranchLabel(branchName)}
                          </p>
                        ) : null}
                        <div className="mt-1 flex items-baseline justify-between gap-2">
                          <p className="min-w-0 text-xs font-bold text-gray-800">
                            ยอดคงเหลือ · {stockTypeLabel}
                          </p>
                          <p className="shrink-0 text-right text-[11px] text-gray-500">
                            {stockViewDateTimeLabel}
                            {categoryFilter !== "ALL"
                              ? ` · หมวด ${categoryFilter}`
                              : ""}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-3.5 py-3 shadow-sm">
                          <p className="text-[11px] font-bold tracking-wide text-emerald-700/80">
                            สต๊อกปัจจุบัน
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-emerald-800/70">
                            คงเหลือ
                          </p>
                          <div className="mt-2.5 space-y-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[11px] font-medium text-slate-500">
                                รวม
                              </span>
                              <span className="text-lg font-black tabular-nums leading-none text-slate-900">
                                {formatPrice(viewSummary.current.quantity)}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[11px] font-medium text-slate-500">
                                มูลค่า
                              </span>
                              <span className="text-sm font-extrabold tabular-nums text-emerald-700">
                                {formatPrice(
                                  Math.round(viewSummary.current.valueBaht),
                                )}{" "}
                                <span className="text-[10px] font-bold">บาท</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white px-3.5 py-3 shadow-sm">
                          <p className="text-[11px] font-bold tracking-wide text-rose-700/80">
                            สต๊อกสะสมของเสีย
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-rose-800/70">
                            ดูรายเดือน
                            {viewSummary.monthLabel
                              ? ` · ${viewSummary.monthLabel}`
                              : ""}
                          </p>
                          <div className="mt-2.5 space-y-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[11px] font-medium text-slate-500">
                                รวม
                              </span>
                              <span className="text-lg font-black tabular-nums leading-none text-slate-900">
                                {formatPrice(viewSummary.waste.quantity)}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[11px] font-medium text-slate-500">
                                มูลค่า
                              </span>
                              <span className="text-sm font-extrabold tabular-nums text-rose-700">
                                {formatPrice(
                                  Math.round(viewSummary.waste.valueBaht),
                                )}{" "}
                                <span className="text-[10px] font-bold">บาท</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-200 bg-white p-3">
                        {visibleItems.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                            {data.products.length === 0
                              ? "ไม่มีรายการเมนูสต๊อก"
                              : "ไม่มีเมนูในหมวดนี้"}
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {visibleItemSections.map((section) => (
                              <div key={section.id}>
                                {showItemCategoryHeaders ? (
                                  <div className="mb-1 flex items-center gap-2 border-b border-gray-100 pb-1.5">
                                    <h4 className="text-sm font-extrabold text-slate-800">
                                      {section.name}
                                    </h4>
                                    <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                                      {section.items.length} รายการ
                                    </span>
                                  </div>
                                ) : null}
                                <ul className="divide-y divide-gray-100">
                                  {section.items.map((item) => {
                                    const dbBalance =
                                      data.balances.find(
                                        (b) => b.product.id === item.id,
                                      )?.quantity ?? 0;
                                    const isLow =
                                      item.lowStockAlert != null &&
                                      dbBalance <= item.lowStockAlert;
                                    const isEmpty = dbBalance <= 0;
                                    const seq = seqById.get(item.id) ?? 0;
                                    return (
                                      <li
                                        key={item.id}
                                        className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
                                      >
                                        <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">
                                          {seq}
                                        </span>
                                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-site-primary-soft">
                                          {item.imageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={item.imageUrl}
                                              alt=""
                                              className="h-full w-full object-cover"
                                            />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center">
                                              <IconSkewerPlaceholder size={28} />
                                            </div>
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <StockItemName
                                            name={item.name}
                                            unit={item.unit}
                                            stockType={item.stockType}
                                          />
                                          <p className="mt-0.5 text-xs text-gray-400">
                                            {item.stockType === "CONSUMABLE" ||
                                            item.stockType === "EQUIPMENT"
                                              ? isEmpty
                                                ? "หมดสต๊อก"
                                                : isLow
                                                  ? "สต๊อกใกล้หมด"
                                                  : null
                                              : `${item.unit}${
                                                  isEmpty
                                                    ? " · หมดสต๊อก"
                                                    : isLow
                                                      ? " · สต๊อกใกล้หมด"
                                                      : ""
                                                }`}
                                          </p>
                                        </div>
                                        <div
                                          className={`min-w-[4.5rem] rounded-xl px-3 py-2 text-center ${
                                            isEmpty
                                              ? "bg-red-50 text-red-700"
                                              : isLow
                                                ? "bg-amber-50 text-amber-700"
                                                : "bg-slate-100 text-slate-900"
                                          }`}
                                        >
                                          <p className="text-lg font-black tabular-nums leading-none">
                                            {dbBalance}
                                          </p>
                                          <p className="mt-0.5 text-[10px] font-semibold opacity-70">
                                            คงเหลือ
                                          </p>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={!!exportBusy}
                          onClick={() => void handleSaveStockImage()}
                          className="rounded-xl border border-gray-300 bg-white px-2 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {exportBusy === "save" ? "กำลังบันทึก…" : "Save รูป"}
                        </button>
                        <button
                          type="button"
                          disabled={!!exportBusy}
                          onClick={() => void handleShareStockImage()}
                          className="rounded-xl border border-green-600 bg-green-50 px-2 py-2.5 text-sm font-bold text-green-800 hover:bg-green-100 disabled:opacity-60"
                        >
                          {exportBusy === "share" ? "กำลังแชร์…" : "แชร์รูป"}
                        </button>
                        <button
                          type="button"
                          disabled={!!exportBusy}
                          onClick={() => void handleCopyStockText()}
                          className="rounded-xl border border-blue-600 bg-blue-50 px-2 py-2.5 text-sm font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60"
                        >
                          {exportBusy === "copy" ? "กำลังคัดลอก…" : "Copy"}
                        </button>
                      </div>
                      {exportMsg ? (
                        <p className="text-center text-xs text-gray-600">
                          {exportMsg}
                        </p>
                      ) : (
                        <p className="text-center text-xs text-gray-400">
                          แชร์รูป หรือกด Copy แล้ววางข้อความในไลน์อีกช่องทาง
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <section className="rounded-2xl border border-gray-200 bg-white p-4">
                    {data.products.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                        ไม่มีรายการเมนูสต๊อก
                      </p>
                    ) : visibleItems.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                        ไม่มีเมนูในหมวดนี้
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {visibleItemSections.map((section) => (
                          <div key={section.id}>
                            {showItemCategoryHeaders ? (
                              <div className="mb-1 flex items-center gap-2 border-b border-gray-100 pb-1.5">
                                <h4 className="text-sm font-extrabold text-slate-800">
                                  {section.name}
                                </h4>
                                <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                                  {section.items.length} รายการ
                                </span>
                              </div>
                            ) : null}
                            <ul className="divide-y divide-gray-100">
                              {section.items.map((item) => {
                                const qty = qtyByItemId[item.id] ?? 0;
                                const dbBalance =
                                  data.balances.find(
                                    (b) => b.product.id === item.id,
                                  )?.quantity ?? 0;
                                const seq = seqById.get(item.id) ?? 0;

                                return (
                                  <li
                                    key={item.id}
                                    className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
                                  >
                                    <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">
                                      {seq}
                                    </span>
                                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-site-primary-soft">
                                      {item.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={item.imageUrl}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          <IconSkewerPlaceholder size={28} />
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <StockItemName
                                        name={item.name}
                                        unit={item.unit}
                                        stockType={item.stockType}
                                      />
                                      <p className="mt-0.5 text-xs text-gray-400">
                                        สต๊อกเดิม: {dbBalance}
                                      </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                      <div
                                        className={`flex h-9 shrink-0 items-center overflow-hidden rounded-full border border-gray-200 bg-white ${
                                          qty > 0
                                            ? "border-site-primary ring-1 ring-site-primary"
                                            : ""
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => setQty(item.id, qty - 1)}
                                          className="flex h-full w-9 shrink-0 items-center justify-center bg-gray-50 text-gray-600 transition hover:bg-gray-100 active:bg-gray-200"
                                        >
                                          -
                                        </button>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          value={qty || ""}
                                          placeholder="0"
                                          onChange={(e) => {
                                            const val = parseInt(
                                              e.target.value,
                                              10,
                                            );
                                            setQty(
                                              item.id,
                                              isNaN(val) ? 0 : val,
                                            );
                                          }}
                                          className="w-12 text-center text-sm font-bold tabular-nums text-gray-900 focus:outline-none focus:bg-site-primary-soft/20 h-full bg-transparent p-0 border-none ring-0"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setQty(item.id, qty + 1)}
                                          className="flex h-full w-9 shrink-0 items-center justify-center bg-site-primary-soft text-site-primary-focus transition hover:bg-site-primary-soft/80 active:bg-site-primary-soft/60"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>

      {mode === "items" && selectedItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-[4.8rem] z-20 px-4">
          <div className="mx-auto max-w-lg bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] rounded-t-2xl border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-slate-900">
                  {actionType === "stock_in"
                    ? "สรุปยอดรับเข้า"
                    : issuePurpose === "waste"
                      ? "สรุปยอดของเสีย"
                      : "สรุปยอดจ่ายออกจากสต๊อก"}
                </h3>
                <p className="text-xs text-slate-500">เลือกไว้ {selectedItems.length} รายการ</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold text-slate-500">จำนวนรวม</p>
                <p className="text-xl font-black tabular-nums leading-none text-slate-900">
                  {formatPrice(selectedTotalQty)}
                </p>
              </div>
            </div>
            {(actionType === "stock_in" || actionType === "issue") && (
              <div className="mb-4 border-t border-slate-100 pt-3">
                <p className="mb-1 text-[12px] font-bold text-slate-600">
                  เลขที่เอกสาร · {documentNo.trim() || "ยังไม่มี"}
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  แก้เลขที่เอกสารได้ที่หัวบิลด้านบน
                </p>
              </div>
            )}
            {actionType === "issue" && (
              <div className="mb-4 space-y-3 border-t border-slate-100 pt-3">
                {issuePurpose ? (
                  <p
                    className={`rounded-xl px-3 py-2 text-[12px] font-bold ${
                      issuePurpose === "waste"
                        ? "bg-orange-50 text-orange-800"
                        : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    ประเภท · {STOCK_OUTBOUND_PURPOSE_LABEL[issuePurpose].title}
                  </p>
                ) : null}
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">รายละเอียด <span className="text-red-500">*</span></label>
                  {(data?.brandBranches?.length ?? 0) > 0 ? (
                    <div className="mb-2">
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-500">
                        เลือกสาขา (ไม่บังคับ) — กดเพื่อใส่ชื่ออัตโนมัติ
                      </p>
                      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                        {data!.brandBranches!.map((b) => {
                          const active = issueTargetBranchId === b.id;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => selectIssueTargetBranch(b)}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                                active
                                  ? "bg-amber-500 text-white"
                                  : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 active:bg-slate-200"
                              }`}
                            >
                              {b.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <input
                    type="text"
                    value={issueNote}
                    onChange={(e) => {
                      const next = e.target.value;
                      setIssueNote(next);
                      if (issueTargetBranchId && data?.brandBranches) {
                        const selected = data.brandBranches.find(
                          (b) => b.id === issueTargetBranchId,
                        );
                        if (
                          selected &&
                          next.trim() !== issueNoteForBranch(selected.name)
                        ) {
                          setIssueTargetBranchId(null);
                        }
                      }
                    }}
                    placeholder={
                      issuePurpose === "waste"
                        ? "เช่น ทำหล่น, ชำรุด, ใช้ไม่ได้..."
                        : "เช่น เบิกไปใช้งาน, เปลี่ยนแก๊ส... หรือเลือกสาขาด้านบน"
                    }
                    className="w-full rounded-xl border-slate-200 px-3 py-2 text-sm focus:border-site-primary focus:ring-1 focus:ring-site-primary"
                  />
                </div>
                {issuePurpose === "waste" && issueImageUrls.length === 0 ? (
                  <p className="rounded-xl bg-orange-50 px-3 py-2 text-[12px] font-semibold text-orange-800">
                    แนบรูปประกอบที่หัวบิลด้านบนอย่างน้อย 1 รูป
                  </p>
                ) : issueImageUrls.length > 0 ? (
                  <p className="text-[12px] font-medium text-slate-500">
                    แนบรูปแล้ว {issueImageUrls.length} รูป · แก้ได้ที่หัวบิลด้านบน
                  </p>
                ) : (
                  <p className="text-[12px] font-medium text-slate-500">
                    แนบรูปประกอบได้ที่หัวบิลด้านบน (ถ้ามี)
                  </p>
                )}
              </div>
            )}
            <button
              onClick={() => void submitChanges()}
              disabled={busy}
              className={`w-full rounded-xl py-3.5 text-center text-base font-bold text-white shadow-md active:scale-[0.98] transition-transform disabled:opacity-70 ${actionType === "stock_in" ? "bg-emerald-600" : "bg-amber-500"
                }`}
            >
              {busy ? "กำลังบันทึก..." : "ยืนยันการทำรายการ"}
            </button>
          </div>
        </div>
      )}

      {cameraOpen ? (
        <div
          className="fixed inset-0 z-[90] flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label="ถ่ายรูปประกอบ"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <p className="text-sm font-bold">ถ่ายรูปประกอบ</p>
            <button
              type="button"
              onClick={dismissIssueCamera}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              ยกเลิก
            </button>
          </div>
          <div className="relative min-h-0 flex-1 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />
            {cameraBusy ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                กำลังเปิดกล้อง…
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-center gap-4 bg-black px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              disabled={cameraBusy}
              onClick={captureIssuePhoto}
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-amber-500 text-white shadow-lg disabled:opacity-50"
              aria-label="ถ่ายรูป"
            >
              <IconCamera size={28} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
      
    </StaffAppShell>
  );
}
