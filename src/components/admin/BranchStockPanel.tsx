"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AdminEmptyState,
  AdminLoadingState,
  adminInputClass,
} from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { compareThaiText } from "@/lib/thai-sort";
import {
  assignStableMenuSequence,
  sortStaffMenuItems,
} from "@/lib/staff-menu-order";
import { formatPrice } from "@/lib/constants";
import { IconEdit, IconSkewerPlaceholder, IconTrash } from "@/components/icons";
import { ImageField } from "@/components/admin/ImageField";
import { BranchStockCountsView } from "@/components/admin/BranchStockCountsView";
import { BranchStockMovementsView } from "@/components/admin/BranchStockMovementsView";
import { BranchStockUsageView } from "@/components/admin/BranchStockUsageView";
import { BranchParStockPanel } from "@/components/admin/BranchParStockPanel";
import { BranchTomorrowPlanPanel } from "@/components/admin/BranchTomorrowPlanPanel";
import { BranchTomorrowPlanRecordsPanel } from "@/components/admin/BranchTomorrowPlanRecordsPanel";
import { MenuItemCodeBadge } from "@/components/MenuItemCodeDisplay";
import {
  STOCK_OUTBOUND_PURPOSE_LABEL,
  type StockOutboundPurpose,
} from "@/lib/stock-outbound";

type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

type Product = {
  id: string;
  name: string;
  productCode?: string | null;
  unit: string;
  stockType: StockType;
  category?: string | null;
  sortOrder?: number;
  categorySortOrder?: number;
  lowStockAlert?: number | null;
  trackStock?: boolean;
  imageUrl?: string | null;
  price?: number;
  description?: string | null;
  isMenu?: boolean;
  showOnKeyOrder?: boolean;
  keyOrderSortOrder?: number;
};

type Balance = {
  id: string;
  quantity: number;
  product: Product;
};

type StockPayload = {
  stockActive: boolean;
  locationId: string | null;
  balances: Balance[];
  products: Product[];
};

