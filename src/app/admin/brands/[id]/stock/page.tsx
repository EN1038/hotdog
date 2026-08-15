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
import { AdminModal } from "@/components/admin/AdminModal";
import { ImageField } from "@/components/admin/ImageField";
import { DateInput } from "@/components/DateInput";

type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
type CountType = "WEEKLY" | "MONTHLY" | "CUSTOM";
type CountStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type Supplier = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};

type PoLine = {
  id: string;
  brandProductId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: string | number | null;
  product: Product;
};

type PurchaseOrder = {
  id: string;
  orderNumber: string;
  status: string;
  note: string | null;
  expectedAt: string | null;
  createdAt: string;
  supplier: Supplier;
  lines: PoLine[];
  location: { id: string; name: string } | null;
};

type Lot = {
  id: string;
  lotNumber: string;
  quantity: number;
  expiresAt: string | null;
  product: Product;
  location: { id: string; name: string; type: string };
};

type RecipeProduct = {
  id: string;
  name: string;
  stockType: string;
  recipeLines: {
    id: string;
    quantityPerUnit: string | number;
    note: string | null;
    component: Product;
  }[];
};

type ForecastRow = {
  productId: string;
  name: string;
  unit: string;
  usedLastDays: number;
  avgDaily: number;
  onHand: number;
  daysCover: number | null;
  suggestedOrder: number;
  lowStockAlert: number | null;
};

const PO_STATUS: Record<string, string> = {
  DRAFT: "ร่าง",
  ORDERED: "สั่งแล้ว",
  PARTIAL: "รับบางส่วน",
  RECEIVED: "รับครบ",
  CANCELLED: "ยกเลิก",
};

type TabCategory = "daily" | "purchasing" | "advanced";

type TabId =
  // Daily
  | "dashboard"
  | "products"
  | "warehouses"
  | "receive"
  | "transfer"
  | "copy_menu"
  | "counts"
  | "outbound"
  | "history"
  // Purchasing & Lots
  | "po"
  | "suppliers"
  | "lots"
  | "branch_transfer"
  // Recipes & Accounting
  | "recipes"
  | "forecast"
  | "accounting"
  | "settings";

const TAB_CATEGORIES: {
  id: TabCategory;
  label: string;
  tabs: { id: TabId; label: string }[];
}[] = [
  {
    id: "daily",
    label: "📦 งานประจำวัน",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "products", label: "รายการสต๊อก" },
      { id: "warehouses", label: "คลังสต๊อกกลาง" },
      { id: "receive", label: "รับเข้า" },
      { id: "transfer", label: "ส่งสาขา/รายงานรับโอน" },
      { id: "copy_menu", label: "คัดลอกเมนู" },
      { id: "counts", label: "ตรวจนับ" },
      { id: "outbound", label: "เสีย/สูญหาย/เบิก" },
      { id: "history", label: "ประวัติ" },
    ],
  },
  {
    id: "purchasing",
    label: "📑 จัดซื้อ & ล็อต (PO & Suppliers)",
    tabs: [
      { id: "po", label: "ใบสั่งซื้อ (PO)" },
      { id: "suppliers", label: "ผู้ขาย (Suppliers)" },
      { id: "lots", label: "ล็อต/หมดอายุ (FEFO)" },
      { id: "branch_transfer", label: "โอนระหว่างสาขา" },
    ],
  },
  {
    id: "advanced",
    label: "📊 สูตร & บัญชี (BOM & Accounting)",
    tabs: [
      { id: "recipes", label: "สูตร/BOM" },
      { id: "forecast", label: "พยากรณ์สั่ง" },
      { id: "accounting", label: "รายงานบัญชี CSV" },
      { id: "settings", label: "ตั้งค่า" },
    ],
  },
];

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
  imageUrl?: string | null;
  description?: string | null;
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

