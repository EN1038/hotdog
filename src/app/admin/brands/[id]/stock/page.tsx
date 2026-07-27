"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  adminSelectClass,
  btnOutline,
  btnPrimary,
  btnDanger,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
type CountType = "WEEKLY" | "MONTHLY" | "CUSTOM";
type CountStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type TabId =
  | "dashboard"
  | "products"
  | "receive"
  | "transfer"
  | "counts"
  | "outbound"
  | "history"
  | "settings";

type ProductBalance = {
  id: string;
  quantity: number;
  stockLocationId?: string;
  location?: { id: string; name: string; type: string; branchId: string | null };
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  unit: string;
  stockType: StockType;
  category: string | null;
  trackStock: boolean;
  trackLots?: boolean;
  lowStockAlert: number | null;
  costPrice: string | number | null;
  sellingPrice: string | number | null;
  isActive: boolean;
  equipmentStatus?: string | null;
  balances?: ProductBalance[];
};

type Location = {
  id: string;
  name: string;
  type: string;
  branchId: string | null;
};

type BranchRow = {
  id: string;
  name: string;
  code: string | null;
  stockEnabled: boolean;
};

type Movement = {
  id: string;
  type: string;
  quantity: number;
  note: string | null;
  createdAt: string;
  product: { id: string; name: string; unit: string; stockType?: StockType };
  fromLocation: { id: string; name: string; type: string } | null;
  toLocation: { id: string; name: string; type: string } | null;
  stockLocation?: { id: string; name: string; type: string } | null;
};

type PendingTransfer = {
  id: string;
  quantity: number;
  createdAt: string;
  product: { id: string; name: string; unit: string };
  branch: { id: string; name: string };
};

type Dashboard = {
  totalSku: number;
  lowStock: number;
  outOfStock: number;
  stockValue: number;
  damageLostToday: number;
  consumableLow: number;
  equipmentAttention: number;
  pendingTransfers: number;
  lowItems: { id: string; name: string; qty: number; type: StockType }[];
};

type StockPayload = {
  brand: {
    id: string;
    name: string;
    code: string;
    stockEnabled: boolean;
    allowNegativeStock: boolean;
  };
  warehouse: {
    id: string;
    name: string;
    balances: {
      id: string;
      quantity: number;
      brandProductId?: string;
      product: Product;
    }[];
  } | null;
  products: Product[];
  branches: BranchRow[];
  locations: Location[];
  pendingTransfers: PendingTransfer[];
  recentMovements: Movement[];
  dashboard: Dashboard | null;
};

type CountListItem = {
  id: string;
  name: string;
  type: CountType;
  status: CountStatus;
  createdAt: string;
  completedAt: string | null;
  location: { id: string; name: string; type: string };
  branch: { id: string; name: string } | null;
  _count: { lines: number };
};

type CountDetail = {
  id: string;
  name: string;
  type: CountType;
  status: CountStatus;
  location: { id: string; name: string; type: string };
  lines: {
    id: string;
    brandProductId: string;
    systemQty: number;
    countedQty: number | null;
    note: string | null;
    product: { id: string; name: string; unit: string; stockType: StockType };
  }[];
};

const TABS: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "products", label: "รายการสต๊อก" },
  { id: "receive", label: "รับเข้า" },
  { id: "transfer", label: "ส่งสาขา" },
  { id: "counts", label: "ตรวจนับ" },
  { id: "outbound", label: "เสีย/สูญหาย/เบิก" },
  { id: "history", label: "ประวัติ" },
  { id: "settings", label: "ตั้งค่า" },
];