export function BranchStockPanel({ branchId }: { branchId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const typeParam = searchParams.get("type");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const dateParam = searchParams.get("date");
  const countIdParam = searchParams.get("countId")?.trim() || null;
  const toast = useToast();
  const { confirm } = useConfirm();

  const [data, setData] = useState<StockPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<
    "menu" | "select_issue_purpose" | "select_type" | "items"
  >("menu");
  const [actionType, setActionType] = useState<
    "stock_in" | "issue" | "adjust" | null
  >(null);
  const [issuePurpose, setIssuePurpose] = useState<StockOutboundPurpose | null>(
    null,
  );

  const [typeFilter, setTypeFilter] = useState<"ALL" | StockType>("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [manageQ, setManageQ] = useState("");
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({});
  const [movementNote, setMovementNote] = useState("");

  const [activeTab, setActiveTab] = useState<
    | "manage"
    | "par-stock"
    | "tomorrow"
    | "tomorrow-plans"
    | "counts"
    | "movements"
    | "usage"
  >(
    viewParam === "movements"
      ? "movements"
      : viewParam === "recommend" || viewParam === "par-stock"
        ? "par-stock"
        : viewParam === "tomorrow"
          ? "tomorrow"
          : viewParam === "tomorrow-plans"
            ? "tomorrow-plans"
            : "manage",
  );
  const [pendingCountBadge, setPendingCountBadge] = useState(0);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const pendingTabSwitched = useRef(false);

  useEffect(() => {
    if (viewParam === "movements") setActiveTab("movements");
    if (viewParam === "recommend" || viewParam === "par-stock")
      setActiveTab("par-stock");
    if (viewParam === "tomorrow") setActiveTab("tomorrow");
    if (viewParam === "tomorrow-plans") setActiveTab("tomorrow-plans");
    if (viewParam === "counts") setActiveTab("counts");
  }, [viewParam]);

  useEffect(() => {
    if (viewParam) return;
    if (pendingTabSwitched.current) return;
    if (pendingCountBadge <= 0) return;
    pendingTabSwitched.current = true;
    setActiveTab("counts");
  }, [pendingCountBadge, viewParam]);

  // Dropdown for "สร้างรายการใหม่"
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);

  // Modal state for non-menu items (create or edit)
  const [showCreateModal, setShowCreateModal] = useState<"CONSUMABLE" | "EQUIPMENT" | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newItemData, setNewItemData] = useState({
    name: "",
    description: "",
    unit: "ชิ้น",
    price: "",
    imageUrl: "",
    showOnKeyOrder: false,
    keyOrderSortOrder: "0",
  });

  function closeItemModal() {
    setShowCreateModal(null);
    setEditingItemId(null);
    setNewItemData({
      name: "",
      description: "",
      unit: "ชิ้น",
      price: "",
      imageUrl: "",
      showOnKeyOrder: false,
      keyOrderSortOrder: "0",
    });
  }

  function openCreateItem(type: "CONSUMABLE" | "EQUIPMENT") {
    setEditingItemId(null);
    setNewItemData({
      name: "",
      description: "",
      unit: "ชิ้น",
      price: "",
      imageUrl: "",
      showOnKeyOrder: false,
      keyOrderSortOrder: "0",
    });
    setShowCreateModal(type);
    setShowCreateDropdown(false);
  }

  function openEditNonMenu(item: Product) {
    if (item.stockType !== "CONSUMABLE" && item.stockType !== "EQUIPMENT") return;
    setEditingItemId(item.id);
    setNewItemData({
      name: item.name,
      description: item.description ?? "",
      unit: item.unit || "ชิ้น",
      price:
        item.price != null && Number.isFinite(item.price)
          ? String(item.price)
          : "",
      imageUrl: item.imageUrl ?? "",
      showOnKeyOrder: Boolean(item.showOnKeyOrder),
      keyOrderSortOrder: String(item.keyOrderSortOrder ?? 0),
    });
    setShowCreateModal(item.stockType);
  }

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/stock`);
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (res.ok) {
        const json = (await res.json()) as StockPayload;
        setData(json);
        setInventoryRefreshKey((k) => k + 1);
      } else {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || "โหลดข้อมูลสต๊อกไม่สำเร็จ");
        setData(null);
      }
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "โหลดข้อมูลสต๊อกไม่สำเร็จ");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [branchId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function loadPendingBadge() {
      try {
        const date = new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Bangkok",
        });
        const res = await fetch(
          `/api/admin/branches/${branchId}/stock/counts?date=${encodeURIComponent(date)}`,
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const pending = (json.counts || []).filter(
          (c: { status?: string }) => c.status === "IN_PROGRESS",
        ).length;
        if (!cancelled) setPendingCountBadge(pending);
      } catch {
        /* ignore badge errors */
      }
    }
    void loadPendingBadge();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const categories = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { id: string; name: string; categorySortOrder: number }
    >();
    for (const item of data.products) {
      if (typeFilter !== "ALL" && item.stockType !== typeFilter) continue;
      const name = item.category || "ไม่มีหมวดหมู่";
      const catId = name;
      if (!map.has(catId)) {
        map.set(catId, {
          id: catId,
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

  const dashboardStats = useMemo(() => {
    if (!data) return null;
    let totalValue = 0;
    let menuValue = 0;
    let consumableValue = 0;
    let equipmentValue = 0;
    
    const lowStockItems = [];
    const itemsByQty = [];
    
    for (const product of data.products) {
      const bal = data.balances.find(b => b.product.id === product.id);
      const qty = bal?.quantity ?? 0;
      const val = qty * (product.price || 0);
      
      totalValue += val;
      if (product.stockType === "SALE_ITEM") menuValue += val;
      else if (product.stockType === "CONSUMABLE") consumableValue += val;
      else if (product.stockType === "EQUIPMENT") equipmentValue += val;
      
      const alertAt =
        product.lowStockAlert == null ? 0 : product.lowStockAlert;
      if (qty <= alertAt) {
        lowStockItems.push(product);
      }
      
      itemsByQty.push({ ...product, quantity: qty });
    }
    
    itemsByQty.sort((a, b) => b.quantity - a.quantity);
    const top5 = itemsByQty.slice(0, 5);
    
    return {
      totalValue,
      menuValue,
      consumableValue,
      equipmentValue,
      lowStockCount: lowStockItems.length,
      top5
    };
  }, [data]);

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
    let list =
      categoryFilter === "ALL"
        ? typedCatalog
        : typedCatalog.filter(
            (item) => (item.category || "ไม่มีหมวดหมู่") === categoryFilter,
          );
    const needle = manageQ.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          (item.unit || "").toLowerCase().includes(needle) ||
          (item.category || "").toLowerCase().includes(needle),
      );
    }
    return list;
  }, [typedCatalog, categoryFilter, manageQ]);

  const selectedItems = useMemo(() => {
    const changes: { id: string; name: string; quantity: number }[] = [];
    if (!data) return changes;
    for (const prod of data.products) {
      if (!(prod.id in qtyByItemId)) continue;
      const q = qtyByItemId[prod.id];
      if (actionType === "adjust") {
        if (q === undefined || (q as unknown) === "") continue;
        const n = Math.max(0, Math.floor(Number(q)));
        if (!Number.isFinite(n)) continue;
        changes.push({ id: prod.id, name: prod.name, quantity: n });
        continue;
      }
      if (q > 0) {
        changes.push({ id: prod.id, name: prod.name, quantity: q });
      }
    }
    return changes;
  }, [data, qtyByItemId, actionType]);

  const selectedTotalQty = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.quantity, 0),
    [selectedItems],
  );

  function setQty(itemId: string, next: number) {
    setQtyByItemId((prev) => {
      const q = Math.max(0, Math.floor(next));
      if (actionType !== "adjust" && q === 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: q };
    });
  }

  const handleActionClick = (action: "stock_in" | "issue" | "adjust") => {
    setActionType(action);
    setQtyByItemId({});
    setCategoryFilter("ALL");
    setMovementNote("");
    setIssuePurpose(null);
    if (action === "issue") {
      setMode("select_issue_purpose");
      return;
    }
    setMode("select_type");
  };
  
  const handleTypeSelectClick = (type: StockType) => {
    setTypeFilter(type);
    setCategoryFilter("ALL");
    if (actionType === "adjust" && data) {
      const seeded: Record<string, number> = {};
      for (const p of data.products) {
        if (p.stockType !== type) continue;
        const bal =
          data.balances.find((b) => b.product.id === p.id)?.quantity ?? 0;
        seeded[p.id] = bal;
      }
      setQtyByItemId(seeded);
    } else {
      setQtyByItemId({});
    }
    setMode("items");
  };

  const handleBack = () => {
    if (mode === "items") {
      setMode("select_type");
    } else if (mode === "select_type" && actionType === "issue") {
      setMode("select_issue_purpose");
    } else {
      setMode("menu");
      setActionType(null);
      setIssuePurpose(null);
      setQtyByItemId({});
    }
  };

  async function submitChanges() {
    if (selectedItems.length === 0 || !actionType) return;
    if (actionType === "issue" && !issuePurpose) {
      toast.error("กรุณาเลือกประเภทการจ่ายออก");
      return;
    }
    if (
      (actionType === "issue" || actionType === "adjust") &&
      !movementNote.trim()
    ) {
      toast.error(
        actionType === "issue"
          ? "กรุณาระบุรายละเอียดการจ่ายออก"
          : "กรุณาระบุเหตุผลการปรับยอด",
      );
      return;
    }
    setBusy(true);
    try {
      const postAction =
        actionType === "issue" && issuePurpose
          ? STOCK_OUTBOUND_PURPOSE_LABEL[issuePurpose].apiAction
          : actionType;
      const batchId =
        actionType === "stock_in" || actionType === "issue"
          ? `adm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
          : undefined;
      const defaultNote =
        actionType === "stock_in"
          ? "รับเข้าผ่านระบบ Admin"
          : actionType === "issue"
            ? issuePurpose === "waste"
              ? "ของเสียผ่านระบบ Admin"
              : "จ่ายออกจากสต๊อกผ่านระบบ Admin"
            : "ปรับยอดผ่านระบบ Admin";
      const note = movementNote.trim() || defaultNote;

      let hasError = false;
      let lastError = "";
      for (const item of selectedItems) {
        const res = await fetch(`/api/admin/branches/${branchId}/stock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: postAction,
            brandProductId: item.id,
            quantity: item.quantity,
            note,
            ...(batchId ? { batchId } : {}),
          }),
        });
        if (!res.ok) {
          hasError = true;
          const body = await res.json().catch(() => ({}));
          lastError = body.error || lastError;
        }
      }

      if (hasError) {
        toast.error(
          "บันทึกบางรายการไม่สำเร็จ",
          lastError || "กรุณาตรวจสอบยอดอีกครั้ง",
        );
      } else {
        toast.success(
          actionType === "stock_in"
            ? "รับเข้าสำเร็จ"
            : actionType === "issue"
              ? issuePurpose === "waste"
                ? "บันทึกของเสียสำเร็จ"
                : "จ่ายออกจากสต๊อกสำเร็จ"
              : "ปรับยอดสำเร็จ",
          `อัปเดต ${selectedItems.length} รายการ`,
        );
        setMode("menu");
        setActionType(null);
        setIssuePurpose(null);
        setQtyByItemId({});
        setMovementNote("");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNonMenu(e: React.FormEvent) {
    e.preventDefault();
    if (!showCreateModal) return;
    setBusy(true);
    try {
      const isEdit = Boolean(editingItemId);
      const res = await fetch(
        isEdit
          ? `/api/admin/branches/${branchId}/stock/items/${editingItemId}`
          : `/api/admin/branches/${branchId}/stock/items`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...newItemData,
            stockType: showCreateModal,
            showOnKeyOrder:
              showCreateModal === "CONSUMABLE"
                ? Boolean(newItemData.showOnKeyOrder)
                : false,
            keyOrderSortOrder:
              showCreateModal === "CONSUMABLE"
                ? Number(newItemData.keyOrderSortOrder) || 0
                : 0,
          }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error("บันทึกไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }

      toast.success(isEdit ? "แก้ไขรายการเรียบร้อยแล้ว" : "สร้างรายการเรียบร้อยแล้ว");
      closeItemModal();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteMenuItem(item: Product) {
    const ok = await confirm({
      title: "ลบเมนู?",
      message: `ลบเมนู “${item.name}” ออกจากสาขา ไม่สามารถกู้คืนได้`,
      confirmLabel: "ลบเมนู",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/menu-items/${item.id}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ลบไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("ลบเมนูแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteNonMenuItem(item: Product) {
    const typeLabel =
      item.stockType === "CONSUMABLE" ? "ของสิ้นเปลือง" : "อุปกรณ์";
    const ok = await confirm({
      title: `ลบ${typeLabel}?`,
      message: `ลบ “${item.name}” ออกจากสต๊อกสาขา ไม่สามารถกู้คืนได้`,
      confirmLabel: "ลบรายการ",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/items/${item.id}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ลบไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("ลบรายการแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <AdminLoadingState className="py-8" />;
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-600">
          {loadError || "โหลดข้อมูลสต๊อกไม่สำเร็จ"}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="mt-4 rounded-xl bg-site-primary px-4 py-2 text-sm font-bold text-white"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max border-b border-slate-200">
          {(
            [
              { id: "counts" as const, label: "สรุปยอด / Convert" },
              { id: "manage" as const, label: "จัดการสต๊อก" },
              { id: "par-stock" as const, label: "แนะนำ Par Stock" },
              { id: "tomorrow-plans" as const, label: "แผนผลิต-เติม" },
              { id: "movements" as const, label: "ประวัติเคลื่อนไหว" },
              { id: "usage" as const, label: "การใช้ / ต้นทุน" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "par-stock" || tab.id === "tomorrow-plans") {
                  setInventoryRefreshKey((k) => k + 1);
                }
              }}
              className={`relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-bold border-b-2 transition-colors sm:px-5 ${
                (
                  tab.id === "tomorrow-plans"
                    ? activeTab === "tomorrow" || activeTab === "tomorrow-plans"
                    : activeTab === tab.id
                )
                  ? "border-site-primary text-site-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
              {tab.id === "counts" && pendingCountBadge > 0 ? (
                <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white">
                  {pendingCountBadge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "counts" ? (
        <BranchStockCountsView
          branchId={branchId}
          onPendingChange={setPendingCountBadge}
          initialCountId={countIdParam}
        />
      ) : activeTab === "par-stock" ? (
        <BranchParStockPanel
          branchId={branchId}
          refreshKey={inventoryRefreshKey}
          onInventoryMutated={() => setInventoryRefreshKey((k) => k + 1)}
        />
      ) : activeTab === "tomorrow" ? (
        <BranchTomorrowPlanPanel
          branchId={branchId}
          refreshKey={inventoryRefreshKey}
          onInventoryMutated={() => setInventoryRefreshKey((k) => k + 1)}
          onBackToList={() => {
            setActiveTab("tomorrow-plans");
            setInventoryRefreshKey((k) => k + 1);
          }}
        />
      ) : activeTab === "tomorrow-plans" ? (
        <BranchTomorrowPlanRecordsPanel
          branchId={branchId}
          refreshKey={inventoryRefreshKey}
          onCreatePlan={() => {
            setActiveTab("tomorrow");
            setInventoryRefreshKey((k) => k + 1);
          }}
        />
      ) : activeTab === "movements" ? (
        <BranchStockMovementsView
          branchId={branchId}
          initialType={typeParam ?? undefined}
          initialDate={dateParam}
          initialFrom={fromParam}
          initialTo={toParam}
        />
      ) : activeTab === "usage" ? (
        <BranchStockUsageView branchId={branchId} />
      ) : (
        <>
          {pendingCountBadge > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">
                มีเอกสารยอดนับรอ Convert {pendingCountBadge} รายการวันนี้
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("counts")}
                className="rounded-xl bg-amber-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-amber-500"
              >
                ไปสรุปยอด / Convert
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">จัดการสต๊อกสาขา</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                รับเข้า · จ่ายออก · ปรับยอด · สร้าง/แก้ไขของสิ้นเปลืองและอุปกรณ์ · ดูยอดคงเหลือ
              </p>
            </div>
        
        <div className="relative">
          <button
            onClick={() => setShowCreateDropdown(!showCreateDropdown)}
            className="flex h-9 items-center justify-center rounded-lg bg-site-primary px-4 text-sm font-semibold text-white transition hover:bg-site-primary-focus"
          >
            สร้างรายการใหม่ ▾
          </button>
          {showCreateDropdown && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white shadow-lg border border-slate-100 py-1 z-50">
              <Link
                href={`/admin/branches/${branchId}/menu/new`}
                className="block px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-site-primary"
              >
                🍜 เมนูขาย
              </Link>
              <button
                onClick={() => openCreateItem("CONSUMABLE")}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-site-primary"
              >
                📦 ของสิ้นเปลือง
              </button>
              <button
                onClick={() => openCreateItem("EQUIPMENT")}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-site-primary"
              >
                🛠️ อุปกรณ์
              </button>
            </div>
          )}
        </div>
      </div>

      {data.products.length === 0 ? (
        <AdminEmptyState
          title="ไม่มีรายการในสต๊อก"
          description="สาขานี้ยังไม่มีรายการเมนู ของใช้ หรืออุปกรณ์"
        />
      ) : (
        <div className="w-full">
          {mode === "menu" ? (
            <div className="space-y-6">
              {/* Dashboard Section */}
              {dashboardStats && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-500">แจ้งเตือนของใกล้หมด</h3>
                        <p className="mt-1 text-2xl font-black text-red-600">{dashboardStats.lowStockCount} รายการ</p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl">⚠️</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-500">มูลค่าสต๊อกคงเหลือรวม</h3>
                        <p className="mt-1 text-2xl font-black text-slate-900">฿{dashboardStats.totalValue.toLocaleString()}</p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl">💰</div>
                    </div>
                  </div>
                  
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-slate-900 mb-4">สัดส่วนมูลค่าตามประเภท</h3>
                      {dashboardStats.totalValue > 0 ? (
                        <div className="flex items-center gap-6">
                          <div
                            className="h-24 w-24 shrink-0 rounded-full"
                            style={{
                              background: `conic-gradient(
                                #f59e0b 0% ${(dashboardStats.menuValue / dashboardStats.totalValue) * 100}%, 
                                #3b82f6 ${(dashboardStats.menuValue / dashboardStats.totalValue) * 100}% ${((dashboardStats.menuValue + dashboardStats.consumableValue) / dashboardStats.totalValue) * 100}%, 
                                #8b5cf6 ${((dashboardStats.menuValue + dashboardStats.consumableValue) / dashboardStats.totalValue) * 100}% 100%
                              )`
                            }}
                          ></div>
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[#f59e0b]"></div>เมนูขาย</div>
                              <span className="font-semibold text-slate-700">฿{dashboardStats.menuValue.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[#3b82f6]"></div>สิ้นเปลือง</div>
                              <span className="font-semibold text-slate-700">฿{dashboardStats.consumableValue.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[#8b5cf6]"></div>อุปกรณ์</div>
                              <span className="font-semibold text-slate-700">฿{dashboardStats.equipmentValue.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-24 items-center justify-center text-sm text-slate-400">ไม่มีข้อมูลมูลค่าสต๊อก</div>
                      )}
                    </div>
                    
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-slate-900 mb-4">Top 5 รายการคงเหลือเยอะสุด</h3>
                      {dashboardStats.top5.length > 0 ? (
                        <div className="space-y-3">
                          {dashboardStats.top5.map((item, idx) => {
                            const maxQty = dashboardStats.top5[0].quantity || 1;
                            const pct = Math.max(5, (item.quantity / maxQty) * 100);
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="truncate pr-2 font-medium text-slate-700">{item.name}</span>
                                  <span className="font-bold text-slate-900">{item.quantity}</span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }}></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex h-24 items-center justify-center text-sm text-slate-400">ไม่มีรายการในสต๊อก</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <button
                  onClick={() => handleActionClick("stock_in")}
                  className="w-full flex items-center justify-between rounded-2xl bg-emerald-600 p-6 text-white shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <div className="text-left">
                    <h3 className="text-xl font-black">รับเข้า</h3>
                    <p className="mt-1 text-emerald-100 text-xs">เพิ่มจำนวนสต๊อก</p>
                  </div>
                  <div className="text-3xl">📦</div>
                </button>

                <button
                  onClick={() => handleActionClick("issue")}
                  className="w-full flex items-center justify-between rounded-2xl bg-amber-500 p-6 text-white shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <div className="text-left">
                    <h3 className="text-xl font-black">จ่ายออก</h3>
                    <p className="mt-1 text-amber-100 text-xs">
                      ของเสีย หรือ จ่ายออกจากสต๊อก
                    </p>
                  </div>
                  <div className="text-3xl">📤</div>
                </button>

                <button
                  onClick={() => handleActionClick("adjust")}
                  className="w-full flex items-center justify-between rounded-2xl bg-sky-600 p-6 text-white shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <div className="text-left">
                    <h3 className="text-xl font-black">ปรับยอด</h3>
                    <p className="mt-1 text-sky-100 text-xs">ตั้งยอดคงเหลือตามที่นับได้</p>
                  </div>
                  <div className="text-3xl">🔢</div>
                </button>
              </div>

              {/* Table View of Balances */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <h3 className="font-bold text-slate-800">ยอดคงเหลือปัจจุบัน</h3>
                    <div className="w-full max-w-xs">
                      <input
                        type="search"
                        value={manageQ}
                        onChange={(e) => setManageQ(e.target.value)}
                        placeholder="ค้นหาชื่อ / หน่วย…"
                        className={adminInputClass}
                      />
                    </div>
                  </div>

                  {/* Type Filter */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { id: "ALL", label: "ทั้งหมด" },
                      { id: "SALE_ITEM", label: "เมนูขาย" },
                      { id: "CONSUMABLE", label: "ของสิ้นเปลือง" },
                      { id: "EQUIPMENT", label: "อุปกรณ์" },
                    ].map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => {
                          setTypeFilter(type.id as any);
                          setCategoryFilter("ALL");
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          typeFilter === type.id
                            ? "bg-site-primary text-white"
                            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>

                  {/* Category Filter */}
                  {categories.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-2 pt-2 border-t border-slate-200 border-dashed">
                      <button
                        type="button"
                        onClick={() => setCategoryFilter("ALL")}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                          categoryFilter === "ALL"
                            ? "bg-slate-800 text-white"
                            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        ทุกหมวดหมู่
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategoryFilter(cat.id)}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                            categoryFilter === cat.id
                              ? "bg-slate-800 text-white"
                              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold w-12">#</th>
                        <th className="px-4 py-3 font-semibold w-16">รหัส</th>
                        <th className="px-4 py-3 font-semibold">รายการ</th>
                        <th className="px-4 py-3 font-semibold">หมวดหมู่</th>
                        <th className="px-4 py-3 font-semibold text-right">ราคา/หน่วย</th>
                        <th className="px-4 py-3 font-semibold text-right">ยอดคงเหลือ</th>
                        <th className="px-4 py-3 font-semibold text-right w-28">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleItems.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-10 text-center text-sm text-slate-500"
                          >
                            {manageQ.trim()
                              ? `ไม่พบรายการที่ตรงกับ “${manageQ.trim()}”`
                              : "ไม่มีรายการในประเภทนี้"}
                          </td>
                        </tr>
                      ) : null}
                      {visibleItems.map((item) => {
                        const dbBalance = data.balances.find((b) => b.product.id === item.id)?.quantity ?? 0;
                        const seq = seqById.get(item.id) ?? 0;
                        const isMenu = item.stockType === "SALE_ITEM" || item.isMenu;
                        const alertAt =
                          item.lowStockAlert == null ? 0 : item.lowStockAlert;
                        const unitPrice = Number(item.price ?? 0);
                        return (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-sm font-bold tabular-nums text-slate-400 align-top">
                              {seq || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm align-top">
                              {item.productCode ? (
                                <MenuItemCodeBadge code={item.productCode} />
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                                  {item.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-slate-400">
                                      <IconSkewerPlaceholder size={20} />
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div className="font-semibold text-slate-900">{item.name}</div>
                                  <div className="text-xs text-slate-500">
                                    {item.stockType === "SALE_ITEM" ? "เมนูขาย" : item.stockType === "CONSUMABLE" ? "ของสิ้นเปลือง" : "อุปกรณ์"}
                                    {" · "}
                                    หน่วย {item.unit}
                                    {item.stockType === "CONSUMABLE" &&
                                    item.showOnKeyOrder ? (
                                      <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                                        คีย์ออเดอร์
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                                {item.category || "-"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-slate-600">
                              {unitPrice > 0 ? (
                                <>฿{formatPrice(unitPrice)}</>
                              ) : (
                                <span className="font-medium text-amber-600">
                                  ยังไม่ตั้งราคา
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-bold ${
                                dbBalance <= alertAt
                                  ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10"
                                  : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10"
                              }`}>
                                {dbBalance} {item.unit}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                {isMenu ? (
                                  <Link
                                    href={`/admin/branches/${branchId}/menu/${item.id}`}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                                    aria-label={`แก้ไข ${item.name}`}
                                    title="แก้ไข"
                                  >
                                    <IconEdit size={16} />
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openEditNonMenu(item)}
                                    disabled={busy}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                                    aria-label={`แก้ไข ${item.name}`}
                                    title="แก้ไข"
                                  >
                                    <IconEdit size={16} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    void (isMenu
                                      ? deleteMenuItem(item)
                                      : deleteNonMenuItem(item))
                                  }
                                  disabled={busy}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 shadow-sm transition hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
                                  aria-label={`ลบ ${item.name}`}
                                  title="ลบ"
                                >
                                  <IconTrash size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : mode === "select_issue_purpose" ? (
            <div className="space-y-6">
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex h-10 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                >
                  ← กลับ
                </button>
                <h2 className="text-xl font-black text-slate-900">
                  ประเภทการจ่ายออก
                </h2>
              </div>
              <p className="text-sm font-medium text-slate-600">
                ของเสียจะไปกลุ่มของเสีย · จ่ายออกจากสต๊อกจะนับเป็นการจ่ายออก
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
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
                        setMode("select_type");
                      }}
                      className={`rounded-2xl border-2 p-6 text-left shadow-sm transition active:scale-[0.98] ${
                        id === "waste"
                          ? "border-orange-200 bg-orange-50 hover:border-orange-400"
                          : "border-amber-200 bg-amber-50 hover:border-amber-400"
                      }`}
                    >
                      <h3 className="text-lg font-black text-slate-900">
                        {meta.title}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        {meta.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : mode === "select_type" ? (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-6">
                <button 
                  onClick={handleBack}
                  className="flex h-10 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                >
                  ← กลับ
                </button>
                <h2 className="text-xl font-black text-slate-900">
                  {actionType === "stock_in"
                    ? "เลือกประเภทเพื่อรับเข้า"
                    : actionType === "issue"
                      ? issuePurpose
                        ? `เลือกประเภท · ${STOCK_OUTBOUND_PURPOSE_LABEL[issuePurpose].title}`
                        : "เลือกประเภทเพื่อจ่ายออก"
                      : actionType === "adjust"
                        ? "เลือกประเภทเพื่อปรับยอด"
                        : ""}
                </h2>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-3">
                <button
                  onClick={() => handleTypeSelectClick("SALE_ITEM")}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-6 text-slate-700 shadow-sm hover:border-site-primary hover:text-site-primary transition-all active:scale-[0.98]"
                >
                  <div className="text-3xl">🍜</div>
                  <h3 className="text-lg font-bold">เมนูขาย</h3>
                </button>
                <button
                  onClick={() => handleTypeSelectClick("CONSUMABLE")}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-6 text-slate-700 shadow-sm hover:border-site-primary hover:text-site-primary transition-all active:scale-[0.98]"
                >
                  <div className="text-3xl">📦</div>
                  <h3 className="text-lg font-bold">ของสิ้นเปลือง</h3>
                </button>
                <button
                  onClick={() => handleTypeSelectClick("EQUIPMENT")}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-6 text-slate-700 shadow-sm hover:border-site-primary hover:text-site-primary transition-all active:scale-[0.98]"
                >
                  <div className="text-3xl">🛠️</div>
                  <h3 className="text-lg font-bold">อุปกรณ์</h3>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <button 
                  onClick={handleBack}
                  className="flex h-10 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                >
                  ← กลับ
                </button>
                <h2 className="text-lg font-bold text-slate-900">
                  {actionType === "stock_in"
                    ? "รับเข้าสต๊อก"
                    : actionType === "issue"
                      ? "จ่ายออกสต๊อก"
                      : actionType === "adjust"
                        ? "ปรับยอดสต๊อก (ตั้งยอดตามที่นับได้)"
                        : ""}
                </h2>
              </div>

              <div className="mb-4">
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  หมายเหตุ
                  {actionType === "issue" || actionType === "adjust" ? (
                    <span className="text-red-500"> *</span>
                  ) : (
                    <span className="font-medium text-slate-400"> (ถ้ามี)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={movementNote}
                  onChange={(e) => setMovementNote(e.target.value)}
                  className={adminInputClass}
                  placeholder={
                    actionType === "adjust"
                      ? "เช่น นับยอดจริงท้ายวัน / แก้ยอดผิด"
                      : actionType === "issue"
                        ? "เช่น เปลี่ยนแก๊ส 1 ถัง / เบิกใช้หน้าร้าน"
                        : "เช่น ของส่งจากคลัง / ซื้อเพิ่ม"
                  }
                />
              </div>

              {/* Type Filter */}
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  { id: "ALL", label: "ทั้งหมด" },
                  { id: "SALE_ITEM", label: "เมนูขาย" },
                  { id: "CONSUMABLE", label: "ของสิ้นเปลือง" },
                  { id: "EQUIPMENT", label: "อุปกรณ์" },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      setTypeFilter(type.id as any);
                      setCategoryFilter("ALL");
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      typeFilter === type.id
                        ? "bg-site-primary text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              {/* Category Filter */}
              {categories.length > 1 && (
                <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-100 pb-4">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("ALL")}
                    className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition ${
                      categoryFilter === "ALL"
                        ? "bg-slate-800 text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    ทุกหมวดหมู่
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition ${
                        categoryFilter === cat.id
                          ? "bg-slate-800 text-white"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}

              {visibleItems.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                  ไม่มีรายการในหมวดนี้
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 mb-20">
                  {visibleItems.map((item) => {
                    const qty = qtyByItemId[item.id] ?? 0;
                    const dbBalance = data.balances.find((b) => b.product.id === item.id)?.quantity ?? 0;
                    const seq = seqById.get(item.id) ?? 0;
                    
                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-4 py-4"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-slate-400">
                            {seq}
                          </span>
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-site-primary-soft">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <IconSkewerPlaceholder size={24} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 leading-tight">
                              {item.productCode ? (
                                <>
                                  <MenuItemCodeBadge
                                    code={item.productCode}
                                    className="mr-1.5 align-middle text-[10px]"
                                  />
                                </>
                              ) : null}
                              {item.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              สต๊อกเดิม: <span className="font-medium text-slate-700">{dbBalance} {item.unit}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className={`flex h-9 shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 bg-white ${qty > 0 ? "border-site-primary ring-1 ring-site-primary" : ""}`}>
                            <button
                              type="button"
                              onClick={() => setQty(item.id, qty - 1)}
                              className="flex h-full w-9 shrink-0 items-center justify-center bg-slate-50 text-slate-600 transition hover:bg-slate-100 active:bg-slate-200"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={qty || ""}
                              placeholder="0"
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setQty(item.id, isNaN(val) ? 0 : val);
                              }}
                              className="w-12 text-center text-sm font-bold tabular-nums text-slate-900 focus:outline-none focus:bg-site-primary-soft/20 h-full bg-transparent p-0 border-none ring-0"
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
              )}
              
              {selectedItems.length > 0 && (
                <div className="sticky bottom-4 z-10 mt-8 flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
                  <div className="min-w-0">
                    <h3 className="font-bold text-white">
                      {actionType === "stock_in"
                        ? "ยอดรับเข้า"
                        : actionType === "issue"
                          ? "ยอดจ่ายออก"
                          : "ยอดที่จะตั้ง"}
                    </h3>
                    <p className="text-xs text-slate-400">
                      เลือกไว้ {selectedItems.length} รายการ
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-semibold text-slate-400">
                      {actionType === "adjust" ? "รวมยอดตั้ง" : "จำนวนรวม"}
                    </p>
                    <p className="text-lg font-black tabular-nums leading-none text-white">
                      {formatPrice(selectedTotalQty)}
                    </p>
                  </div>
                  <button
                    onClick={() => void submitChanges()}
                    disabled={busy}
                    className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-70 ${
                      actionType === "stock_in"
                        ? "bg-emerald-500 hover:bg-emerald-400"
                        : actionType === "issue"
                          ? "bg-amber-500 hover:bg-amber-400"
                          : "bg-sky-500 hover:bg-sky-400"
                    }`}
                  >
                    {busy ? "กำลังบันทึก..." : "ยืนยันทำรายการ"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* Modal สร้างของสิ้นเปลือง/อุปกรณ์ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingItemId ? "แก้ไข" : "สร้าง"}
                {showCreateModal === "CONSUMABLE" ? "ของสิ้นเปลือง" : "อุปกรณ์"}
                {editingItemId ? "" : "ใหม่"}
              </h2>
              <button onClick={closeItemModal} className="text-slate-400 hover:text-slate-600 p-2">✕</button>
            </div>
            
            <form onSubmit={handleCreateNonMenu} className="p-5 overflow-y-auto space-y-4">
              <div className="flex justify-center mb-4">
                <ImageField
                  value={newItemData.imageUrl}
                  onChange={(url) => setNewItemData({...newItemData, imageUrl: url})}
                  size="compact"
                  label="รูปภาพ"
                  hint="แนะนำขนาดสี่เหลี่ยมจัตุรัส"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">ชื่อรายการ *</label>
                <input
                  type="text"
                  required
                  value={newItemData.name}
                  onChange={(e) => setNewItemData({...newItemData, name: e.target.value})}
                  className={adminInputClass}
                  placeholder="เช่น น้ำจิ้ม, น้ำแข็ง, แก้วน้ำ..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">หน่วย *</label>
                <input
                  type="text"
                  required
                  value={newItemData.unit}
                  onChange={(e) => setNewItemData({...newItemData, unit: e.target.value})}
                  className={adminInputClass}
                  placeholder={
                    showCreateModal === "CONSUMABLE"
                      ? "เช่น ใบ, กระสอบ, ถัง, ขวด"
                      : "เช่น ชิ้น, เครื่อง"
                  }
                />
                {showCreateModal === "CONSUMABLE" ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["ใบ", "แพ็ค", "กระสอบ", "ถัง", "ขวด", "แกลลอน", "ถุง"].map(
                      (unit) => (
                        <button
                          key={unit}
                          type="button"
                          onClick={() =>
                            setNewItemData((prev) => ({ ...prev, unit }))
                          }
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            newItemData.unit === unit
                              ? "bg-site-primary text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {unit}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
                {showCreateModal === "CONSUMABLE" ? (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    แนะนำ: แก้ว/ถุง = ใบ · น้ำแข็ง = กระสอบ / ครึ่งกระสอบ ·
                    แก๊ส = ถัง · น้ำจิ้ม = แกลลอน
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">รายละเอียด (ถ้ามี)</label>
                <textarea
                  value={newItemData.description}
                  onChange={(e) => setNewItemData({...newItemData, description: e.target.value})}
                  className={adminInputClass}
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  ราคาต่อหน่วย{" "}
                  {showCreateModal === "CONSUMABLE" ? (
                    <span className="font-medium text-slate-500">
                      (ใช้คำนวณต้นทุน)
                    </span>
                  ) : (
                    "(ถ้ามี)"
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newItemData.price}
                  onChange={(e) => setNewItemData({...newItemData, price: e.target.value})}
                  className={adminInputClass}
                  placeholder="0.00"
                />
                {showCreateModal === "CONSUMABLE" ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    ใส่ราคาซื้อต่อหน่วย เช่น น้ำแข็ง ฿80/กระสอบ เพื่อดูต้นทุนการใช้ในแท็บ
                    สรุปการใช้ / ต้นทุน
                  </p>
                ) : null}
              </div>

              {showCreateModal === "CONSUMABLE" ? (
                <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                      checked={newItemData.showOnKeyOrder}
                      onChange={(e) =>
                        setNewItemData((prev) => ({
                          ...prev,
                          showOnKeyOrder: e.target.checked,
                        }))
                      }
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">
                        แสดงตอนคีย์ออเดอร์พนักงาน
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        เปิดแล้วจะอยู่ในหน้า “เลือกสินค้าสิ้นเปลือง” ของคีย์ออเดอร์หน้าร้าน
                      </span>
                    </span>
                  </label>
                  {newItemData.showOnKeyOrder ? (
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        ลำดับแสดงบนคีย์ออเดอร์
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        value={newItemData.keyOrderSortOrder}
                        onChange={(e) =>
                          setNewItemData((prev) => ({
                            ...prev,
                            keyOrderSortOrder: e.target.value,
                          }))
                        }
                        className={adminInputClass}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        เลขน้อยแสดงก่อน
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={closeItemModal}
                  className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-xl bg-site-primary py-3 text-sm font-bold text-white hover:bg-site-primary-focus disabled:opacity-70"
                >
                  {busy
                    ? "กำลังบันทึก..."
                    : editingItemId
                      ? "บันทึกการแก้ไข"
                      : "สร้างรายการ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