type CompletedTransfer = {
  id: string;
  quantity: number;
  receivedQuantity: number | null;
  varianceQuantity: number | null;
  varianceNote: string | null;
  createdAt: string;
  receivedAt: string | null;
  product: { id: string; name: string; unit: string };
  branch: { id: string; name: string };
  receivedByStaff?: { id: string; name: string } | null;
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
    stockAgingWarnDays?: number;
    stockAgingCriticalDays?: number;
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
  warehouses?: {
    id: string;
    name: string;
    type: string;
    branchId: string | null;
    balances?: {
      id: string;
      quantity: number;
      product: Product;
    }[];
  }[];
  products: Product[];
  branches: BranchRow[];
  locations: Location[];
  pendingTransfers: PendingTransfer[];
  completedTransfers?: CompletedTransfer[];
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
  { id: "warehouses", label: "คลังสต๊อกกลาง" },
  { id: "receive", label: "รับเข้า" },
  { id: "transfer", label: "ส่งสาขา/รายงานรับโอน" },
  { id: "copy_menu", label: "คัดลอกเมนู" },
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
  const [tab, setTabState] = useState<TabId>("dashboard");
  const [activeCategory, setActiveCategory] = useState<TabCategory>("daily");

  const setTab = useCallback((newTab: TabId) => {
    setTabState(newTab);
    const cat = TAB_CATEGORIES.find((c) => c.tabs.some((t) => t.id === newTab));
    if (cat) {
      setActiveCategory(cat.id);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("tab");
    if (!raw) return;
    const allTabs = TAB_CATEGORIES.flatMap((c) => c.tabs.map((t) => t.id));
    if ((allTabs as string[]).includes(raw)) {
      setTab(raw as TabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [busy, setBusy] = useState(false);
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
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [productModalOpen, setProductModalOpen] = useState(false);
  
  const resetProductForm = useCallback(() => {
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
    setNewImageUrl("");
    setNewDescription("");
  }, []);

  const [receiveProductId, setReceiveProductId] = useState("");
  const [receiveLocationId, setReceiveLocationId] = useState("");
  const [receiveQty, setReceiveQty] = useState("1");
  const [receiveUnitCost, setReceiveUnitCost] = useState("");
  const [receiveSupplier, setReceiveSupplier] = useState("");
  const [receiveNote, setReceiveNote] = useState("");
  const [receiveLotNumber, setReceiveLotNumber] = useState("");
  const [receiveExpiresAt, setReceiveExpiresAt] = useState("");

  const [copyBranchId, setCopyBranchId] = useState("");
  const [copyAction, setCopyAction] = useState<"copy_from_branch_to_brand" | "copy_from_brand_to_branch">("copy_from_brand_to_branch");

  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [transferSourceLocationId, setTransferSourceLocationId] = useState("");

  const [transferProductId, setTransferProductId] = useState("");
  const [transferBranchId, setTransferBranchId] = useState("");
  const [transferQty, setTransferQty] = useState("1");
  const [transferNote, setTransferNote] = useState("");

  // Advanced Stock State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");

  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [poSupplierId, setPoSupplierId] = useState("");
  const [poProductId, setPoProductId] = useState("");
  const [poQty, setPoQty] = useState("10");
  const [poUnitCost, setPoUnitCost] = useState("");
  const [receiveQtyMap, setReceiveQtyMap] = useState<Record<string, string>>({});

  const [btSource, setBtSource] = useState("");
  const [btDest, setBtDest] = useState("");
  const [btProductId, setBtProductId] = useState("");
  const [btQty, setBtQty] = useState("1");
  const [btNote, setBtNote] = useState("");

  const [lots, setLots] = useState<Lot[]>([]);
  const [recipes, setRecipes] = useState<RecipeProduct[]>([]);
  const [recipeParentId, setRecipeParentId] = useState("");
  const [recipeComponentId, setRecipeComponentId] = useState("");
  const [recipeQty, setRecipeQty] = useState("1");

  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [acctFrom, setAcctFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [acctTo, setAcctTo] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

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
    stockAgingWarnDays?: number;
    stockAgingCriticalDays?: number;
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
          imageUrl: newImageUrl.trim() || null,
          description: newDescription.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เพิ่มไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      resetProductForm();
      setProductModalOpen(false);
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

  const loadSuppliers = useCallback(async () => {
    const res = await fetch(`${apiBase}/suppliers`);
    if (res.ok) setSuppliers((await res.json()) as Supplier[]);
  }, [apiBase]);

  const loadPos = useCallback(async () => {
    const res = await fetch(`${apiBase}/purchase-orders`);
    if (res.ok) setPos((await res.json()) as PurchaseOrder[]);
  }, [apiBase]);

  const loadLots = useCallback(async () => {
    const res = await fetch(`${apiBase}/advanced?view=lots`);
    if (res.ok) setLots((await res.json()) as Lot[]);
  }, [apiBase]);

  const loadRecipes = useCallback(async () => {
    const res = await fetch(`${apiBase}/advanced?view=recipes`);
    if (res.ok) setRecipes((await res.json()) as RecipeProduct[]);
  }, [apiBase]);

  const loadForecast = useCallback(async () => {
    const res = await fetch(`${apiBase}/advanced?view=forecast&days=14`);
    if (res.ok) setForecast((await res.json()) as ForecastRow[]);
  }, [apiBase]);

  useEffect(() => {
    if (!data?.brand.stockEnabled) return;
    if (tab === "suppliers") void loadSuppliers();
    if (tab === "po") {
      void loadSuppliers();
      void loadPos();
    }
    if (tab === "lots") void loadLots();
    if (tab === "recipes") void loadRecipes();
    if (tab === "forecast") void loadForecast();
  }, [tab, data, loadSuppliers, loadPos, loadLots, loadRecipes, loadForecast]);

  useEffect(() => {
    if (!data?.products.length) return;
    if (!poProductId) setPoProductId(data.products[0].id);
    if (!btProductId) setBtProductId(data.products[0].id);
    if (!recipeParentId) setRecipeParentId(data.products[0].id);
    if (!recipeComponentId && data.products[1]) {
      setRecipeComponentId(data.products[1].id);
    }
  }, [data, poProductId, btProductId, recipeParentId, recipeComponentId]);

  useEffect(() => {
    if (!suppliers.length) return;
    if (!poSupplierId) setPoSupplierId(suppliers[0].id);
  }, [suppliers, poSupplierId]);

  useEffect(() => {
    const branches = data?.branches.filter((b) => b.stockEnabled) ?? [];
    if (branches.length < 2) return;
    if (!btSource) setBtSource(branches[0].id);
    if (!btDest) setBtDest(branches[1].id);
  }, [data, btSource, btDest]);

  async function createSupplier() {
    const name = supplierName.trim();
    if (!name) {
      toast.error("กรอกชื่อผู้ขาย");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/suppliers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: supplierPhone.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เพิ่มไม่สำเร็จ", body.error ?? "ลองใหม่");
        return;
      }
      setSupplierName("");
      setSupplierPhone("");
      toast.success("เพิ่มผู้ขายแล้ว");
      await loadSuppliers();
    } finally {
      setBusy(false);
    }
  }

  async function createPo() {
    if (!poSupplierId || !poProductId) {
      toast.error("เลือกผู้ขายและสินค้า");
      return;
    }
    const qty = Number(poQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("จำนวนไม่ถูกต้อง");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/purchase-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: poSupplierId,
          stockLocationId: data?.warehouse?.id ?? null,
          lines: [
            {
              brandProductId: poProductId,
              quantityOrdered: qty,
              unitCost: poUnitCost.trim() ? Number(poUnitCost) : null,
            },
          ],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("สร้าง PO ไม่สำเร็จ", body.error ?? "ลองใหม่");
        return;
      }
      setPoQty("10");
      setPoUnitCost("");
      toast.success(`สร้าง ${body.orderNumber ?? "PO"} แล้ว`);
      await loadPos();
    } finally {
      setBusy(false);
    }
  }

  async function patchPo(
    poId: string,
    action: "order" | "receive" | "cancel",
    lines?: { brandProductId: string; quantity: number }[],
  ) {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, lines }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ไม่สำเร็จ", body.error ?? "ลองใหม่");
        return;
      }
      toast.success(
        action === "order"
          ? "สั่งซื้อแล้ว"
          : action === "receive"
            ? "รับของเข้าสต๊อกแล้ว"
            : "ยกเลิกแล้ว",
      );
      await loadPos();
      if (action === "receive") {
        await loadLots();
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitBranchTransfer() {
    if (!btSource || !btDest || !btProductId) {
      toast.error("เลือกสาขาและสินค้า");
      return;
    }
    const qty = Number(btQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("จำนวนไม่ถูกต้อง");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/advanced`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "branch_transfer",
          sourceBranchId: btSource,
          destinationBranchId: btDest,
          brandProductId: btProductId,
          quantity: qty,
          note: btNote.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("โอนไม่สำเร็จ", body.error ?? "ลองใหม่");
        return;
      }
      setBtQty("1");
      setBtNote("");
      toast.success("ส่งโอนแล้ว — รอสาขาปลายทางยืนยันรับ");
    } finally {
      setBusy(false);
    }
  }

  async function saveRecipe() {
    if (!recipeParentId || !recipeComponentId) {
      toast.error("เลือกสินค้าแม่และวัตถุดิบ");
      return;
    }
    const qty = Number(recipeQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("ปริมาณไม่ถูกต้อง");
      return;
    }
    const existing =
      recipes.find((r) => r.id === recipeParentId)?.recipeLines ?? [];
    const lines = [
      ...existing
        .filter((l) => l.component.id !== recipeComponentId)
        .map((l) => ({
          componentProductId: l.component.id,
          quantityPerUnit: Number(l.quantityPerUnit),
          note: l.note,
        })),
      {
        componentProductId: recipeComponentId,
        quantityPerUnit: qty,
      },
    ];
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/advanced`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recipe",
          parentProductId: recipeParentId,
          lines,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกสูตรไม่สำเร็จ", body.error ?? "ลองใหม่");
        return;
      }
      toast.success("บันทึกสูตรแล้ว");
      await loadRecipes();
    } finally {
      setBusy(false);
    }
  }

  function downloadAccounting() {
    const from = new Date(`${acctFrom}T00:00:00.000Z`).toISOString();
    const to = new Date(`${acctTo}T23:59:59.999Z`).toISOString();
    window.open(
      `${apiBase}/advanced?view=accounting&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      "_blank",
    );
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
      sourceLocationId: transferSourceLocationId || undefined,
      quantity: qty,
      note: transferNote.trim() || null,
    });
    if (ok) {
      setTransferQty("1");
      setTransferNote("");
    }
  }

  async function submitCreateWarehouse() {
    if (!newWarehouseName.trim()) {
      toast.error("กรุณาระบุชื่อคลังสต๊อกกลาง");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/warehouses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWarehouseName.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("สร้างคลังไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(`สร้างคลังสต๊อกกลาง "${newWarehouseName}" เรียบร้อยแล้ว`);
      setNewWarehouseName("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function submitDeleteWarehouse(locationId: string, name: string) {
    const ok = await confirm({
      title: `ลบคลังสินค้า "${name}"?`,
      message: "การลบคลังสต๊อกกลางจะไม่สามารถย้อนกลับได้",
      confirmLabel: "ลบคลัง",
      cancelLabel: "ยกเลิก",
      tone: "danger",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/warehouses`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ลบคลังไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("ลบคลังสต๊อกกลางแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function executeCopyMenu() {
    if (!copyBranchId) {
      toast.error("กรุณาเลือกสาขา");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/copy-menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: copyAction, branchId: copyBranchId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ทำรายการไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(body.message ?? "ทำรายการสำเร็จ");
      await load();
    } finally {
      setBusy(false);
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
        description="สต๊อกกลางของแบรนด์ — รับของเข้า ส่งสาขา ตรวจนับ และติดตามยอด"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/brands/${id}/kitchen`} className={btnOutline}>
              ครัว / ผลิต
            </Link>
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
              กดเปิดใช้งานเพื่อนับจำนวนที่สต๊อกกลางและสาขา — ระบบเดิม (หมด/ยังมี)
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

      {/* 2-Tier Navigation: Main Tabs (Tab ใหญ่) & Sub Tabs (Tab ย่อย) */}
      <div className="sticky top-[3.25rem] z-20 -mx-1 mb-5 space-y-2 bg-slate-50/95 px-1 py-2 backdrop-blur lg:top-[3.75rem]">
        {/* Tier 1: Main Category Tabs (Tab ใหญ่) */}
        <div className="flex gap-2 border-b border-slate-200/80 pb-2.5 overflow-x-auto">
          {TAB_CATEGORIES.map((cat) => {
            const isCatActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveCategory(cat.id);
                  if (!cat.tabs.some((t) => t.id === tab)) {
                    setTab(cat.tabs[0].id);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 border ${
                  isCatActive
                    ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                    : "bg-white text-slate-600 hover:bg-slate-100 border-slate-200"
                }`}
              >
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tier 2: Sub Tabs (Tab ย่อย ประจำหมวดหมู่ที่เลือก) */}
        {(() => {
          const currentCategoryObj =
            TAB_CATEGORIES.find((cat) => cat.id === activeCategory) || TAB_CATEGORIES[0];
          return (
            <div className="flex min-w-max gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm overflow-x-auto">
              {currentCategoryObj.tabs.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                      active
                        ? "bg-site-primary text-white shadow-sm shadow-slate-900/20"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
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
          );
        })()}
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
            onPatchAging={(warn, critical) =>
              void patchSettings({
                stockAgingWarnDays: warn,
                stockAgingCriticalDays: critical,
              })
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
              warehouseName={warehouse?.name ?? "สต๊อกกลาง"}
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

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(true)}
                  className={btnPrimary}
                >
                  + เพิ่มสินค้า / SKU ใหม่
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map((p) => {
                  const qty = productTotalQty(
                    p,
                    warehouseQtyByProduct.get(p.id),
                  );
                  return (
                    <div
                      key={p.id}
                      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                    >
                      <div className="aspect-[4/3] w-full bg-slate-50 relative overflow-hidden flex-shrink-0">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className={`h-full w-full object-cover transition-opacity ${!p.isActive ? "opacity-50 grayscale" : ""}`}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300">
                            <span className="text-sm">ไม่มีรูปภาพ</span>
                          </div>
                        )}
                        {!p.isActive && (
                          <div className="absolute top-2 right-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
                            ปิดใช้งาน
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-900 line-clamp-1">
                            {p.name}
                          </h4>
                          {p.description && (
                            <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                              {p.description}
                            </p>
                          )}
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              {STOCK_TYPE_LABELS[p.stockType]}
                            </span>
                            {p.category && (
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                {p.category}
                              </span>
                            )}
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              หน่วย: {p.unit}
                            </span>
                          </div>
                          
                          <div className="mt-3 text-xs text-slate-600 space-y-1">
                            {p.sku && <p>SKU: <span className="font-medium">{p.sku}</span></p>}
                            {qty != null && (
                              <p>คงเหลือ: <span className="font-medium text-slate-900">{qty} {p.unit}</span></p>
                            )}
                            {p.sellingPrice != null && (
                              <p>ราคาขาย: <span className="font-medium text-green-700">฿{formatMoney(Number(p.sellingPrice))}</span></p>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-600 hover:text-orange-600"
                            disabled={busy}
                            onClick={() => {
                              // TODO: Implement Edit Modal functionality if needed
                              toast.success("หากต้องการแก้ไข ให้ไปทำที่หน้าเมนูสาขา");
                            }}
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            className="text-xs font-medium text-red-600 hover:text-red-700"
                            disabled={busy}
                            onClick={() => void deleteProduct(p)}
                          >
                            ลบ
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {filteredProducts.length === 0 && (
                <div className="mt-8 text-center py-12 rounded-xl border border-dashed border-slate-200">
                  <p className="text-sm text-slate-500">ยังไม่มีสินค้าในหมวดหมู่นี้</p>
                </div>
              )}
            </section>
          )}

          <AdminModal
            open={productModalOpen}
            onClose={() => setProductModalOpen(false)}
            title="เพิ่มสินค้า / SKU ใหม่"
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={adminLabelClass}>รูปภาพสินค้า</label>
                  <div className="mt-1">
                    <ImageField
                      value={newImageUrl}
                      onChange={setNewImageUrl}
                      folder="Products"
                      size="thumb"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={adminLabelClass}>ชื่อสินค้า <span className="text-red-500">*</span></label>
                  <input
                    className={adminInputClass}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="เช่น ฮอทดอกคลาสสิก"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={adminLabelClass}>รายละเอียดสินค้า (Description)</label>
                  <textarea
                    className={adminInputClass}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="คำอธิบายสำหรับเมนูสาขา"
                    rows={3}
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
                    {(Object.keys(STOCK_TYPE_LABELS) as StockType[]).map((t) => (
                      <option key={t} value={t}>
                        {STOCK_TYPE_LABELS[t as StockType]}
                      </option>
                    ))}
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
              </div>

              <div className="flex items-center gap-4 py-2">
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
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => setProductModalOpen(false)}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy}
                  onClick={() => void createProduct()}
                >
                  {busy ? "กำลังบันทึก..." : "บันทึกสินค้า"}
                </button>
              </div>
            </div>
          </AdminModal>

          {tab === "receive" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">รับเข้า</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                รับสินค้าเข้าสต๊อกกลางหรือตำแหน่งอื่น
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
                    <option value="">สต๊อกกลาง (receive)</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                        {loc.type === "WAREHOUSE" ? " · สต๊อกกลาง" : ""}
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
                  <DateInput
                    className={adminInputClass}
                    value={receiveExpiresAt}
                    onChange={(v) => setReceiveExpiresAt(v)}
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
                    ยอดสต๊อกกลาง
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

          {tab === "warehouses" && (
            <section className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    จัดการคลังสต๊อกกลาง (Central Warehouses)
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    รองรับคลังสต๊อกกลางหลายแห่งในแบรนด์เดียวกัน เช่น คลังกลาง กทม., คลังกลาง เชียงใหม่
                  </p>
                </div>
              </div>

              {/* Form Create Warehouse */}
              <div className="mt-5 rounded-2xl bg-slate-50 p-4 border border-slate-200/80 max-w-xl">
                <h4 className="text-xs font-bold text-slate-800 mb-2">
                  + เพิ่มคลังสต๊อกกลางแห่งใหม่
                </h4>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    className={adminInputClass}
                    placeholder="เช่น คลังกลาง ชลบุรี, คลังโรงงานหลัก"
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy || !newWarehouseName.trim()}
                    onClick={() => void submitCreateWarehouse()}
                    className={`${btnPrimary} shrink-0`}
                  >
                    สร้างคลังใหม่
                  </button>
                </div>
              </div>

              {/* Warehouses List */}
              <div className="mt-6 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  รายการคลังสต๊อกกลางทั้งหมด ({data.warehouses?.length ?? 1} แห่ง)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(data.warehouses || [data.warehouse]).map((wh, idx) => {
                    if (!wh) return null;
                    const totalQty = wh.balances?.reduce((acc, b) => acc + b.quantity, 0) ?? 0;
                    const isDefault = idx === 0;

                    return (
                      <div
                        key={wh.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-sm font-extrabold text-slate-900">
                              🏢 {wh.name}
                            </span>
                            {isDefault && (
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                คลังหลัก
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            จำนวนรายการสินค้าที่มีสต๊อก: {wh.balances?.length ?? 0} รายการ
                          </p>

                          <div className="mt-3 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-700">
                            <span className="font-semibold text-slate-900">สต๊อกรวมในคลังนี้:</span>{" "}
                            <span className="font-bold text-site-primary text-sm">
                              {totalQty}
                            </span>{" "}
                            ชิ้น
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[11px] text-slate-400 font-mono">
                            ID: {wh.id.slice(-6)}
                          </span>
                          {!isDefault && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void submitDeleteWarehouse(wh.id, wh.name)}
                              className="text-xs font-bold text-rose-600 hover:text-rose-700"
                            >
                              ลบคลัง
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {tab === "transfer" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">ส่งสาขา</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                ตัดจากสต๊อกกลางทันที — สาขาต้องกดยืนยันรับในหน้า Staff
              </p>
              {enabledBranches.length === 0 ? (
                <p className="mt-3 text-sm text-amber-800">
                  ยังไม่มีสาขาที่เปิดสต๊อก — ไปเปิดที่หน้าตั้งค่าสาขา
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {data.warehouses && data.warehouses.length > 1 && (
                    <div>
                      <label className={adminLabelClass}>ส่งจากคลังสต๊อกกลาง</label>
                      <select
                        className={adminSelectClass}
                        value={transferSourceLocationId}
                        onChange={(e) => setTransferSourceLocationId(e.target.value)}
                      >
                        <option value="">-- เลือกคลังสต๊อกกลางต้นทาง --</option>
                        {data.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            🏢 {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

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
                      href={`/admin/branches/${b.id}?tab=stock`}
                      className="text-xs font-semibold text-site-primary hover:underline"
                    >
                      ดูสต๊อกสาขา
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Transfer Audit Report: Sent vs Received Qty */}
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h4 className="text-sm font-bold text-slate-900 mb-1">
                  รายงานการส่งโอนสต๊อกกลาง vs หน้าร้านรับยืนยันจริง
                </h4>
                <p className="text-xs text-slate-500 mb-3">
                  เปรียบเทียบยอดที่สต๊อกกลางส่ง กับยอดที่หน้าร้านรับจริงเพื่อตรวจสอบผลต่างสินค้าขาด/เกิน
                </p>

                {!data.completedTransfers?.length ? (
                  <p className="text-xs text-slate-400 py-3">ยังไม่มีประวัติการส่งโอนที่รับแล้ว</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">วันที่รับ</th>
                          <th className="p-2.5">สาขา</th>
                          <th className="p-2.5">สินค้า</th>
                          <th className="p-2.5 text-center">สต๊อกกลางส่ง</th>
                          <th className="p-2.5 text-center">หน้าร้านรับจริง</th>
                          <th className="p-2.5 text-center">ผลต่าง</th>
                          <th className="p-2.5">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {data.completedTransfers.map((t) => {
                          const sent = t.quantity;
                          const rec = t.receivedQuantity ?? t.quantity;
                          const variance = t.varianceQuantity ?? rec - sent;

                          return (
                            <tr key={t.id} className="hover:bg-slate-50/80">
                              <td className="p-2.5 text-slate-500">
                                {t.receivedAt
                                  ? new Date(t.receivedAt).toLocaleDateString("th-TH")
                                  : "—"}
                              </td>
                              <td className="p-2.5 font-bold text-slate-900">{t.branch.name}</td>
                              <td className="p-2.5 font-medium text-slate-800">
                                {t.product.name}
                              </td>
                              <td className="p-2.5 text-center font-bold text-slate-800">
                                {sent} {t.product.unit}
                              </td>
                              <td className="p-2.5 text-center font-bold text-slate-900">
                                {rec} {t.product.unit}
                              </td>
                              <td className="p-2.5 text-center">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                                    variance === 0
                                      ? "bg-slate-100 text-slate-600"
                                      : variance > 0
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-rose-100 text-rose-700"
                                  }`}
                                >
                                  {variance === 0
                                    ? "ตรงพอดี"
                                    : variance > 0
                                      ? `เกิน +${variance}`
                                      : `ขาด ${variance}`}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-500 italic">
                                {t.varianceNote || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {tab === "copy_menu" && (
            <section className={cardClass}>
              <h3 className="text-base font-extrabold text-slate-900">
                คัดลอกและซิงค์เมนูระหว่างสต๊อกกลางกับสาขา
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                คัดลอกรายการเมนูเพื่อสร้าง SKU สต๊อกกลาง หรือส่งเมนูแม่แบบสต๊อกกลางไปสร้างเปิดขายในสาขาพร้อมผูกสต๊อกให้อัตโนมัติ
              </p>

              <div className="mt-5 space-y-4 max-w-xl">
                <div>
                  <label className={adminLabelClass}>เลือกรูปแบบการคัดลอก</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setCopyAction("copy_from_brand_to_branch")}
                      className={`p-3 rounded-xl border text-left transition ${
                        copyAction === "copy_from_brand_to_branch"
                          ? "border-orange-500 bg-orange-50/50 ring-1 ring-orange-500"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <span className="block text-xs font-extrabold text-slate-900">
                        🏢 สต๊อกกลาง ➔ 🏪 สาขา
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        คัดลอก SKU สต๊อกกลาง ไปเปิดเป็นเมนูขายประจำสาขา
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCopyAction("copy_from_branch_to_brand")}
                      className={`p-3 rounded-xl border text-left transition ${
                        copyAction === "copy_from_branch_to_brand"
                          ? "border-orange-500 bg-orange-50/50 ring-1 ring-orange-500"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <span className="block text-xs font-extrabold text-slate-900">
                        🏪 สาขา ➔ 🏢 สต๊อกกลาง
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        ดึงรายการเมนูขายจากสาขา มาสร้างเป็น SKU ในสต๊อกกลาง
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className={adminLabelClass}>สาขาเป้าหมาย / สาขาต้นทาง</label>
                  <select
                    className={adminSelectClass}
                    value={copyBranchId}
                    onChange={(e) => setCopyBranchId(e.target.value)}
                  >
                    <option value="">-- เลือกสาขา --</option>
                    {data.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code || "ไม่มีรหัส"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={busy || !copyBranchId}
                    onClick={() => void executeCopyMenu()}
                    className={btnPrimary}
                  >
                    {busy ? "กำลังดำเนินการ..." : "ยืนยันการคัดลอกและผูกสต๊อก"}
                  </button>
                </div>
              </div>
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

          {tab === "suppliers" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">ผู้ขาย/ซัพพลายเออร์</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={adminLabelClass}>ชื่อผู้ขาย</label>
                  <input
                    className={adminInputClass}
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>โทร</label>
                  <input
                    className={adminInputClass}
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={busy}
                    className={btnPrimary}
                    onClick={() => void createSupplier()}
                  >
                    เพิ่มผู้ขาย
                  </button>
                </div>
              </div>
              <ul className="mt-4 divide-y divide-slate-100">
                {suppliers.map((s) => (
                  <li key={s.id} className="py-2 text-sm">
                    <span className="font-medium text-slate-900">{s.name}</span>
                    {s.phone ? (
                      <span className="ml-2 text-xs text-slate-500">
                        {s.phone}
                      </span>
                    ) : null}
                  </li>
                ))}
                {suppliers.length === 0 && (
                  <li className="py-3 text-sm text-slate-500">ยังไม่มีผู้ขาย</li>
                )}
              </ul>
            </section>
          )}

          {tab === "po" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">
                ใบสั่งซื้อ (PO)
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={adminLabelClass}>ผู้ขาย</label>
                  <select
                    className={adminSelectClass}
                    value={poSupplierId}
                    onChange={(e) => setPoSupplierId(e.target.value)}
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={adminLabelClass}>สินค้า</label>
                  <select
                    className={adminSelectClass}
                    value={poProductId}
                    onChange={(e) => setPoProductId(e.target.value)}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={adminLabelClass}>จำนวนสั่ง</label>
                  <input
                    className={adminInputClass}
                    type="number"
                    min={1}
                    value={poQty}
                    onChange={(e) => setPoQty(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>ต้นทุน/หน่วย</label>
                  <input
                    className={adminInputClass}
                    type="number"
                    min={0}
                    step="0.01"
                    value={poUnitCost}
                    onChange={(e) => setPoUnitCost(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={busy || !suppliers.length}
                className={`${btnPrimary} mt-3`}
                onClick={() => void createPo()}
              >
                สร้าง PO (ร่าง)
              </button>

              <ul className="mt-5 space-y-3">
                {pos.map((po) => (
                  <li
                    key={po.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {po.orderNumber} · {po.supplier.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {PO_STATUS[po.status] ?? po.status}
                          {" · "}
                          {new Date(po.createdAt).toLocaleString("th-TH")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {po.status === "DRAFT" && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              className={btnOutline}
                              onClick={() => void patchPo(po.id, "order")}
                            >
                              สั่งซื้อ
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className="text-xs font-medium text-red-600"
                              onClick={() => void patchPo(po.id, "cancel")}
                            >
                              ยกเลิก
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-slate-700">
                      {po.lines.map((line) => {
                        const remain =
                          line.quantityOrdered - line.quantityReceived;
                        const key = `${po.id}:${line.brandProductId}`;
                        return (
                          <li
                            key={line.id}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <span>
                              {line.product.name}: สั่ง {line.quantityOrdered} /
                              รับแล้ว {line.quantityReceived}
                              {remain > 0 ? ` (ค้าง ${remain})` : ""}
                            </span>
                            {(po.status === "ORDERED" ||
                              po.status === "PARTIAL" ||
                              po.status === "DRAFT") &&
                              remain > 0 && (
                                <>
                                  <input
                                    className={`${adminInputClass} !w-20 !py-1`}
                                    type="number"
                                    min={1}
                                    max={remain}
                                    placeholder="รับ"
                                    value={receiveQtyMap[key] ?? String(remain)}
                                    onChange={(e) =>
                                      setReceiveQtyMap((m) => ({
                                        ...m,
                                        [key]: e.target.value,
                                      }))
                                    }
                                  />
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white"
                                    onClick={() => {
                                      const q = Number(
                                        receiveQtyMap[key] ?? remain,
                                      );
                                      if (!Number.isFinite(q) || q <= 0) {
                                        toast.error("จำนวนรับไม่ถูกต้อง");
                                        return;
                                      }
                                      void patchPo(po.id, "receive", [
                                        {
                                          brandProductId: line.brandProductId,
                                          quantity: Math.min(q, remain),
                                        },
                                      ]);
                                    }}
                                  >
                                    รับเข้า
                                  </button>
                                </>
                              )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
                {pos.length === 0 && (
                  <li className="text-sm text-slate-500">ยังไม่มี PO</li>
                )}
              </ul>
            </section>
          )}

          {tab === "branch_transfer" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">
                โอนระหว่างสาขา
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                ตัดสต๊อกสาขาต้นทางทันที — สาขาปลายทางต้องกดยืนยันรับในแอปพนักงาน
              </p>
              {data.branches.filter((b) => b.stockEnabled).length < 2 ? (
                <p className="mt-3 text-sm text-amber-700">
                  ต้องมีอย่างน้อย 2 สาขาที่เปิดสต๊อก
                </p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={adminLabelClass}>จากสาขา</label>
                    <select
                      className={adminSelectClass}
                      value={btSource}
                      onChange={(e) => setBtSource(e.target.value)}
                    >
                      {data.branches.filter((b) => b.stockEnabled).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={adminLabelClass}>ไปสาขา</label>
                    <select
                      className={adminSelectClass}
                      value={btDest}
                      onChange={(e) => setBtDest(e.target.value)}
                    >
                      {data.branches.filter((b) => b.stockEnabled).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={adminLabelClass}>สินค้า</label>
                    <select
                      className={adminSelectClass}
                      value={btProductId}
                      onChange={(e) => setBtProductId(e.target.value)}
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
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
                      value={btQty}
                      onChange={(e) => setBtQty(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={adminLabelClass}>หมายเหตุ</label>
                    <input
                      className={adminInputClass}
                      value={btNote}
                      onChange={(e) => setBtNote(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <button
                type="button"
                disabled={busy || data.branches.filter((b) => b.stockEnabled).length < 2}
                className={`${btnPrimary} mt-3`}
                onClick={() => void submitBranchTransfer()}
              >
                ส่งโอน
              </button>
            </section>
          )}

          {tab === "lots" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">
                ล็อต / วันหมดอายุ (FEFO)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                สินค้าที่เปิด &quot;ติดตามล็อต&quot; จะตัดออกตามวันหมดอายุก่อน
              </p>
              <ul className="mt-3 divide-y divide-slate-100">
                {lots.map((lot) => (
                  <li
                    key={lot.id}
                    className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {lot.product.name} · {lot.lotNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        {lot.location.name}
                        {lot.expiresAt
                          ? ` · หมดอายุ ${new Date(lot.expiresAt).toLocaleDateString("th-TH")}`
                          : " · ไม่ระบุวันหมดอายุ"}
                      </p>
                    </div>
                    <span className="font-mono font-semibold">
                      {lot.quantity} {lot.product.unit}
                    </span>
                  </li>
                ))}
                {lots.length === 0 && (
                  <li className="py-3 text-sm text-slate-500">
                    ยังไม่มีล็อต — รับเข้าพร้อมเลขล็อตที่หน้าสต๊อกหลัก หรือจาก PO
                  </li>
                )}
              </ul>
            </section>
          )}

          {tab === "recipes" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">
                สูตร / BOM
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                เมื่อขายสินค้าแม่ ระบบจะเบิกวัตถุดิบอัตโนมัติ (ISSUE)
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={adminLabelClass}>สินค้าแม่ (ขาย)</label>
                  <select
                    className={adminSelectClass}
                    value={recipeParentId}
                    onChange={(e) => setRecipeParentId(e.target.value)}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={adminLabelClass}>วัตถุดิบ</label>
                  <select
                    className={adminSelectClass}
                    value={recipeComponentId}
                    onChange={(e) => setRecipeComponentId(e.target.value)}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={adminLabelClass}>ปริมาณต่อ 1 หน่วยขาย</label>
                  <input
                    className={adminInputClass}
                    type="number"
                    min={0.0001}
                    step="any"
                    value={recipeQty}
                    onChange={(e) => setRecipeQty(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                className={`${btnPrimary} mt-3`}
                onClick={() => void saveRecipe()}
              >
                บันทึก/เพิ่มบรรทัดสูตร
              </button>
              <ul className="mt-4 space-y-2">
                {recipes
                  .filter((r) => r.recipeLines.length > 0)
                  .map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-slate-100 p-3 text-sm"
                    >
                      <p className="font-semibold text-slate-900">{r.name}</p>
                      <ul className="mt-1 text-xs text-slate-600">
                        {r.recipeLines.map((l) => (
                          <li key={l.id}>
                            {l.component.name} × {String(l.quantityPerUnit)}{" "}
                            {l.component.unit}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {tab === "forecast" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">
                พยากรณ์สั่งซื้อ (14 วันย้อนหลัง)
              </h3>
              <button
                type="button"
                className={`${btnOutline} mt-2`}
                onClick={() => void loadForecast()}
              >
                รีเฟรช
              </button>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">สินค้า</th>
                      <th className="py-2 pr-3">ขายรวม</th>
                      <th className="py-2 pr-3">เฉลี่ย/วัน</th>
                      <th className="py-2 pr-3">คงเหลือ</th>
                      <th className="py-2 pr-3">วันคงคลัง</th>
                      <th className="py-2">แนะนำสั่ง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.map((row) => (
                      <tr key={row.productId} className="border-t border-slate-100">
                        <td className="py-2 pr-3 font-medium text-slate-900">
                          {row.name}
                        </td>
                        <td className="py-2 pr-3">{row.usedLastDays}</td>
                        <td className="py-2 pr-3">
                          {row.avgDaily.toFixed(1)}
                        </td>
                        <td className="py-2 pr-3">{row.onHand}</td>
                        <td className="py-2 pr-3">
                          {row.daysCover == null
                            ? "—"
                            : row.daysCover.toFixed(1)}
                        </td>
                        <td className="py-2 font-semibold text-emerald-700">
                          {row.suggestedOrder}
                        </td>
                      </tr>
                    ))}
                    {forecast.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-4 text-center text-slate-500"
                        >
                          ยังไม่มีข้อมูลขายพอสำหรับพยากรณ์
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === "accounting" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">
                ส่งออกการเคลื่อนไหวสต๊อก (CSV)
              </h3>
              <div className="mt-3 grid max-w-md gap-3 sm:grid-cols-2">
                <div>
                  <label className={adminLabelClass}>จากวันที่</label>
                  <DateInput
                    className={adminInputClass}
                    value={acctFrom}
                    onChange={(v) => setAcctFrom(v)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>ถึงวันที่</label>
                  <DateInput
                    className={adminInputClass}
                    value={acctTo}
                    onChange={(v) => setAcctTo(v)}
                  />
                </div>
              </div>
              <button
                type="button"
                className={`${btnPrimary} mt-3`}
                onClick={downloadAccounting}
              >
                ดาวน์โหลด CSV
              </button>
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
              onPatchAging={(warn, critical) =>
                void patchSettings({
                  stockAgingWarnDays: warn,
                  stockAgingCriticalDays: critical,
                })
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
  onPatchAging,
}: {
  brand: StockPayload["brand"];
  busy: boolean;
  onToggleStock: (enabled: boolean) => void | Promise<void>;
  onPatchAllowNegative: (value: boolean) => void;
  onPatchAging: (warnDays: number, criticalDays: number) => void;
}) {
  const [warnDays, setWarnDays] = useState(
    String(brand.stockAgingWarnDays ?? 3),
  );
  const [criticalDays, setCriticalDays] = useState(
    String(brand.stockAgingCriticalDays ?? 5),
  );

  useEffect(() => {
    setWarnDays(String(brand.stockAgingWarnDays ?? 3));
    setCriticalDays(String(brand.stockAgingCriticalDays ?? 5));
  }, [brand.stockAgingWarnDays, brand.stockAgingCriticalDays]);

  function saveAging() {
    const warn = Number(warnDays);
    const critical = Number(criticalDays);
    if (!Number.isFinite(warn) || warn < 0 || warn > 30) {
      return;
    }
    if (!Number.isFinite(critical) || critical < 0 || critical > 30) {
      return;
    }
    if (critical < warn) return;
    onPatchAging(Math.floor(warn), Math.floor(critical));
  }

  return (
    <section className={cardClass}>
      <h3 className="text-sm font-semibold text-slate-900">ตั้งค่าสต๊อก</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        ควบคุมการเปิดใช้ระบบ ความยืดหยุ่นของยอดติดลบ และเกณฑ์แจ้งเตือนของใกล้เสีย
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

        <div className="rounded-xl border border-orange-100 bg-orange-50/50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">
            แจ้งเตือนของใกล้เสีย (ทุกสาขา)
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            ค่าเริ่มต้น: ค้าง 3–4 วัน = ส้ม · ≥ 5 วัน (หรือใกล้/หมดอายุ) = แดง
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-orange-800">
                ส้ม — ค้างตั้งแต่ (วัน)
              </label>
              <input
                type="number"
                min={0}
                max={30}
                disabled={busy || !brand.stockEnabled}
                value={warnDays}
                onChange={(e) => setWarnDays(e.target.value)}
                className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums text-slate-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-rose-800">
                แดง — ค้างตั้งแต่ (วัน)
              </label>
              <input
                type="number"
                min={0}
                max={30}
                disabled={busy || !brand.stockEnabled}
                value={criticalDays}
                onChange={(e) => setCriticalDays(e.target.value)}
                className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums text-slate-900"
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-500">
            ใกล้หมดอายุ ≤ 1 วัน หรือหมดอายุแล้ว → แดงเสมอ · อายุเก็บต่อเมนูตั้งที่หน้าแก้ไขเมนูสาขา
          </p>
          <button
            type="button"
            disabled={
              busy ||
              !brand.stockEnabled ||
              Number(criticalDays) < Number(warnDays)
            }
            onClick={saveAging}
            className={`${btnPrimary} mt-3`}
          >
            บันทึกเกณฑ์แจ้งเตือน
          </button>
        </div>
      </div>
    </section>
  );
}