const STOCK_TYPE_LABELS: Record<StockType, string> = {
  SALE_ITEM: "สินค้าขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

const MOVEMENT_LABELS: Record<string, string> = {
  RECEIVE: "รับเข้า",
  STOCK_IN: "รับเข้า",
  TRANSFER: "โอน",
  SALE: "ขาย",
  FREE: "แจกฟรี",
  DAMAGE: "เสีย",
  LOST: "สูญหาย",
  ADJUST: "ปรับยอด",
  COUNT: "ตรวจนับ",
  RETURN: "คืน",
  ISSUE: "เบิก",
  WASTE: "ของเสีย",
};

const COUNT_TYPE_LABELS: Record<CountType, string> = {
  WEEKLY: "รายสัปดาห์",
  MONTHLY: "รายเดือน",
  CUSTOM: "กำหนดเอง",
};

const COUNT_STATUS_LABELS: Record<CountStatus, string> = {
  DRAFT: "ร่าง",
  IN_PROGRESS: "กำลังนับ",
  COMPLETED: "เสร็จแล้ว",
  CANCELLED: "ยกเลิก",
};

const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

function formatMoney(n: number) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function productTotalQty(product: Product, warehouseQty?: number): number | null {
  if (product.balances?.length) {
    return product.balances.reduce((sum, b) => sum + b.quantity, 0);
  }
  if (warehouseQty != null) return warehouseQty;
  return null;
}

function isActiveCount(status: CountStatus) {
  return status === "DRAFT" || status === "IN_PROGRESS";
}

export default function BrandStockPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [data, setData] = useState<StockPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>("dashboard");

  const [productFilter, setProductFilter] = useState<StockType | "ALL">("ALL");
  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newBarcode, setNewBarcode] = useState("");
  const [newUnit, setNewUnit] = useState("ชิ้น");
  const [newStockType, setNewStockType] = useState<StockType>("SALE_ITEM");
  const [newCategory, setNewCategory] = useState("");
  const [newCostPrice, setNewCostPrice] = useState("");
  const [newSellingPrice, setNewSellingPrice] = useState("");
  const [newLowStockAlert, setNewLowStockAlert] = useState("");
  const [newIsActive, setNewIsActive] = useState(true);
  const [newTrackLots, setNewTrackLots] = useState(false);

  const [receiveProductId, setReceiveProductId] = useState("");
  const [receiveLocationId, setReceiveLocationId] = useState("");
  const [receiveQty, setReceiveQty] = useState("1");
  const [receiveUnitCost, setReceiveUnitCost] = useState("");
  const [receiveSupplier, setReceiveSupplier] = useState("");
  const [receiveNote, setReceiveNote] = useState("");
  const [receiveLotNumber, setReceiveLotNumber] = useState("");
  const [receiveExpiresAt, setReceiveExpiresAt] = useState("");

  const [transferProductId, setTransferProductId] = useState("");
  const [transferBranchId, setTransferBranchId] = useState("");
  const [transferQty, setTransferQty] = useState("1");
  const [transferNote, setTransferNote] = useState("");

  const [counts, setCounts] = useState<CountListItem[]>([]);
  const [activeCountId, setActiveCountId] = useState<string | null>(null);
  const [countDetail, setCountDetail] = useState<CountDetail | null>(null);
  const [countDraft, setCountDraft] = useState<Record<string, string>>({});
  const [countName, setCountName] = useState("");
  const [countLocationId, setCountLocationId] = useState("");
  const [countType, setCountType] = useState<CountType>("WEEKLY");

  const [outboundAction, setOutboundAction] = useState<"damage" | "lost" | "issue">(
    "damage",
  );
  const [outboundProductId, setOutboundProductId] = useState("");
  const [outboundLocationId, setOutboundLocationId] = useState("");
  const [outboundQty, setOutboundQty] = useState("1");
  const [outboundReason, setOutboundReason] = useState("");
  const [outboundNote, setOutboundNote] = useState("");

  const apiBase = `/api/admin/brands/${id}/stock`;

  const loadCounts = useCallback(async () => {
    const res = await fetch(`${apiBase}/counts`);
    if (!res.ok) return;
    const json = (await res.json()) as CountListItem[];
    setCounts(json);
  }, [apiBase]);

  const loadCountDetail = useCallback(
    async (countId: string) => {
      const res = await fetch(`${apiBase}/counts/${countId}`);
      if (!res.ok) {
        toast.error("โหลดรอบตรวจนับไม่สำเร็จ");
        return;
      }
      const json = (await res.json()) as CountDetail;
      setCountDetail(json);
      const draft: Record<string, string> = {};
      for (const line of json.lines) {
        draft[line.brandProductId] =
          line.countedQty != null ? String(line.countedQty) : "";
      }
      setCountDraft(draft);
    },
    [apiBase, toast],
  );

  const load = useCallback(async () => {
    const res = await fetch(apiBase);
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (!res.ok) {
      router.replace("/admin");
      return;
    }
    const json = (await res.json()) as StockPayload;
    setData(json);
    setLoading(false);

    if (json.brand.stockEnabled) {
      await loadCounts();
    }

    const defaultLoc = json.warehouse?.id ?? json.locations[0]?.id ?? "";
    if (defaultLoc) {
      setReceiveLocationId((prev) => prev || defaultLoc);
      setCountLocationId((prev) => prev || defaultLoc);
      setOutboundLocationId((prev) => prev || defaultLoc);
    }
  }, [apiBase, router, loadCounts]);

  useEffect(() => {
    if (!loaded) return;
    if (session && !session.isPlatformAdmin && !session.brandIds.includes(id)) {
      router.replace("/admin");
      return;
    }
    void load();
  }, [loaded, session, id, router, load]);

  useEffect(() => {
    if (data && !data.brand.stockEnabled) {
      setTab("settings");
    }
  }, [data]);

  useEffect(() => {
    if (!activeCountId) {
      setCountDetail(null);
      return;
    }
    void loadCountDetail(activeCountId);
  }, [activeCountId, loadCountDetail]);

  const warehouseQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const bal of data?.warehouse?.balances ?? []) {
      map.set(bal.product.id, bal.quantity);
    }
    return map;
  }, [data?.warehouse?.balances]);

  const filteredProducts = useMemo(() => {
    const list = data?.products ?? [];
    if (productFilter === "ALL") return list;
    return list.filter((p) => p.stockType === productFilter);
  }, [data?.products, productFilter]);

  const enabledBranches = useMemo(
    () => (data?.branches ?? []).filter((b) => b.stockEnabled),
    [data?.branches],
  );

  const issueProducts = useMemo(
    () => (data?.products ?? []).filter((p) => p.stockType === "CONSUMABLE"),
    [data?.products],
  );

  async function toggleStock(enabled: boolean) {
    if (!data) return;
    if (!enabled) {
      const ok = await confirm({
        title: "ปิดระบบสต๊อกแบรนด์?",
        message:
          "จะปิดสต๊อกทุกสาขาภายใต้แบรนด์นี้ด้วย ระบบเดิม (หมด/ยังมี) ยังใช้ได้ตามปกติ",
        confirmLabel: "ปิดสต๊อก",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockEnabled: enabled }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(enabled ? "เปิดระบบสต๊อกแล้ว" : "ปิดระบบสต๊อกแล้ว");
      if (enabled) setTab("dashboard");
      else setTab("settings");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function patchSettings(payload: {
    stockEnabled?: boolean;
    allowNegativeStock?: boolean;
  }) {
    setBusy(true);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("บันทึกตั้งค่าแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createProduct() {
    const name = newName.trim();
    if (!name) {
      toast.error("กรอกชื่อสินค้า");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sku: newSku.trim() || null,
          barcode: newBarcode.trim() || null,
          unit: newUnit.trim() || "ชิ้น",
          stockType: newStockType,
          category: newCategory.trim() || null,
          costPrice: newCostPrice.trim() ? Number(newCostPrice) : null,
          sellingPrice: newSellingPrice.trim()
            ? Number(newSellingPrice)
            : null,
          lowStockAlert: newLowStockAlert.trim()
            ? Number(newLowStockAlert)
            : null,
          isActive: newIsActive,
          trackLots: newTrackLots,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เพิ่มไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      setNewName("");
      setNewSku("");
      setNewBarcode("");
      setNewUnit("ชิ้น");
      setNewStockType("SALE_ITEM");
      setNewCategory("");
      setNewCostPrice("");
      setNewSellingPrice("");
      setNewLowStockAlert("");
      setNewIsActive(true);
      setNewTrackLots(false);
      toast.success("เพิ่มสินค้าแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(product: Product) {
    const ok = await confirm({
      title: `ลบ ${product.name}?`,
      message: "ยอดและประวัติที่ผูกกับสินค้านี้จะถูกลบด้วย",
      confirmLabel: "ลบ",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/products/${product.id}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ลบไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("ลบสินค้าแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function postMovement(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ทำรายการไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return false;
      }
      toast.success("บันทึกแล้ว");
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function submitReceive() {
    if (!receiveProductId) {
      toast.error("เลือกสินค้า");
      return;
    }
    const qty = Number(receiveQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("จำนวนไม่ถูกต้อง");
      return;
    }
    const unitCost = receiveUnitCost.trim()
      ? Number(receiveUnitCost)
      : null;
    const base = {
      brandProductId: receiveProductId,
      quantity: qty,
      unitCost,
      supplier: receiveSupplier.trim() || null,
      note: receiveNote.trim() || null,
      lotNumber: receiveLotNumber.trim() || null,
      expiresAt: receiveExpiresAt.trim()
        ? new Date(`${receiveExpiresAt}T00:00:00.000Z`).toISOString()
        : null,
    };
    const ok = receiveLocationId
      ? await postMovement({
          action: "stock_in",
          stockLocationId: receiveLocationId,
          ...base,
        })
      : await postMovement({ action: "receive", ...base });
    if (ok) {
      setReceiveQty("1");
      setReceiveUnitCost("");
      setReceiveSupplier("");
      setReceiveNote("");
      setReceiveLotNumber("");
      setReceiveExpiresAt("");
    }
  }

  async function submitTransfer() {
    if (!transferProductId || !transferBranchId) {
      toast.error("เลือกสินค้าและสาขา");
      return;
    }
    const qty = Number(transferQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("จำนวนไม่ถูกต้อง");
      return;
    }
    const ok = await postMovement({
      action: "transfer",
      brandProductId: transferProductId,
      branchId: transferBranchId,
      quantity: qty,
      note: transferNote.trim() || null,
    });
    if (ok) {
      setTransferQty("1");
      setTransferNote("");
    }
  }

  async function submitOutbound() {
    if (!outboundProductId || !outboundLocationId) {
      toast.error("เลือกสินค้าและตำแหน่ง");
      return;
    }
    const qty = Number(outboundQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("จำนวนไม่ถูกต้อง");
      return;
    }
    if (outboundAction === "issue") {
      const product = data?.products.find((p) => p.id === outboundProductId);
      if (product && product.stockType !== "CONSUMABLE") {
        toast.error("เบิกได้เฉพาะของสิ้นเปลือง");
        return;
      }
    }
    const ok = await postMovement({
      action: outboundAction,
      brandProductId: outboundProductId,
      stockLocationId: outboundLocationId,
      quantity: qty,
      note: outboundNote.trim() || null,
      ...(outboundAction !== "issue"
        ? { reason: outboundReason.trim() || null }
        : {}),
    });
    if (ok) {
      setOutboundQty("1");
      setOutboundReason("");
      setOutboundNote("");
    }
  }

  async function createCount() {
    if (!countLocationId || !countName.trim()) {
      toast.error("กรอกชื่อและเลือกตำแหน่ง");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/counts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockLocationId: countLocationId,
          name: countName.trim(),
          type: countType,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("สร้างไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("สร้างรอบตรวจนับแล้ว");
      setCountName("");
      await loadCounts();
      if (body.id) {
        setActiveCountId(body.id as string);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveCountLines(complete = false) {
    if (!activeCountId || !countDetail) return;
    const lines = countDetail.lines.map((line) => {
      const raw = countDraft[line.brandProductId]?.trim() ?? "";
      const countedQty =
        raw === ""
          ? (line.countedQty ?? line.systemQty)
          : Number(raw);
      return {
        brandProductId: line.brandProductId,
        countedQty: Number.isFinite(countedQty) ? Math.max(0, countedQty) : 0,
      };
    });
    setBusy(true);
    try {
      if (complete) {
        const ok = await confirm({
          title: "ปิดรอบตรวจนับ?",
          message: "ระบบจะปรับยอดตามจำนวนที่นับ และปิดรอบนี้",
          confirmLabel: "ปิดรอบ",
        });
        if (!ok) return;
      }
      const res = await fetch(`${apiBase}/counts/${activeCountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, complete }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(complete ? "ปิดรอบตรวจนับแล้ว" : "บันทึกยอดนับแล้ว");
      await loadCounts();
      if (complete) {
        setActiveCountId(null);
        setCountDetail(null);
        await load();
      } else {
        await loadCountDetail(activeCountId);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!loaded || loading || !data) {
    return <AdminLoadingState />;
  }

  const { brand, warehouse, products, locations, pendingTransfers, recentMovements, dashboard } =
    data;
  const stockOn = brand.stockEnabled;
  const visibleTabs = stockOn
    ? TABS
    : TABS.filter((t) => t.id === "settings");

  return (
    <div>
      <AdminPageHeader
        title={`สต๊อก · ${brand.name}`}
        description="บ้านกลางของแบรนด์ — รับของเข้า ส่งสาขา ตรวจนับ และติดตามยอด"
        actions={
          <div className="flex flex-wrap gap-2">
            {stockOn ? (
              <Link
                href={`/admin/brands/${id}/stock/advanced`}
                className={btnOutline}
              >
                สต๊อกขั้นสูง
              </Link>
            ) : null}
            <Link href={`/admin/brands/${id}`} className={btnOutline}>
              กลับแบรนด์
            </Link>
          </div>
        }
      />

      {!stockOn && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-950">
              ยังไม่ได้เปิดระบบสต๊อก
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              กดเปิดใช้งานเพื่อนับจำนวนที่บ้านกลางและสาขา — ระบบเดิม (หมด/ยังมี)
              ยังใช้ได้ตามปกติ
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            className={`${btnPrimary} shrink-0`}
            onClick={() => void toggleStock(true)}
          >
            เปิดใช้งานสต๊อก
          </button>
        </div>
      )}

      <div className="sticky top-[3.25rem] z-20 -mx-1 mb-4 overflow-x-auto filter-scroll-row bg-slate-50/95 px-1 py-2 backdrop-blur lg:top-[3.75rem]">
        <div className="flex min-w-max gap-0.5 rounded-2xl border border-slate-200 bg-white/90 p-1.5 shadow-sm">
          {visibleTabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm transition ${
                  active
                    ? "bg-site-primary font-semibold text-white shadow-sm shadow-slate-900/20"
                    : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                {t.label}
                {t.id === "transfer" && pendingTransfers.length > 0 && (
                  <span
                    className={`inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                      active ? "bg-white/95 text-site-primary" : "bg-amber-500 text-white"
                    }`}
                  >
                    {pendingTransfers.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {!stockOn ? (
        tab === "settings" ? (
          <SettingsPanel
            brand={brand}
            busy={busy}
            onToggleStock={toggleStock}
            onPatchAllowNegative={(v) =>
              void patchSettings({ allowNegativeStock: v })
            }
          />
        ) : (
          <AdminEmptyState
            title="ยังไม่ได้เปิดระบบสต๊อก"
            description="กดเปิดใช้งานด้านบน หรือไปที่แท็บตั้งค่า"
          />
        )
      ) : (
        <div className="space-y-4">
          {tab === "dashboard" && (
            <DashboardPanel
              dashboard={dashboard}
              warehouseName={warehouse?.name ?? "บ้านกลาง"}
              onGoTransfers={() => setTab("transfer")}
            />
          )}

          {tab === "products" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">
                รายการสต๊อก
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                สร้างสินค้าแม่ของแบรนด์ แล้วไปผูกกับเมนูที่แต่ละสาขา
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ["ALL", "ทั้งหมด"],
                    ["SALE_ITEM", STOCK_TYPE_LABELS.SALE_ITEM],
                    ["CONSUMABLE", STOCK_TYPE_LABELS.CONSUMABLE],
                    ["EQUIPMENT", STOCK_TYPE_LABELS.EQUIPMENT],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setProductFilter(value)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                      productFilter === value
                        ? "bg-site-primary text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={adminLabelClass}>ชื่อสินค้า</label>
                  <input
                    className={adminInputClass}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="เช่น ฮอทดอกคลาสสิก"
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>SKU</label>
                  <input
                    className={adminInputClass}
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    placeholder="ไม่บังคับ"
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>บาร์โค้ด</label>
                  <input
                    className={adminInputClass}
                    value={newBarcode}
                    onChange={(e) => setNewBarcode(e.target.value)}
                    placeholder="สแกนหรือพิมพ์"
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>หน่วย</label>
                  <input
                    className={adminInputClass}
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>ประเภท</label>
                  <select
                    className={adminSelectClass}
                    value={newStockType}
                    onChange={(e) =>
                      setNewStockType(e.target.value as StockType)
                    }
                  >
                    {(Object.keys(STOCK_TYPE_LABELS) as StockType[]).map(
                      (t) => (
                        <option key={t} value={t}>
                          {STOCK_TYPE_LABELS[t]}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div>
                  <label className={adminLabelClass}>หมวด</label>
                  <input
                    className={adminInputClass}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="ไม่บังคับ"
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>ต้นทุน</label>
                  <input
                    className={adminInputClass}
                    type="number"
                    min={0}
                    step="0.01"
                    value={newCostPrice}
                    onChange={(e) => setNewCostPrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>ราคาขาย</label>
                  <input
                    className={adminInputClass}
                    type="number"
                    min={0}
                    step="0.01"
                    value={newSellingPrice}
                    onChange={(e) => setNewSellingPrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>แจ้งเตือนต่ำกว่า</label>
                  <input
                    className={adminInputClass}
                    type="number"
                    min={0}
                    value={newLowStockAlert}
                    onChange={(e) => setNewLowStockAlert(e.target.value)}
                    placeholder="ไม่บังคับ"
                  />
                </div>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={newIsActive}
                      onChange={(e) => setNewIsActive(e.target.checked)}
                    />
                    ใช้งาน
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={newTrackLots}
                      onChange={(e) => setNewTrackLots(e.target.checked)}
                    />
                    ติดตามล็อต
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    className={btnPrimary}
                    onClick={() => void createProduct()}
                  >
                    เพิ่มสินค้า
                  </button>
                </div>
              </div>

              <ul className="mt-4 divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const qty = productTotalQty(
                    p,
                    warehouseQtyByProduct.get(p.id),
                  );
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {p.name}
                          {!p.isActive && (
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              (ปิด)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {STOCK_TYPE_LABELS[p.stockType]}
                          {p.sku ? ` · ${p.sku}` : ""}
                          {p.barcode ? ` · บาร์โค้ด ${p.barcode}` : ""}
                          {p.trackLots ? " · ติดตามล็อต" : ""}
                          {p.category ? ` · ${p.category}` : ""}
                          {` · หน่วย ${p.unit}`}
                          {qty != null ? ` · คงเหลือ ${qty}` : ""}
                          {p.lowStockAlert != null
                            ? ` · เตือน ≤ ${p.lowStockAlert}`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600 hover:underline"
                        disabled={busy}
                        onClick={() => void deleteProduct(p)}
                      >
                        ลบ
                      </button>
                    </li>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <li className="py-3 text-sm text-slate-500">ยังไม่มีสินค้า</li>
                )}
              </ul>
            </section>
          )}

          {tab === "receive" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">รับเข้า</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                รับสินค้าเข้าบ้านกลางหรือตำแหน่งอื่น
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={adminLabelClass}>สินค้า</label>
                  <select
                    className={adminSelectClass}
                    value={receiveProductId}
                    onChange={(e) => setReceiveProductId(e.target.value)}
                  >
                    <option value="">เลือกสินค้า</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({STOCK_TYPE_LABELS[p.stockType]})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={adminLabelClass}>ตำแหน่ง</label>
                  <select
                    className={adminSelectClass}
                    value={receiveLocationId}
                    onChange={(e) => setReceiveLocationId(e.target.value)}
                  >
                    <option value="">บ้านกลาง (receive)</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                        {loc.type === "WAREHOUSE" ? " · บ้านกลาง" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={adminLabelClass}>จำนวน</label>
                  <input
                    className={adminInputClass}
                    type="number"
                    min={1}
                    value={receiveQty}
                    onChange={(e) => setReceiveQty(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>ต้นทุน/หน่วย</label>
                  <input
                    className={adminInputClass}
                    type="number"
                    min={0}
                    step="0.01"
                    value={receiveUnitCost}
                    onChange={(e) => setReceiveUnitCost(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>ผู้ขาย/ซัพพลายเออร์</label>
                  <input
                    className={adminInputClass}
                    value={receiveSupplier}
                    onChange={(e) => setReceiveSupplier(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>หมายเหตุ</label>
                  <input
                    className={adminInputClass}
                    value={receiveNote}
                    onChange={(e) => setReceiveNote(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>เลขล็อต</label>
                  <input
                    className={adminInputClass}
                    value={receiveLotNumber}
                    onChange={(e) => setReceiveLotNumber(e.target.value)}
                    placeholder="ถ้าเปิดติดตามล็อต"
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>วันหมดอายุ</label>
                  <input
                    className={adminInputClass}
                    type="date"
                    value={receiveExpiresAt}
                    onChange={(e) => setReceiveExpiresAt(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  disabled={busy || !receiveProductId}
                  className={btnPrimary}
                  onClick={() => void submitReceive()}
                >
                  บันทึกรับเข้า
                </button>
              </div>

              {(warehouse?.balances?.length ?? 0) > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-700">
                    ยอดบ้านกลาง
                  </p>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {warehouse!.balances.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-center justify-between py-2 text-sm"
                      >
                        <span className="text-slate-800">{b.product.name}</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {b.quantity} {b.product.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {tab === "transfer" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">ส่งสาขา</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                ตัดจากบ้านกลางทันที — สาขาต้องกดยืนยันรับในหน้า Staff
              </p>
              {enabledBranches.length === 0 ? (
                <p className="mt-3 text-sm text-amber-800">
                  ยังไม่มีสาขาที่เปิดสต๊อก — ไปเปิดที่หน้าตั้งค่าสาขา
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={adminLabelClass}>สินค้า</label>
                    <select
                      className={adminSelectClass}
                      value={transferProductId}
                      onChange={(e) => setTransferProductId(e.target.value)}
                    >
                      <option value="">เลือกสินค้า</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {warehouseQtyByProduct.has(p.id)
                            ? ` (${warehouseQtyByProduct.get(p.id)})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={adminLabelClass}>สาขา</label>
                    <select
                      className={adminSelectClass}
                      value={transferBranchId}
                      onChange={(e) => setTransferBranchId(e.target.value)}
                    >
                      <option value="">เลือกสาขา</option>
                      {enabledBranches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={adminLabelClass}>จำนวน</label>
                    <input
                      className={adminInputClass}
                      type="number"
                      min={1}
                      value={transferQty}
                      onChange={(e) => setTransferQty(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={adminLabelClass}>หมายเหตุ</label>
                    <input
                      className={adminInputClass}
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {enabledBranches.length > 0 && (
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={busy || !transferProductId || !transferBranchId}
                    className={btnPrimary}
                    onClick={() => void submitTransfer()}
                  >
                    ส่งสาขา
                  </button>
                </div>
              )}

              {pendingTransfers.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-semibold text-amber-800">
                    รอพนักงานรับ ({pendingTransfers.length})
                  </p>
                  <ul className="space-y-2">
                    {pendingTransfers.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950"
                      >
                        <span className="font-medium">
                          {t.product.name} ×{t.quantity}
                        </span>
                        {" → "}
                        {t.branch.name}
                        <span className="ml-2 text-amber-700/70">
                          {new Date(t.createdAt).toLocaleString("th-TH")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-100 pt-3">
                {data.branches.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {b.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {b.stockEnabled ? "เปิดสต๊อกแล้ว" : "ยังไม่เปิดสต๊อก"}
                      </p>
                    </div>
                    <Link
                      href={`/admin/branches/${b.id}/stock`}
                      className="text-xs font-semibold text-site-primary hover:underline"
                    >
                      ดูสต๊อกสาขา
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "counts" && (
            <div className="space-y-4">
              <section className={cardClass}>
                <h3 className="text-sm font-semibold text-slate-900">
                  สร้างรอบตรวจนับ
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={adminLabelClass}>ตำแหน่ง</label>
                    <select
                      className={adminSelectClass}
                      value={countLocationId}
                      onChange={(e) => setCountLocationId(e.target.value)}
                    >
                      <option value="">เลือกตำแหน่ง</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={adminLabelClass}>ชื่อรอบ</label>
                    <input
                      className={adminInputClass}
                      value={countName}
                      onChange={(e) => setCountName(e.target.value)}
                      placeholder="เช่น นับสัปดาห์ที่ 30"
                    />
                  </div>
                  <div>
                    <label className={adminLabelClass}>ประเภท</label>
                    <select
                      className={adminSelectClass}
                      value={countType}
                      onChange={(e) =>
                        setCountType(e.target.value as CountType)
                      }
                    >
                      {(Object.keys(COUNT_TYPE_LABELS) as CountType[]).map(
                        (t) => (
                          <option key={t} value={t}>
                            {COUNT_TYPE_LABELS[t]}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={busy}
                      className={btnPrimary}
                      onClick={() => void createCount()}
                    >
                      สร้างรอบ
                    </button>
                  </div>
                </div>
              </section>

              <section className={cardClass}>
                <h3 className="text-sm font-semibold text-slate-900">
                  รายการรอบตรวจนับ
                </h3>
                <ul className="mt-3 divide-y divide-slate-100">
                  {counts.map((c) => {
                    const active = activeCountId === c.id;
                    const editable = isActiveCount(c.status);
                    return (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {c.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {c.location.name} · {COUNT_TYPE_LABELS[c.type]} ·{" "}
                            {COUNT_STATUS_LABELS[c.status]} · {c._count.lines}{" "}
                            รายการ
                          </p>
                        </div>
                        {editable ? (
                          <button
                            type="button"
                            className={
                              active
                                ? btnPrimary
                                : `${btnOutline} !py-1.5 !text-xs`
                            }
                            onClick={() =>
                              setActiveCountId(active ? null : c.id)
                            }
                          >
                            {active ? "กำลังแก้ไข" : "แก้ไขยอดนับ"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {c.completedAt
                              ? new Date(c.completedAt).toLocaleString("th-TH")
                              : COUNT_STATUS_LABELS[c.status]}
                          </span>
                        )}
                      </li>
                    );
                  })}
                  {counts.length === 0 && (
                    <li className="py-3 text-sm text-slate-500">
                      ยังไม่มีรอบตรวจนับ
                    </li>
                  )}
                </ul>
              </section>

              {countDetail && isActiveCount(countDetail.status) && (
                <section className={cardClass}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        นับยอด · {countDetail.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {countDetail.location.name} · ระบบ vs นับจริง
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        className={btnOutline}
                        onClick={() => void saveCountLines(false)}
                      >
                        บันทึก
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className={btnPrimary}
                        onClick={() => void saveCountLines(true)}
                      >
                        ปิดรอบ
                      </button>
                    </div>
                  </div>
                  <ul className="mt-4 divide-y divide-slate-100">
                    {countDetail.lines.map((line) => (
                      <li
                        key={line.id}
                        className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-2 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {line.product.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            ระบบ {line.systemQty} {line.product.unit}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">นับ</span>
                        <input
                          className={adminInputClass}
                          type="number"
                          min={0}
                          value={countDraft[line.brandProductId] ?? ""}
                          onChange={(e) =>
                            setCountDraft((prev) => ({
                              ...prev,
                              [line.brandProductId]: e.target.value,
                            }))
                          }
                          placeholder={String(line.systemQty)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {tab === "outbound" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">
                เสีย / สูญหาย / เบิก
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                ตัดยอดออกจากตำแหน่งที่เลือก — เบิกใช้ได้เฉพาะของสิ้นเปลือง
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ["damage", "เสีย"],
                    ["lost", "สูญหาย"],
                    ["issue", "เบิก"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setOutboundAction(value);
                      setOutboundProductId("");
                    }}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                      outboundAction === value
                        ? "bg-site-primary text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={adminLabelClass}>สินค้า</label>
                  <select
                    className={adminSelectClass}
                    value={outboundProductId}
                    onChange={(e) => setOutboundProductId(e.target.value)}
                  >
                    <option value="">เลือกสินค้า</option>
                    {(outboundAction === "issue"
                      ? issueProducts
                      : products
                    ).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({STOCK_TYPE_LABELS[p.stockType]})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={adminLabelClass}>ตำแหน่ง</label>
                  <select
                    className={adminSelectClass}
                    value={outboundLocationId}
                    onChange={(e) => setOutboundLocationId(e.target.value)}
                  >
                    <option value="">เลือกตำแหน่ง</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={adminLabelClass}>จำนวน</label>
                  <input
                    className={adminInputClass}
                    type="number"
                    min={1}
                    value={outboundQty}
                    onChange={(e) => setOutboundQty(e.target.value)}
                  />
                </div>
                {outboundAction !== "issue" && (
                  <div>
                    <label className={adminLabelClass}>เหตุผล</label>
                    <input
                      className={adminInputClass}
                      value={outboundReason}
                      onChange={(e) => setOutboundReason(e.target.value)}
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className={adminLabelClass}>หมายเหตุ</label>
                  <input
                    className={adminInputClass}
                    value={outboundNote}
                    onChange={(e) => setOutboundNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  disabled={
                    busy || !outboundProductId || !outboundLocationId
                  }
                  className={btnDanger}
                  onClick={() => void submitOutbound()}
                >
                  บันทึก
                  {outboundAction === "damage"
                    ? "ของเสีย"
                    : outboundAction === "lost"
                      ? "สูญหาย"
                      : "เบิก"}
                </button>
              </div>
            </section>
          )}

          {tab === "history" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">
                ประวัติความเคลื่อนไหว
              </h3>
              <ul className="mt-3 divide-y divide-slate-100">
                {recentMovements.map((m) => (
                  <li key={m.id} className="py-2.5 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-900">
                        {MOVEMENT_LABELS[m.type] ?? m.type} · {m.product.name} ×
                        {m.quantity}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(m.createdAt).toLocaleString("th-TH")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {[
                        m.fromLocation?.name,
                        m.toLocation?.name ?? m.stockLocation?.name,
                      ]
                        .filter(Boolean)
                        .join(" → ") ||
                        m.note ||
                        "—"}
                    </p>
                  </li>
                ))}
                {recentMovements.length === 0 && (
                  <li className="py-3 text-sm text-slate-500">ยังไม่มีรายการ</li>
                )}
              </ul>
            </section>
          )}

          {tab === "settings" && (
            <SettingsPanel
              brand={brand}
              busy={busy}
              onToggleStock={toggleStock}
              onPatchAllowNegative={(v) =>
                void patchSettings({ allowNegativeStock: v })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

function DashboardPanel({
  dashboard,
  warehouseName,
  onGoTransfers,
}: {
  dashboard: Dashboard | null;
  warehouseName: string;
  onGoTransfers: () => void;
}) {
  if (!dashboard) {
    return (
      <AdminEmptyState
        title="ยังไม่มีข้อมูล Dashboard"
        description="เปิดระบบสต๊อกและเพิ่มสินค้าเพื่อดูสรุป"
      />
    );
  }

  const metrics: { label: string; value: string; hint?: string }[] = [
    { label: "SKU ใช้งาน", value: String(dashboard.totalSku) },
    { label: "ใกล้หมด", value: String(dashboard.lowStock) },
    { label: "หมดสต๊อก", value: String(dashboard.outOfStock) },
    {
      label: "มูลค่าสต๊อก",
      value: `฿${formatMoney(dashboard.stockValue)}`,
      hint: warehouseName,
    },
    { label: "เสีย/สูญหายวันนี้", value: String(dashboard.damageLostToday) },
    { label: "สิ้นเปลืองใกล้หมด", value: String(dashboard.consumableLow) },
    {
      label: "อุปกรณ์ต้องดูแล",
      value: String(dashboard.equipmentAttention),
    },
    {
      label: "รอส่งรับสาขา",
      value: String(dashboard.pendingTransfers),
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className={cardClass}>
            <p className="text-[11px] font-medium text-slate-500">{m.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {m.value}
            </p>
            {m.hint && (
              <p className="mt-0.5 text-[10px] text-slate-400">{m.hint}</p>
            )}
          </div>
        ))}
      </section>

      {dashboard.pendingTransfers > 0 && (
        <button
          type="button"
          onClick={onGoTransfers}
          className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950"
        >
          มี {dashboard.pendingTransfers} รายการรอพนักงานรับที่สาขา — ไปดูที่แท็บส่งสาขา
        </button>
      )}

      <section className={cardClass}>
        <h3 className="text-sm font-semibold text-slate-900">
          สินค้าที่ต้องสนใจ
        </h3>
        <ul className="mt-3 divide-y divide-slate-100">
          {dashboard.lowItems.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {STOCK_TYPE_LABELS[item.type]}
                </p>
              </div>
              <span
                className={`font-mono text-sm font-semibold ${
                  item.qty <= 0 ? "text-red-600" : "text-amber-700"
                }`}
              >
                {item.qty}
              </span>
            </li>
          ))}
          {dashboard.lowItems.length === 0 && (
            <li className="py-3 text-sm text-slate-500">
              ไม่มีรายการใกล้หมดหรือหมดสต๊อก
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function SettingsPanel({
  brand,
  busy,
  onToggleStock,
  onPatchAllowNegative,
}: {
  brand: StockPayload["brand"];
  busy: boolean;
  onToggleStock: (enabled: boolean) => void | Promise<void>;
  onPatchAllowNegative: (value: boolean) => void;
}) {
  return (
    <section className={cardClass}>
      <h3 className="text-sm font-semibold text-slate-900">ตั้งค่าสต๊อก</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        ควบคุมการเปิดใช้ระบบและความยืดหยุ่นของยอดติดลบ
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-900">ระบบสต๊อกแบรนด์</p>
            <p className="text-xs text-slate-500">
              {brand.stockEnabled
                ? "เปิดอยู่ — สาขาที่เปิดสต๊อกจะตัดจำนวนตอนรับออเดอร์"
                : "ปิดอยู่ — ใช้ระบบเดิม (หมด/ยังมี)"}
            </p>
          </div>
          {brand.stockEnabled ? (
            <button
              type="button"
              disabled={busy}
              className={btnDanger}
              onClick={() => void onToggleStock(false)}
            >
              ปิดใช้งาน
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className={btnPrimary}
              onClick={() => void onToggleStock(true)}
            >
              เปิดใช้งาน
            </button>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 px-4 py-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={brand.allowNegativeStock}
            disabled={busy || !brand.stockEnabled}
            onChange={(e) => onPatchAllowNegative(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              อนุญาตสต๊อกติดลบ
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              ถ้าปิด ระบบจะกันการตัดยอดเมื่อของไม่พอ
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
