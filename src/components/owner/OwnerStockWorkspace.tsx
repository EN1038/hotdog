"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  OwnerAppShell,
  useOwnerDashboard,
} from "@/components/owner/OwnerAppShell";
import { useToast } from "@/components/admin/Toast";
import { DateInput } from "@/components/DateInput";
import { IconCamera, IconClose } from "@/components/icons";
import { StockDocumentNoField } from "@/components/stock/StockDocumentNoField";
import type { StockDocumentKind } from "@/lib/stock-document-no-format";
import { provisionalStockDocumentNo } from "@/lib/stock-document-no-format";
import {
  bangkokDateKey,
  startOfBangkokDayFromKey,
} from "@/lib/constants";
import {
  assignStableMenuSequence,
  sortStaffMenuItems,
} from "@/lib/staff-menu-order";
import {
  MAX_STOCK_MOVEMENT_IMAGES,
  parseMovementImages,
} from "@/lib/stock-movement-images";
import {
  MobileDateRangeControl,
  mobileRangeForPreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";

const DEFAULT_SHELF_LIFE_DAYS = 5;

function addDaysToDateKey(key: string, days: number): string {
  const ms = startOfBangkokDayFromKey(key).getTime() + days * 86_400_000;
  return bangkokDateKey(new Date(ms));
}

function shelfLifeDaysOf(product: {
  defaultShelfLifeDays?: number | null;
}): number {
  const n = product.defaultShelfLifeDays;
  return n != null && Number.isFinite(n) && n >= 0 ? n : DEFAULT_SHELF_LIFE_DAYS;
}

type StockTypeId = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

const STOCK_TYPE_LABELS: Record<StockTypeId, string> = {
  SALE_ITEM: "สินค้าขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

const STOCK_TYPE_OPTIONS: {
  type: StockTypeId;
  label: string;
  hint: string;
}[] = [
  {
    type: "SALE_ITEM",
    label: "สินค้าขาย",
    hint: "ไม้ / สินค้าพร้อมขาย",
  },
  {
    type: "CONSUMABLE",
    label: "ของสิ้นเปลือง",
    hint: "น้ำแข็ง · แก๊ส · แก้ว · ถุง · น้ำจิ้ม",
  },
  {
    type: "EQUIPMENT",
    label: "อุปกรณ์",
    hint: "อุปกรณ์ใช้ในครัวหรือคลัง",
  },
];

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  RECEIVE: "รับเข้า",
  STOCK_IN: "รับเข้า",
  TRANSFER: "โอน/ส่งสาขา",
  SALE: "ขาย",
  FREE: "ของแถม",
  DAMAGE: "เสียหาย",
  LOST: "สูญหาย",
  ADJUST: "ปรับยอด",
  COUNT: "ตรวจนับ",
  RETURN: "คืนสต๊อก",
  ISSUE: "เบิกใช้",
  WASTE: "ของเสีย",
};

type ProductRow = {
  id: string;
  name: string;
  unit: string;
  stockType: StockTypeId;
  isActive: boolean;
  defaultShelfLifeDays?: number | null;
  sortOrder?: number | null;
  categorySortOrder?: number | null;
  category?: string | null;
};

type BalanceRow = {
  id: string;
  quantity: number;
  product: ProductRow;
};

type Warehouse = {
  id: string;
  name: string;
  balances: BalanceRow[];
};

type BranchRow = { id: string; name: string; stockEnabled: boolean };

type LocationRef = { id: string; name: string; type?: string | null };

type MovementRow = {
  id: string;
  type: string;
  quantity: number;
  beforeQty?: number | null;
  afterQty: number | null;
  note: string | null;
  documentNo?: string | null;
  supplier?: string | null;
  lotNumber?: string | null;
  expiresAt?: string | null;
  receivedAt?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  product: { id: string; name: string; unit: string; stockType?: string | null };
  stockLocation?: LocationRef | null;
  fromLocation?: LocationRef | null;
  toLocation?: LocationRef | null;
  createdByStaff?: { id: string; name: string | null } | null;
  createdByAdmin?: { id: string; username: string } | null;
};

type HistoryGroup = {
  key: string;
  documentNo: string | null;
  items: MovementRow[];
  createdAt: string;
  receivedAt: string | null;
  type: string;
  note: string | null;
};

type WarehouseBranch = {
  id: string;
  name: string;
  code?: string | null;
  warehouseIssueMode: "TRANSFER" | "ISSUE" | "BOTH";
  warehouseAllowedBranchIds: string[];
};

function defaultDocumentNo(
  kind: StockDocumentKind,
  hq: WarehouseBranch | null,
  brandId: string,
) {
  return provisionalStockDocumentNo({
    kind,
    branchCode: hq?.code,
    branchId: hq?.id ?? brandId,
  });
}

type StockPayload = {
  brand: { id: string; name: string; stockEnabled: boolean };
  warehouse: Warehouse | null;
  warehouseBranch: WarehouseBranch | null;
  products: ProductRow[];
  branches: BranchRow[];
  recentMovements: MovementRow[];
  pendingTransfers?: { id: string }[];
};

type ViewMode = "menu" | "select_type" | "items" | "balance" | "history";
type PendingAction = "receive" | "view" | "out";
type SheetKind = "product" | "settings" | null;
type OutKind = "transfer" | "direct" | "waste" | "sale" | "other";

const OUT_OPTIONS: { id: OutKind; label: string; hint: string }[] = [
  { id: "transfer", label: "ส่งสาขา", hint: "โอนจากสต๊อกกลางไปสาขา" },
  { id: "direct", label: "ส่งตรง", hint: "จ่ายออกโดยไม่ผ่านสาขา" },
  { id: "waste", label: "เสีย", hint: "ของเสีย / ใช้ไม่ได้" },
  { id: "sale", label: "ขาย", hint: "ขายออกจากสต๊อกกลาง" },
  { id: "other", label: "จ่ายอื่นๆ", hint: "เบิกใช้ หรือจ่ายนอกประเภท" },
];

function movementLabel(row: Pick<MovementRow, "type" | "note">) {
  if (row.note?.startsWith("เสียบไม้")) return "เสียบไม้";
  if (row.note?.startsWith("ส่งตรง")) return "ส่งตรง";
  return MOVEMENT_TYPE_LABELS[row.type] ?? row.type;
}

function groupRecentMovements(rows: MovementRow[]): HistoryGroup[] {
  const map = new Map<string, MovementRow[]>();
  const order: string[] = [];
  for (const row of rows) {
    const key = row.documentNo?.trim() || row.id;
    const list = map.get(key);
    if (!list) {
      map.set(key, [row]);
      order.push(key);
    } else {
      list.push(row);
    }
  }
  return order.map((key) => {
    const items = map.get(key) ?? [];
    const first = items[0]!;
    return {
      key,
      documentNo: first.documentNo?.trim() || null,
      items,
      createdAt: first.createdAt,
      receivedAt: first.receivedAt ?? null,
      type: first.type,
      note: first.note,
    };
  });
}

function actorName(row: MovementRow) {
  const staff = row.createdByStaff?.name?.trim();
  if (staff) return staff;
  const admin = row.createdByAdmin?.username?.trim();
  if (admin) return admin;
  return null;
}

function locationLine(row: MovementRow) {
  if (row.fromLocation?.name && row.toLocation?.name) {
    return `${row.fromLocation.name} → ${row.toLocation.name}`;
  }
  return row.stockLocation?.name || row.toLocation?.name || row.fromLocation?.name || null;
}

function groupPhotos(group: HistoryGroup) {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const row of group.items) {
    for (const url of parseMovementImages(row.imageUrl)) {
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function bangkokClock(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    if (bangkokClock(iso) === "00:00") return formatDate(iso);
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function importDateOf(row: {
  type: string;
  receivedAt?: string | null;
  createdAt: string;
}) {
  if (row.receivedAt) return row.receivedAt;
  if (isInboundType(row.type)) return row.createdAt;
  return null;
}

function isInboundType(type: string) {
  return type === "STOCK_IN" || type === "RECEIVE";
}

type HistoryBillLine = {
  key: string;
  seq: number;
  name: string;
  unit: string;
  quantity: number;
  beforeQty: number | null;
  afterQty: number | null;
  lotNumber: string | null;
  inBill: boolean;
};

function catalogForHistoryGroup(
  group: HistoryGroup,
  catalog: ProductRow[],
) {
  const types = new Set(
    group.items
      .map((row) => row.product.stockType)
      .filter((t): t is string => Boolean(t)),
  );
  const typed =
    types.size === 0
      ? catalog
      : catalog.filter((p) => types.has(p.stockType));
  return sortStaffMenuItems(typed);
}

function historyBillLines(
  group: HistoryGroup,
  catalog: ProductRow[],
  showAll: boolean,
): HistoryBillLine[] {
  const byId = new Map<string, MovementRow[]>();
  for (const row of group.items) {
    const list = byId.get(row.product.id) ?? [];
    list.push(row);
    byId.set(row.product.id, list);
  }

  const sorted = catalogForHistoryGroup(group, catalog);
  const seqById = assignStableMenuSequence(sorted);
  const seen = new Set<string>();

  function toLine(
    product: { id: string; name: string; unit: string },
    seq: number,
  ): HistoryBillLine {
    const movs = byId.get(product.id) ?? [];
    const first = movs[0];
    const last = movs[movs.length - 1];
    return {
      key: product.id,
      seq,
      name: product.name,
      unit: product.unit,
      quantity: movs.reduce((sum, row) => sum + row.quantity, 0),
      beforeQty: first?.beforeQty ?? null,
      afterQty: last?.afterQty ?? first?.afterQty ?? null,
      lotNumber: first?.lotNumber ?? null,
      inBill: movs.length > 0,
    };
  }

  const lines = sorted.map((product) => {
    seen.add(product.id);
    return toLine(product, seqById.get(product.id) ?? 0);
  });

  for (const [id, movs] of byId) {
    if (seen.has(id)) continue;
    const product = movs[0]!.product;
    lines.push(toLine(product, lines.length + 1));
  }

  if (!showAll) return lines.filter((line) => line.inBill);
  return lines;
}

function MenuActionButton({
  title,
  subtitle,
  tone,
  onClick,
  badge,
}: {
  title: string;
  subtitle: string;
  tone: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl p-6 text-white shadow-md transition-transform active:scale-[0.98] ${tone}`}
    >
      <div className="min-w-0 text-left pr-3">
        <h3 className="text-2xl font-black">{title}</h3>
        <p className="mt-1 text-sm text-white/85">{subtitle}</p>
      </div>
      {badge != null && badge > 0 ? (
        <div className="rounded-full bg-white px-3 py-1.5 text-sm font-bold text-slate-800">
          {badge}
        </div>
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-black">
          ›
        </span>
      )}
    </button>
  );
}

export function OwnerStockInner({
  brandId,
  stockApiBase,
  canManageSettings = true,
  canEnableStock = true,
}: {
  brandId: string;
  stockApiBase: string;
  canManageSettings?: boolean;
  canEnableStock?: boolean;
}) {
  const toast = useToast();

  const [mode, setMode] = useState<ViewMode>("menu");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [typeFilter, setTypeFilter] = useState<StockTypeId | null>(null);
  const [payload, setPayload] = useState<StockPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({});
  const [producedAt, setProducedAt] = useState(() => bangkokDateKey());
  const [expiresAt, setExpiresAt] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [docGenBusy, setDocGenBusy] = useState(false);
  const [productShelfDays, setProductShelfDays] = useState(
    String(DEFAULT_SHELF_LIFE_DAYS),
  );

  const [productName, setProductName] = useState("");
  const [productUnit, setProductUnit] = useState("ไม้");
  const [productType, setProductType] = useState<StockTypeId>("SALE_ITEM");

  const [itemId, setItemId] = useState("");
  const [note, setNote] = useState("");
  const [outKind, setOutKind] = useState<OutKind>("transfer");
  const [outImageUrls, setOutImageUrls] = useState<string[]>([]);
  const [outImageBusy, setOutImageBusy] = useState(false);
  const outImageInputRef = useRef<HTMLInputElement>(null);
  const [branchId, setBranchId] = useState("");
  const [autoReceive, setAutoReceive] = useState(false);
  const [hqName, setHqName] = useState("");
  const [issueMode, setIssueMode] = useState<"TRANSFER" | "ISSUE" | "BOTH">(
    "TRANSFER",
  );
  const [allowedIds, setAllowedIds] = useState<string[]>([]);
  const [historyGroup, setHistoryGroup] = useState<HistoryGroup | null>(null);
  const [historyFrom, setHistoryFrom] = useState(
    () => mobileRangeForPreset("7d", bangkokDateKey()).from,
  );
  const [historyTo, setHistoryTo] = useState(() => bangkokDateKey());
  const [historyPreset, setHistoryPreset] = useState<MobileDatePresetId | null>(
    "7d",
  );
  const [historyQ, setHistoryQ] = useState("");
  const [historyKind, setHistoryKind] = useState<"all" | "in" | "out">("all");
  const [historyRows, setHistoryRows] = useState<MovementRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const warehouse = payload?.warehouse ?? null;
  const hq = payload?.warehouseBranch ?? null;
  const products = useMemo(
    () => (payload?.products ?? []).filter((p) => p.isActive !== false),
    [payload],
  );
  const filteredProducts = useMemo(() => {
    const list = !typeFilter
      ? products
      : products.filter((p) => p.stockType === typeFilter);
    return sortStaffMenuItems(list);
  }, [products, typeFilter]);
  const seqById = useMemo(
    () => assignStableMenuSequence(filteredProducts),
    [filteredProducts],
  );
  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of warehouse?.balances ?? []) {
      map.set(row.product.id, row.quantity);
    }
    return map;
  }, [warehouse]);
  const branches = payload?.branches ?? [];
  const sendableBranches = useMemo(() => {
    const allow = hq?.warehouseAllowedBranchIds ?? [];
    if (allow.length === 0) return branches;
    return branches.filter((b) => allow.includes(b.id));
  }, [branches, hq]);
  const outOptions = canManageSettings
    ? OUT_OPTIONS
    : OUT_OPTIONS.filter((opt) => opt.id !== "sale");
  const historyGroups = useMemo(() => {
    const rows =
      historyKind === "in"
        ? historyRows.filter((r) => isInboundType(r.type))
        : historyKind === "out"
          ? historyRows.filter((r) => !isInboundType(r.type))
          : historyRows;
    return groupRecentMovements(rows);
  }, [historyRows, historyKind]);
  const historyBillView = useMemo(() => {
    if (!historyGroup) return [];
    return historyBillLines(historyGroup, products, true);
  }, [historyGroup, products]);
  const historyPhotos = useMemo(
    () => (historyGroup ? groupPhotos(historyGroup) : []),
    [historyGroup],
  );

  function pickDefaultItem(list: ProductRow[]) {
    setItemId((cur) => {
      if (cur && list.some((p) => p.id === cur)) return cur;
      return list[0]?.id ?? "";
    });
  }

  function startAction(action: PendingAction) {
    setPendingAction(action);
    setTypeFilter(null);
    setQtyByItemId({});
    setMode("select_type");
  }

  function initReceiveHeader() {
    setProducedAt(bangkokDateKey());
    setExpiresAt("");
    setDocumentNo(defaultDocumentNo("IN", hq, brandId));
    void genDocumentNo("IN");
  }

  function initOutHeader() {
    setDocumentNo(defaultDocumentNo("OUT", hq, brandId));
    void genDocumentNo("OUT");
    setNote("");
    setOutImageUrls([]);
  }

  async function genDocumentNo(kind: StockDocumentKind) {
    if (!brandId) return;
    setDocGenBusy(true);
    try {
      const branchId = hq?.id ?? "";
      const qs = new URLSearchParams({ kind });
      if (branchId) qs.set("branchId", branchId);
      const res = await fetch(`${stockApiBase}/document-no?${qs.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? "สร้างเลขที่เอกสารไม่สำเร็จ");
      }
      const next = String(json.documentNo ?? "").trim();
      if (next) setDocumentNo(next);
    } catch {
      setDocumentNo(defaultDocumentNo(kind, hq, brandId));
    } finally {
      setDocGenBusy(false);
    }
  }

  function handleTypeSelect(type: StockTypeId) {
    setTypeFilter(type);
    setProductType(type);
    const list = products.filter((p) => p.stockType === type);
    pickDefaultItem(list);

    if (pendingAction === "view") {
      setMode("balance");
      return;
    }
    if (pendingAction === "receive") {
      initReceiveHeader();
      setQtyByItemId({});
      setMode("items");
      return;
    }
    if (pendingAction === "out") {
      initOutHeader();
      setQtyByItemId({});
      setMode("items");
    }
  }

  function handleBackFromTypeOrView() {
    if (mode === "items" || mode === "balance") {
      setMode("select_type");
      return;
    }
    if (mode === "select_type") {
      setPendingAction(null);
      setTypeFilter(null);
      setQtyByItemId({});
      setMode("menu");
      return;
    }
    if (mode === "history") {
      setHistoryGroup(null);
      setMode("menu");
    }
  }

  function setItemQty(id: string, raw: number) {
    let n = Math.max(0, Math.floor(Number(raw) || 0));
    if (pendingAction === "out") {
      n = Math.min(n, Math.max(0, qtyByProduct.get(id) ?? 0));
    }
    setQtyByItemId((prev) => {
      const next = { ...prev };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  }

  const selectedReceiveItems = useMemo(() => {
    return filteredProducts
      .map((p) => ({ product: p, quantity: qtyByItemId[p.id] ?? 0 }))
      .filter((row) => row.quantity > 0);
  }, [filteredProducts, qtyByItemId]);

  const selectedReceiveTotal = useMemo(
    () => selectedReceiveItems.reduce((s, r) => s + r.quantity, 0),
    [selectedReceiveItems],
  );

  async function uploadOutImages(files: FileList | File[]) {
    const picked = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    const room = MAX_STOCK_MOVEMENT_IMAGES - outImageUrls.length;
    if (room <= 0) {
      toast.error(`แนบได้ไม่เกิน ${MAX_STOCK_MOVEMENT_IMAGES} รูป`);
      return;
    }
    const take = picked.slice(0, room);
    if (take.length === 0) return;
    setOutImageBusy(true);
    try {
      const endpoint = stockApiBase.startsWith("/api/staff")
        ? "/api/staff/uploads"
        : "/api/admin/uploads";
      const uploaded: string[] = [];
      for (const file of take) {
        const body = new FormData();
        body.append("file", file);
        body.append("folder", "Branch");
        const res = await fetch(endpoint, { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error ?? "อัปโหลดรูปไม่สำเร็จ");
        }
        const url = typeof json.url === "string" ? json.url.trim() : "";
        if (url) uploaded.push(url);
      }
      setOutImageUrls((prev) =>
        [...prev, ...uploaded].slice(0, MAX_STOCK_MOVEMENT_IMAGES),
      );
    } catch (e) {
      toast.error("อัปโหลดรูปไม่สำเร็จ", e instanceof Error ? e.message : "");
    } finally {
      setOutImageBusy(false);
      if (outImageInputRef.current) outImageInputRef.current.value = "";
    }
  }

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const res = await fetch(stockApiBase);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "โหลดสต๊อกไม่สำเร็จ");
      setPayload(body as StockPayload);
      const hq = (body as StockPayload).warehouseBranch;
      if (hq) {
        setHqName(hq.name);
        setIssueMode(hq.warehouseIssueMode);
        setAllowedIds(hq.warehouseAllowedBranchIds ?? []);
        setAutoReceive(hq.warehouseIssueMode === "ISSUE");
      }
      const firstProduct = (body.products as ProductRow[] | undefined)?.[0];
      const allBranches = (body.branches as BranchRow[] | undefined) ?? [];
      const allow = hq?.warehouseAllowedBranchIds ?? [];
      const sendable =
        allow.length === 0
          ? allBranches
          : allBranches.filter((b) => allow.includes(b.id));
      const firstBranch = sendable[0] ?? allBranches[0];
      if (firstProduct) setItemId((cur) => cur || firstProduct.id);
      if (firstBranch) setBranchId((cur) => cur || firstBranch.id);
    } catch (e) {
      toast.error("โหลดสต๊อกไม่สำเร็จ", e instanceof Error ? e.message : "");
    } finally {
      setLoading(false);
    }
  }, [brandId, stockApiBase, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode !== "history") return;
    let cancelled = false;
    const delay = historyQ.trim() ? 300 : 0;
    const handle = window.setTimeout(() => {
      setHistoryLoading(true);
      setHistoryError("");
      const qs = new URLSearchParams({
        from: historyFrom,
        to: historyTo,
      });
      const q = historyQ.trim();
      if (q) qs.set("q", q);
      fetch(`${stockApiBase}/history?${qs.toString()}`)
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            setHistoryError(body.error ?? "โหลดประวัติไม่สำเร็จ");
            setHistoryRows([]);
            return;
          }
          const rows = Array.isArray(body.movements)
            ? (body.movements as MovementRow[])
            : [];
          setHistoryRows(rows);
        })
        .catch(() => {
          if (cancelled) return;
          setHistoryError("โหลดประวัติไม่สำเร็จ");
          setHistoryRows([]);
        })
        .finally(() => {
          if (!cancelled) setHistoryLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [mode, historyFrom, historyTo, historyQ, stockApiBase]);

  useEffect(() => {
    if (!brandId) return;
    if (
      mode === "items" &&
      pendingAction === "receive" &&
      !documentNo.trim()
    ) {
      setDocumentNo(defaultDocumentNo("IN", hq, brandId));
      void genDocumentNo("IN");
    }
  }, [brandId, mode, pendingAction, hq?.id, hq?.code]);

  useEffect(() => {
    if (!brandId) return;
    if (
      mode === "items" &&
      pendingAction === "out" &&
      !documentNo.trim()
    ) {
      setDocumentNo(defaultDocumentNo("OUT", hq, brandId));
      void genDocumentNo("OUT");
    }
  }, [brandId, mode, pendingAction, hq?.id, hq?.code]);

  function resetForm() {
    setNote("");
  }

  function closeSheet() {
    setSheet(null);
    resetForm();
  }

  async function enableStock() {
    if (!brandId) return;
    setBusy(true);
    try {
      const res = await fetch(stockApiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockEnabled: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "เปิดสต๊อกไม่สำเร็จ");
      toast.success("เปิดสต๊อกกลางแล้ว");
      await load();
    } catch (e) {
      toast.error("เปิดสต๊อกไม่สำเร็จ", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function createProduct() {
    if (!brandId || !productName.trim()) {
      toast.error("กรอกชื่อสินค้า");
      return;
    }
    const shelfRaw = productShelfDays.trim();
    const shelfDays =
      shelfRaw === ""
        ? DEFAULT_SHELF_LIFE_DAYS
        : Math.max(0, Math.min(365, Math.floor(Number(shelfRaw) || 0)));
    setBusy(true);
    try {
      const res = await fetch(`${stockApiBase}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productName.trim(),
          unit: productUnit.trim() || "ชิ้น",
          stockType: productType,
          defaultShelfLifeDays: shelfDays,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "เพิ่มสินค้าไม่สำเร็จ");
      toast.success("เพิ่มรายการแล้ว");
      setProductName("");
      setProductShelfDays(String(DEFAULT_SHELF_LIFE_DAYS));
      if (typeof body.id === "string") setItemId(body.id);
      closeSheet();
      await load();
    } catch (e) {
      toast.error("เพิ่มสินค้าไม่สำเร็จ", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function submitReceiveBatch() {
    if (!brandId || selectedReceiveItems.length === 0) {
      toast.error("กรอกจำนวนอย่างน้อย 1 รายการ");
      return;
    }
    if (!documentNo.trim()) {
      toast.error("กรุณาระบุเลขที่เอกสาร");
      return;
    }
    if (!producedAt) {
      toast.error("กรุณาระบุวันที่ผลิต");
      return;
    }
    if (expiresAt && expiresAt < producedAt) {
      toast.error("วันหมดอายุต้องไม่ก่อนวันผลิต");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${stockApiBase}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "receive_batch",
          documentNo: documentNo.trim(),
          producedAt,
          expiresAt: expiresAt.trim() || null,
          note: note.trim() || "นำเข้าสต๊อกกลาง",
          lines: selectedReceiveItems.map((row) => ({
            brandProductId: row.product.id,
            quantity: row.quantity,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      }
      toast.success(
        "นำเข้าสำเร็จ",
        `${selectedReceiveItems.length} รายการ · ${documentNo.trim()}`,
      );
      setQtyByItemId({});
      setNote("");
      setDocumentNo("");
      setMode("history");
      await load();
    } catch (e) {
      toast.error("นำเข้าไม่สำเร็จ", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function submitOutBatch() {
    if (!brandId || selectedReceiveItems.length === 0) {
      toast.error("กรอกจำนวนอย่างน้อย 1 รายการ");
      return;
    }
    if (!documentNo.trim()) {
      toast.error("กรุณาระบุเลขที่เอกสาร");
      return;
    }
    if (outKind === "transfer" && !branchId) {
      toast.error("เลือกสาขาปลายทาง");
      return;
    }
    const loc = warehouse?.id;
    if (!loc && outKind !== "transfer") {
      toast.error("ยังไม่มีสต๊อกกลาง");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${stockApiBase}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "out_batch",
          kind: outKind,
          documentNo: documentNo.trim(),
          note: note.trim() || null,
          branchId: outKind === "transfer" ? branchId : undefined,
          autoReceive:
            outKind === "transfer"
              ? issueMode === "ISSUE" ||
                (issueMode === "BOTH" && autoReceive)
              : undefined,
          stockLocationId: loc,
          imageUrls: outImageUrls,
          lines: selectedReceiveItems.map((row) => ({
            brandProductId: row.product.id,
            quantity: row.quantity,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      const kindLabel =
        OUT_OPTIONS.find((o) => o.id === outKind)?.label ?? "จ่ายออก";
      toast.success(
        `${kindLabel}สำเร็จ`,
        `${selectedReceiveItems.length} รายการ · ${documentNo.trim()}`,
      );
      setQtyByItemId({});
      setNote("");
      setOutImageUrls([]);
      setDocumentNo("");
      setMode("history");
      await load();
    } catch (e) {
      toast.error("จ่ายออกไม่สำเร็จ", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function submitSheet() {
    if (sheet === "product") {
      await createProduct();
      return;
    }
    if (sheet === "settings") {
      if (!brandId) return;
      setBusy(true);
      try {
        const res = await fetch(stockApiBase, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            warehouseName: hqName.trim() || "สต๊อกกลาง",
            warehouseIssueMode: issueMode,
            warehouseAllowedBranchIds: allowedIds,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "บันทึกตั้งค่าไม่สำเร็จ");
        toast.success("บันทึกสิทธิ์สต๊อกกลางแล้ว");
        closeSheet();
        await load();
      } catch (e) {
        toast.error("บันทึกไม่สำเร็จ", e instanceof Error ? e.message : "");
      } finally {
        setBusy(false);
      }
    }
  }

  if (!brandId || loading) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        กำลังโหลดสต๊อกกลาง…
      </p>
    );
  }

  if (!payload?.brand?.stockEnabled) {
    return (
      <div className="px-4 pb-6 pt-4">
        <div className="rounded-3xl bg-white px-4 py-6 shadow-sm">
          <p className="text-[18px] font-black text-slate-900">
            สต๊อกกลาง / ครัวเสียบไม้
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            {canEnableStock
              ? "เปิดครั้งแรกเพื่อบันทึกยอดคงเหลือ เสียบไม้แต่ละรอบ และจ่ายออก (ส่งสาขา / ส่งตรง / เสีย / ขาย)"
              : "ยังไม่ได้เปิดสต๊อกกลาง — ให้เจ้าของร้านเปิดจากแอปเจ้าของก่อน"}
          </p>
          {canEnableStock ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void enableStock()}
              className="mt-5 min-h-14 w-full rounded-2xl bg-site-primary text-[16px] font-extrabold text-white disabled:opacity-60"
            >
              {busy ? "กำลังเปิด…" : "เปิดสต๊อกกลาง"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-6 max-w-lg mx-auto pb-8">
      {mode === "menu" ? (
        <>
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900">
                {hq?.name || warehouse?.name || "สต๊อกกลาง"}
              </h2>
              <p className="text-xs text-slate-500">
                คลังกลาง · สินค้าขาย · ของสิ้นเปลือง · อุปกรณ์
              </p>
            </div>
            {canManageSettings ? (
              <button
                type="button"
                onClick={() => setSheet("settings")}
                className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm"
              >
                ตั้งค่า
              </button>
            ) : null}
          </div>

          <div className="mt-6 space-y-4">
            <MenuActionButton
              title="นำเข้า"
              subtitle="เลือกประเภท แล้วกรอกจำนวนเหมือนหน้าร้าน"
              tone="bg-emerald-600"
              onClick={() => startAction("receive")}
            />
            <MenuActionButton
              title="ภาพรวมสต๊อก"
              subtitle="ดูคงเหลือแยก สินค้าขาย · สิ้นเปลือง · อุปกรณ์"
              tone="bg-slate-800"
              onClick={() => startAction("view")}
            />
            <MenuActionButton
              title="จ่ายออก"
              subtitle={
                canManageSettings
                  ? "ส่งสาขา · ส่งตรง · เสีย · ขาย"
                  : "ส่งสาขา · ส่งตรง · เสีย"
              }
              tone="bg-amber-500"
              onClick={() => startAction("out")}
              badge={(payload?.pendingTransfers ?? []).length || undefined}
            />
            <MenuActionButton
              title="ประวัติ"
              subtitle="ดูรายการเคลื่อนไหวล่าสุด"
              tone="bg-blue-600"
              onClick={() => setMode("history")}
            />
          </div>
        </>
      ) : null}

      {mode === "select_type" ? (
        <>
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackFromTypeOrView}
              className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
            >
              ← กลับ
            </button>
            <h2 className="text-lg font-extrabold text-slate-900">
              {pendingAction === "view"
                ? "เลือกประเภทสต็อก"
                : pendingAction === "receive"
                  ? "เลือกประเภทรับเข้า"
                  : pendingAction === "out"
                    ? "เลือกประเภทจ่ายออก"
                    : "เลือกประเภท"}
            </h2>
          </div>
          <p className="mb-3 text-[13px] font-medium text-slate-600">
            รูปแบบเดียวกับหน้าร้าน — สินค้าขาย · ของสิ้นเปลือง · อุปกรณ์
          </p>
          <div className="grid gap-4">
            {STOCK_TYPE_OPTIONS.map((opt) => {
              const count = products.filter(
                (p) => p.stockType === opt.type,
              ).length;
              return (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => handleTypeSelect(opt.type)}
                  className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-slate-200 bg-white p-6 text-slate-700 shadow-sm transition-all hover:border-site-primary hover:text-site-primary active:scale-[0.98]"
                >
                  <h3 className="text-xl font-bold">{opt.label}</h3>
                  <p className="text-xs font-medium text-slate-500">
                    {opt.hint}
                  </p>
                  <p className="mt-1 text-[12px] font-semibold text-slate-500">
                    {count.toLocaleString("th-TH")} รายการ
                  </p>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {mode === "items" ? (
        <>
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackFromTypeOrView}
              className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
            >
              ← กลับ
            </button>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900">
                {pendingAction === "out" ? "จ่ายออก" : "นำเข้า"}
              </h2>
              <p className="text-xs font-semibold text-slate-600">
                {typeFilter ? STOCK_TYPE_LABELS[typeFilter] : "เลือกจำนวน"}
              </p>
            </div>
          </div>

          {pendingAction === "out" ? (
            <section className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 shadow-sm">
              <p className="text-[13px] font-extrabold text-amber-950">
                หัวบิลจ่ายออกครั้งนี้
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-amber-900/80">
                ใช้ร่วมกันทุกบรรทัด — สินค้าหมดเลือกไม่ได้
              </p>
              <div className="mt-3">
                <StockDocumentNoField
                  value={documentNo}
                  onChange={setDocumentNo}
                  onGenerate={() => void genDocumentNo("OUT")}
                  generating={docGenBusy}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {outOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOutKind(opt.id)}
                    className={`rounded-xl px-3 py-2.5 text-left ${
                      outKind === opt.id
                        ? "bg-site-primary text-white"
                        : "bg-white text-slate-800 ring-1 ring-slate-200"
                    }`}
                  >
                    <span className="block text-[13px] font-extrabold">
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
              {outKind === "transfer" ? (
                <>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-[12px] font-semibold text-slate-600">
                      ส่งไปสาขา
                    </span>
                    <select
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] font-bold"
                    >
                      {sendableBranches.length === 0 ? (
                        <option value="">ยังไม่มีสาขาที่รับได้</option>
                      ) : (
                        sendableBranches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  {issueMode === "BOTH" ? (
                    <button
                      type="button"
                      onClick={() => setAutoReceive((v) => !v)}
                      className="mt-3 w-full rounded-xl bg-white px-3 py-3 text-left ring-1 ring-slate-200"
                    >
                      <span className="block text-[13px] font-extrabold text-slate-900">
                        {autoReceive ? "จ่ายเข้าสาขาเลย" : "โอนรอสาขารับ"}
                      </span>
                      <span className="text-[12px] text-slate-500">
                        แตะเพื่อสลับโหมดรายการนี้
                      </span>
                    </button>
                  ) : (
                    <p className="mt-2 text-[12px] font-semibold text-slate-500">
                      {issueMode === "ISSUE"
                        ? "โหมดนี้จ่ายเข้าสาขาทันที"
                        : "โหมดนี้โอนแล้วรอสาขานับรับ"}
                    </p>
                  )}
                </>
              ) : null}
              <label className="mt-3 block">
                <span className="mb-1 block text-[12px] font-semibold text-slate-600">
                  หมายเหตุหัวบิล (ถ้ามี)
                </span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น ส่งรอบเช้า / ของเสียจากตู้"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] font-semibold"
                />
              </label>
              <div className="mt-3">
                <p className="mb-1 text-[12px] font-semibold text-slate-600">
                  แนบรูป (ถ้ามี)
                </p>
                <p className="mb-2 text-[11px] font-medium text-slate-500">
                  ไม่บังคับ · ได้หลายรูป สูงสุด {MAX_STOCK_MOVEMENT_IMAGES} รูป
                </p>
                <input
                  ref={outImageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void uploadOutImages(e.target.files);
                    }
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {outImageUrls.map((url) => (
                    <div key={url} className="relative h-16 w-16">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setOutImageUrls((prev) =>
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
                  {outImageUrls.length < MAX_STOCK_MOVEMENT_IMAGES ? (
                    <button
                      type="button"
                      disabled={outImageBusy}
                      onClick={() => outImageInputRef.current?.click()}
                      className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-white text-amber-800 disabled:opacity-60"
                    >
                      <IconCamera size={20} />
                      <span className="mt-0.5 text-[10px] font-bold">
                        {outImageBusy ? "…" : "เพิ่ม"}
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : (
          <section className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 shadow-sm">
            <p className="text-[13px] font-extrabold text-emerald-900">
              หัวบิลนำเข้าครั้งนี้
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-emerald-800/80">
              ใช้ร่วมกันทุกบรรทัด — ไม่กรอกรายการละชุด
            </p>
            <div className="mt-3">
              <StockDocumentNoField
                value={documentNo}
                onChange={setDocumentNo}
                onGenerate={() => void genDocumentNo("IN")}
                generating={docGenBusy}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-slate-600">
                  วันที่ผลิต
                </span>
                <DateInput
                  value={producedAt}
                  onChange={(v) => {
                    setProducedAt(v);
                    if (expiresAt) {
                      const days =
                        filteredProducts.length > 0
                          ? Math.max(
                              ...filteredProducts.map((p) => shelfLifeDaysOf(p)),
                            )
                          : DEFAULT_SHELF_LIFE_DAYS;
                      setExpiresAt(addDaysToDateKey(v, days));
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] font-bold"
                />
              </label>
              <label className="block">
                <span className="mb-1 flex items-center justify-between gap-2 text-[12px] font-semibold text-slate-600">
                  <span>วันหมดอายุ (ไม่บังคับ)</span>
                  {expiresAt ? (
                    <button
                      type="button"
                      onClick={() => setExpiresAt("")}
                      className="font-bold text-slate-500"
                    >
                      ไม่ระบุ
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const days =
                          filteredProducts.length > 0
                            ? Math.max(
                                ...filteredProducts.map((p) =>
                                  shelfLifeDaysOf(p),
                                ),
                              )
                            : DEFAULT_SHELF_LIFE_DAYS;
                        setExpiresAt(
                          addDaysToDateKey(
                            producedAt || bangkokDateKey(),
                            days,
                          ),
                        );
                      }}
                      className="font-bold text-emerald-700"
                    >
                      ใส่ตามอายุเก็บ
                    </button>
                  )}
                </span>
                <DateInput
                  value={expiresAt}
                  onChange={setExpiresAt}
                  placeholder="ไม่ระบุ"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] font-bold"
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-600">
                หมายเหตุหัวบิล (ถ้ามี)
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น ของมาส่งเช้า / จากซัพพลายเออร์"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] font-semibold"
              />
            </label>
          </section>
          )}

          <div className="space-y-2 pb-28">
            <button
              type="button"
              onClick={() => {
                if (typeFilter) setProductType(typeFilter);
                setProductShelfDays(String(DEFAULT_SHELF_LIFE_DAYS));
                setSheet("product");
              }}
              className="w-full rounded-2xl border border-dashed border-site-primary/40 bg-white px-4 py-3 text-[14px] font-bold text-site-primary"
            >
              + เพิ่มรายการ
              {typeFilter ? ` · ${STOCK_TYPE_LABELS[typeFilter]}` : ""}
            </button>
            {filteredProducts.length === 0 ? (
              <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
                ยังไม่มีรายการในประเภทนี้
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm">
                {filteredProducts.map((p) => {
                  const qty = qtyByItemId[p.id] ?? 0;
                  const bal = qtyByProduct.get(p.id) ?? 0;
                  const seq = seqById.get(p.id) ?? 0;
                  const soldOut = pendingAction === "out" && bal <= 0;
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        soldOut ? "bg-slate-50" : ""
                      }`}
                    >
                      <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums text-slate-400">
                        {seq}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-[15px] font-extrabold ${
                            soldOut ? "text-slate-400" : "text-slate-900"
                          }`}
                        >
                          {p.name}
                          {soldOut ? " · หมด" : ""}
                        </p>
                        <p className="text-[12px] font-semibold text-slate-500">
                          คงเหลือ {bal.toLocaleString("th-TH")} {p.unit}
                          {pendingAction === "out"
                            ? soldOut
                              ? " · เลือกไม่ได้"
                              : ` · จ่ายได้ไม่เกิน ${bal.toLocaleString("th-TH")}`
                            : ` · อายุเก็บ ${shelfLifeDaysOf(p)} วัน`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={soldOut || qty <= 0}
                          onClick={() => setItemQty(p.id, qty - 1)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg font-black text-slate-700 disabled:opacity-40"
                        >
                          −
                        </button>
                        <input
                          inputMode="numeric"
                          disabled={soldOut}
                          value={qty || ""}
                          onChange={(e) =>
                            setItemQty(
                              p.id,
                              Number(e.target.value.replace(/\D/g, "") || 0),
                            )
                          }
                          placeholder="0"
                          className="h-10 w-14 rounded-xl border border-slate-200 text-center text-[16px] font-black tabular-nums disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        <button
                          type="button"
                          disabled={soldOut || (pendingAction === "out" && qty >= bal)}
                          onClick={() => setItemQty(p.id, qty + 1)}
                          className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black disabled:opacity-40 ${
                            pendingAction === "out"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          +
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div
            className={`fixed inset-x-0 bottom-[4.75rem] z-50 border-t bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] ${
              pendingAction === "out"
                ? "border-amber-100"
                : "border-emerald-100"
            }`}
          >
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold text-slate-900">
                  {selectedReceiveItems.length > 0
                    ? pendingAction === "out"
                      ? `สรุปจ่ายออก ${selectedReceiveItems.length} รายการ`
                      : `สรุปนำเข้า ${selectedReceiveItems.length} รายการ`
                    : "ยังไม่ได้ใส่จำนวน"}
                </p>
                <p className="text-[12px] font-semibold text-slate-500">
                  {selectedReceiveItems.length > 0
                    ? pendingAction === "out"
                      ? `รวม ${selectedReceiveTotal.toLocaleString("th-TH")} · ${
                          OUT_OPTIONS.find((o) => o.id === outKind)?.label ?? "จ่ายออก"
                        }`
                      : `รวม ${selectedReceiveTotal.toLocaleString("th-TH")} · ผลิต ${producedAt}${
                          expiresAt ? ` · หมดอายุ ${expiresAt}` : " · ไม่ระบุหมดอายุ"
                        }`
                    : pendingAction === "out"
                      ? "กด + ที่สินค้าที่มีสต็อก แล้วกดบันทึก"
                      : "กด + ที่รายการที่จะรับเข้า แล้วกดบันทึก"}
                </p>
              </div>
              <button
                type="button"
                disabled={
                  busy ||
                  outImageBusy ||
                  selectedReceiveItems.length === 0 ||
                  (pendingAction === "out" && outKind === "transfer" && !branchId)
                }
                onClick={() =>
                  void (pendingAction === "out"
                    ? submitOutBatch()
                    : submitReceiveBatch())
                }
                className={`shrink-0 rounded-xl px-5 py-3 text-[15px] font-extrabold text-white disabled:opacity-60 ${
                  pendingAction === "out" ? "bg-amber-500" : "bg-emerald-600"
                }`}
              >
                {busy
                  ? "กำลังบันทึก…"
                  : outImageBusy && pendingAction === "out"
                    ? "กำลังอัปโหลด…"
                    : "บันทึก"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {mode === "balance" ? (
        <>
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackFromTypeOrView}
              className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
            >
              ← กลับ
            </button>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900">
                ภาพรวมสต๊อก
              </h2>
              <p className="text-xs font-semibold text-slate-600">
                {typeFilter
                  ? STOCK_TYPE_LABELS[typeFilter]
                  : "คงเหลือตอนนี้"}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                if (typeFilter) setProductType(typeFilter);
                setSheet("product");
              }}
              className="w-full rounded-2xl border border-dashed border-site-primary/40 bg-white px-4 py-3 text-[14px] font-bold text-site-primary"
            >
              + เพิ่มรายการ
              {typeFilter ? ` · ${STOCK_TYPE_LABELS[typeFilter]}` : ""}
            </button>
            {filteredProducts.length === 0 ? (
              <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
                ยังไม่มีรายการในประเภทนี้ — กดเพิ่มรายการด้านบน
              </p>
            ) : (
              filteredProducts.map((p) => {
                const quantity = qtyByProduct.get(p.id) ?? 0;
                const seq = seqById.get(p.id) ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3 pr-3">
                      <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums text-slate-400">
                        {seq}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-extrabold text-slate-900">
                          {p.name}
                        </p>
                        <p className="text-[12px] font-semibold text-slate-500">
                          {STOCK_TYPE_LABELS[p.stockType] ?? p.stockType}
                        </p>
                      </div>
                    </div>
                    <p className="shrink-0 text-right text-[18px] font-black tabular-nums text-slate-900">
                      {quantity.toLocaleString("th-TH")}
                      <span className="ml-1 text-[12px] font-bold text-slate-400">
                        {p.unit}
                      </span>
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}

      {mode === "history" ? (
        <>
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackFromTypeOrView}
              className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
            >
              ← กลับ
            </button>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900">ประวัติ</h2>
              <p className="text-xs font-semibold text-slate-600">
                กรองวันที่นำเข้าหรือวันที่บันทึก · ค้นหาเลขเอกสาร ผู้ทำรายการ
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <MobileDateRangeControl
              todayKey={bangkokDateKey()}
              from={historyFrom}
              to={historyTo}
              preset={historyPreset}
              onChange={({ from, to, preset }) => {
                setHistoryFrom(from);
                setHistoryTo(to);
                setHistoryPreset(preset);
              }}
            />
            <input
              value={historyQ}
              onChange={(e) => setHistoryQ(e.target.value)}
              placeholder="ค้นหาเลขเอกสาร · ชื่อสินค้า · ผู้ทำรายการ"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-semibold shadow-sm"
            />
            <div className="flex gap-1.5">
              {(
                [
                  ["all", "ทั้งหมด"],
                  ["in", "รับเข้า"],
                  ["out", "จ่ายออก"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setHistoryKind(id)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-bold ring-1 ${
                    historyKind === id
                      ? "bg-slate-900 text-white ring-slate-900"
                      : "bg-white text-slate-600 ring-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {historyLoading ? (
              <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
                กำลังโหลดประวัติ…
              </p>
            ) : historyError ? (
              <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-rose-600 shadow-sm">
                {historyError}
              </p>
            ) : historyGroups.length === 0 ? (
              <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
                ไม่พบรายการในช่วงที่เลือก
              </p>
            ) : (
              historyGroups.map((group) => {
                const billed = historyBillLines(group, products, false);
                const totalQty = billed.reduce((s, r) => s + r.quantity, 0);
                const unit =
                  billed.length === 1
                    ? billed[0]?.unit
                    : billed.every((r) => r.unit === billed[0]?.unit)
                      ? billed[0]?.unit
                      : "รายการ";
                const title =
                  billed.length === 1
                    ? billed[0]!.name
                    : billed.length > 1
                      ? `${billed[0]!.name} และอีก ${billed.length - 1} รายการ`
                      : group.items[0]?.product.name ?? "—";
                const who = actorName(group.items[0]!) ?? "—";
                return (
                  <li key={group.key}>
                    <button
                      type="button"
                      onClick={() => setHistoryGroup(group)}
                      className="flex w-full items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-site-primary">
                          {movementLabel(group)}
                        </p>
                        <p className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                          {title}
                        </p>
                        <p className="mt-0.5 text-[12px] font-semibold text-slate-600">
                          วันที่เวลา {formatDateTime(group.createdAt)} · โดย {who}
                        </p>
                        {isInboundType(group.type) || group.documentNo ? (
                          <p className="mt-0.5 text-[12px] text-slate-500">
                            {[
                              isInboundType(group.type)
                                ? `วันที่นำเข้า ${formatDate(importDateOf(group))}`
                                : null,
                              group.documentNo,
                              groupPhotos(group).length > 0
                                ? `รูป ${groupPhotos(group).length}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="text-[17px] font-black tabular-nums text-slate-900">
                          {totalQty.toLocaleString("th-TH")}
                          <span className="ml-1 text-[11px] font-bold text-slate-400">
                            {unit}
                          </span>
                        </p>
                        <span className="text-lg text-slate-300" aria-hidden>
                          ›
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </>
      ) : null}

      {historyGroup ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="ปิด"
            onClick={() => setHistoryGroup(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] font-extrabold text-slate-900">
                  รายละเอียด{movementLabel(historyGroup)}
                </p>
                <p className="mt-0.5 text-[13px] font-medium text-slate-500">
                  {formatDateTime(historyGroup.createdAt)} · โดย{" "}
                  {actorName(historyGroup.items[0]!) ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryGroup(null)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-500"
              >
                ปิด
              </button>
            </div>
            <div className="mt-3 divide-y divide-slate-100 rounded-2xl bg-slate-50 px-3">
              {isInboundType(historyGroup.type) ? (
                <div className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="text-[13px] text-slate-500">วันที่นำเข้า</span>
                  <span className="text-right text-[13px] font-semibold text-slate-900">
                    {formatDate(importDateOf(historyGroup))}
                  </span>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-[13px] text-slate-500">วันที่เวลา</span>
                <span className="text-right text-[13px] font-semibold text-slate-900">
                  {formatDateTime(historyGroup.createdAt)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-[13px] text-slate-500">โดย</span>
                <span className="text-right text-[13px] font-semibold text-slate-900">
                  {actorName(historyGroup.items[0]!) ?? "—"}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-[13px] text-slate-500">เลขที่เอกสาร</span>
                <span className="text-right font-mono text-[13px] font-bold text-slate-900">
                  {historyGroup.documentNo || "—"}
                </span>
              </div>
              {historyGroup.items.length === 1 &&
              historyGroup.items[0]?.lotNumber ? (
                <div className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="text-[13px] text-slate-500">ล็อต</span>
                  <span className="text-right font-mono text-[13px] font-bold text-slate-900">
                    {historyGroup.items[0].lotNumber}
                  </span>
                </div>
              ) : null}
              {historyGroup.items[0]?.expiresAt ? (
                <div className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="text-[13px] text-slate-500">วันหมดอายุ</span>
                  <span className="text-right text-[13px] font-semibold text-slate-900">
                    {formatDate(historyGroup.items[0].expiresAt)}
                  </span>
                </div>
              ) : null}
              {historyGroup.note ? (
                <div className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="text-[13px] text-slate-500">หมายเหตุ</span>
                  <span className="text-right text-[13px] font-semibold text-slate-900">
                    {historyGroup.note}
                  </span>
                </div>
              ) : null}
              {locationLine(historyGroup.items[0]!) ? (
                <div className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="text-[13px] text-slate-500">สถานที่</span>
                  <span className="text-right text-[13px] font-semibold text-slate-900">
                    {locationLine(historyGroup.items[0]!)}
                  </span>
                </div>
              ) : null}
              {historyPhotos.length > 0 ? (
                <div className="py-2.5">
                  <p className="mb-2 text-[13px] text-slate-500">รูปประกอบ</p>
                  <div className="flex flex-wrap gap-2">
                    {historyPhotos.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-16 w-16 overflow-hidden rounded-xl ring-1 ring-slate-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-[13px] text-slate-500">รวมจำนวน</span>
                <span className="text-right text-[15px] font-black tabular-nums text-slate-900">
                  {historyGroup.items
                    .reduce((s, r) => s + r.quantity, 0)
                    .toLocaleString("th-TH")}
                </span>
              </div>
            </div>
            <p className="mt-4 text-[13px] font-extrabold text-slate-800">
              รายการในบิล
              {historyBillView.length > 0
                ? ` · ${historyBillView.length} รายการ`
                : ""}
            </p>
            <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl bg-slate-50">
              {historyBillView.map((row) => (
                <li
                  key={row.key}
                  className={`px-3 py-3 ${row.inBill ? "" : "opacity-50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="w-7 shrink-0 pt-0.5 text-center text-sm font-bold tabular-nums text-slate-400">
                        {row.seq}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-extrabold text-slate-900">
                          {row.name}
                        </p>
                        <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                          {row.inBill &&
                          row.beforeQty != null &&
                          row.afterQty != null
                            ? `คงเหลือ ${row.beforeQty.toLocaleString("th-TH")} → ${row.afterQty.toLocaleString("th-TH")}`
                            : row.inBill && row.afterQty != null
                              ? `คงเหลือหลังรายการ ${row.afterQty.toLocaleString("th-TH")}`
                              : "ไม่ได้บันทึกในบิลนี้"}
                          {row.lotNumber ? ` · ล็อต ${row.lotNumber}` : ""}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`shrink-0 text-[16px] font-black tabular-nums ${
                        row.inBill ? "text-slate-900" : "text-slate-400"
                      }`}
                    >
                      {row.quantity.toLocaleString("th-TH")}
                      <span className="ml-1 text-[11px] font-bold text-slate-400">
                        {row.unit}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="ปิด"
            onClick={closeSheet}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitSheet();
            }}
            className="relative z-10 w-full max-w-lg rounded-t-3xl bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <p className="text-[17px] font-extrabold text-slate-900">
              {sheet === "product"
                ? typeFilter
                  ? `เพิ่มรายการ · ${STOCK_TYPE_LABELS[typeFilter]}`
                  : "เพิ่มรายการสินค้า"
                : "ตั้งชื่อและสิทธิ์สต๊อกกลาง"}
            </p>

            {sheet === "settings" ? (
              <>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                    ชื่อสต๊อกกลาง
                  </span>
                  <input
                    value={hqName}
                    onChange={(e) => setHqName(e.target.value)}
                    placeholder="สต๊อกกลาง"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-site-primary"
                  />
                </label>
                <p className="mt-4 text-[12px] font-semibold text-slate-500">
                  วิธีจ่ายไปสาขา
                </p>
                <div className="mt-2 space-y-2">
                  {(
                    [
                      {
                        id: "TRANSFER" as const,
                        label: "โอนรอรับ",
                        hint: "ตัดสต๊อกกลาง แล้วให้สาขานับรับ",
                      },
                      {
                        id: "ISSUE" as const,
                        label: "จ่ายเข้าสาขาเลย",
                        hint: "ตัดกลางและเข้าสาขาทันที",
                      },
                      {
                        id: "BOTH" as const,
                        label: "เลือกได้ตอนจ่าย",
                        hint: "โอนหรือจ่ายเลย ทีละรายการ",
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setIssueMode(opt.id)}
                      className={`w-full rounded-xl px-3 py-2.5 text-left ${
                        issueMode === opt.id
                          ? "bg-site-primary text-white"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      <span className="block text-[14px] font-extrabold">
                        {opt.label}
                      </span>
                      <span
                        className={`block text-[12px] ${
                          issueMode === opt.id ? "text-white/80" : "text-slate-500"
                        }`}
                      >
                        {opt.hint}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-[12px] font-semibold text-slate-500">
                  สาขาที่รับของได้ (ว่าง = ทุกสาขา)
                </p>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {branches.length === 0 ? (
                    <p className="text-sm text-slate-500">ยังไม่มีสาขาขาย</p>
                  ) : (
                    branches.map((b) => {
                      const on = allowedIds.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() =>
                            setAllowedIds((cur) =>
                              on ? cur.filter((id) => id !== b.id) : [...cur, b.id],
                            )
                          }
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${
                            on ? "bg-orange-50 text-site-primary" : "bg-slate-50"
                          }`}
                        >
                          <span className="font-bold">{b.name}</span>
                          <span className="text-[12px] font-semibold">
                            {on ? "รับได้" : "ไม่เลือก"}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                {hq?.id ? (
                  <a
                    href={`/admin/branches/${hq.id}`}
                    className="mt-4 block text-center text-[13px] font-bold text-site-primary"
                  >
                    กำหนดพนักงานสต๊อกกลาง ›
                  </a>
                ) : null}
              </>
            ) : sheet === "product" ? (
              <>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                    ชื่อ
                  </span>
                  <input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="เช่น ไม้หมู"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[15px] font-semibold text-slate-900 outline-none focus:border-site-primary"
                  />
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label>
                    <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                      หน่วย
                    </span>
                    <input
                      value={productUnit}
                      onChange={(e) => setProductUnit(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[15px] font-semibold"
                    />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                      ประเภท
                    </span>
                    <select
                      value={productType}
                      onChange={(e) =>
                        setProductType(e.target.value as StockTypeId)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[14px] font-bold"
                    >
                      <option value="SALE_ITEM">สินค้าขาย</option>
                      <option value="CONSUMABLE">ของสิ้นเปลือง</option>
                      <option value="EQUIPMENT">อุปกรณ์</option>
                    </select>
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                    อายุเก็บ (วัน) — ใช้ตอนกด «ใส่ตามอายุเก็บ»
                  </span>
                  <input
                    inputMode="numeric"
                    value={productShelfDays}
                    onChange={(e) =>
                      setProductShelfDays(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder={String(DEFAULT_SHELF_LIFE_DAYS)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[15px] font-bold tabular-nums"
                  />
                  <span className="mt-1 block text-[11px] font-medium text-slate-500">
                    ค่าว่าง = {DEFAULT_SHELF_LIFE_DAYS} วัน · วันหมดอายุตอนนำเข้าใส่หรือไม่ใส่ก็ได้
                  </span>
                </label>
              </>
            ) : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={closeSheet}
                className="min-h-12 flex-1 rounded-2xl bg-slate-100 text-[15px] font-bold text-slate-700"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-12 flex-[1.4] rounded-2xl bg-site-primary text-[15px] font-extrabold text-white disabled:opacity-60"
              >
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function OwnerStockWorkspace() {
  return (
    <OwnerAppShell active="home">
      <OwnerStockPageBody />
    </OwnerAppShell>
  );
}

function OwnerStockPageBody() {
  const { data, loading } = useOwnerDashboard();
  const brandId = data?.brand?.id;

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <Link
          href="/owner"
          className="text-sm font-semibold text-site-primary"
        >
          ‹ กลับหน้าแรก
        </Link>
        <Link
          href="/owner/stock-flow"
          className="text-sm font-bold text-violet-700"
        >
          วิเคราะห์สต๊อก →
        </Link>
      </div>
      {loading || !brandId ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">
          กำลังโหลด…
        </p>
      ) : (
        <OwnerStockInner
          brandId={brandId}
          stockApiBase={`/api/admin/brands/${brandId}/stock`}
        />
      )}
    </>
  );
}
