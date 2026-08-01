"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

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
  description?: string | null;
  isMenu?: boolean;
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
  const toast = useToast();
  const { confirm } = useConfirm();

  const [data, setData] = useState<StockPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<"menu" | "select_type" | "items">("menu");
  const [actionType, setActionType] = useState<"stock_in" | "issue" | null>(null);

  const [typeFilter, setTypeFilter] = useState<"ALL" | StockType>("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({});
  
  const [activeTab, setActiveTab] = useState<"manage" | "counts" | "movements">(
    "manage",
  );

  // Dropdown for "สร้างรายการใหม่"
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);

  // Modal state for non-menu items (create or edit)
  const [showCreateModal, setShowCreateModal] = useState<"CONSUMABLE" | "EQUIPMENT" | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newItemData, setNewItemData] = useState({ name: "", description: "", unit: "ชิ้น", price: "", imageUrl: "" });

  function closeItemModal() {
    setShowCreateModal(null);
    setEditingItemId(null);
    setNewItemData({ name: "", description: "", unit: "ชิ้น", price: "", imageUrl: "" });
  }

  function openCreateItem(type: "CONSUMABLE" | "EQUIPMENT") {
    setEditingItemId(null);
    setNewItemData({ name: "", description: "", unit: "ชิ้น", price: "", imageUrl: "" });
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
    });
    setShowCreateModal(item.stockType);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/stock`);
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (res.ok) {
        const json = (await res.json()) as StockPayload;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [branchId, router]);

  useEffect(() => {
    void load();
  }, [load]);

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
      
      if (qty <= (product.lowStockAlert || 0)) {
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
    if (categoryFilter === "ALL") return typedCatalog;
    return typedCatalog.filter(
      (item) => (item.category || "ไม่มีหมวดหมู่") === categoryFilter,
    );
  }, [typedCatalog, categoryFilter]);

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

  const handleActionClick = (action: "stock_in" | "issue") => {
    setActionType(action);
    setMode("select_type");
    setQtyByItemId({});
    setCategoryFilter("ALL");
  };
  
  const handleTypeSelectClick = (type: StockType) => {
    setTypeFilter(type);
    setCategoryFilter("ALL");
    setMode("items");
  };

  const handleBack = () => {
    if (mode === "items") {
      setMode("select_type");
    } else {
      setMode("menu");
      setActionType(null);
      setQtyByItemId({});
    }
  };

  async function submitChanges() {
    if (selectedItems.length === 0 || !actionType) return;
    setBusy(true);
    try {
      let hasError = false;
      for (const item of selectedItems) {
        const res = await fetch(`/api/admin/branches/${branchId}/stock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: actionType,
            brandProductId: item.id,
            quantity: item.quantity,
            note: actionType === "stock_in" ? "เพิ่มผ่านระบบ Admin" : "เบิกออกผ่านระบบ Admin",
          }),
        });
        if (!res.ok) hasError = true;
      }
      
      if (hasError) {
        toast.error("บันทึกบางรายการไม่สำเร็จ", "กรุณาตรวจสอบยอดอีกครั้ง");
      } else {
        toast.success(actionType === "stock_in" ? "รับเข้าสำเร็จ" : "จ่ายออกสำเร็จ", `อัปเดต ${selectedItems.length} รายการ`);
        setMode("menu");
        setActionType(null);
        setQtyByItemId({});
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

  if (loading || !data) {
    return <AdminLoadingState className="py-8" />;
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("manage")}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "manage" ? "border-site-primary text-site-primary" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          จัดการสต๊อกสาขา
        </button>
        <button
          onClick={() => setActiveTab("movements")}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "movements" ? "border-site-primary text-site-primary" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          เคลื่อนไหว
        </button>
        <button
          onClick={() => setActiveTab("counts")}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "counts" ? "border-site-primary text-site-primary" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          ประวัติการตรวจนับ
        </button>
      </div>

      {activeTab === "counts" ? (
        <BranchStockCountsView branchId={branchId} />
      ) : activeTab === "movements" ? (
        <BranchStockMovementsView branchId={branchId} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">จัดการสต๊อกสาขา</h2>
              <p className="text-xs text-slate-500 mt-0.5">รับเข้า เบิกออก หรือดูยอดคงเหลือของทุกรายการ</p>
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
              
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
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
                    <p className="mt-1 text-amber-100 text-xs">เบิกใช้ / ตัดสูญหาย</p>
                  </div>
                  <div className="text-3xl">📤</div>
                </button>
              </div>

              {/* Table View of Balances */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="font-bold text-slate-800">ยอดคงเหลือปัจจุบัน</h3>
                  
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
                        <th className="px-4 py-3 font-semibold">รายการ</th>
                        <th className="px-4 py-3 font-semibold">หมวดหมู่</th>
                        <th className="px-4 py-3 font-semibold text-right">ยอดคงเหลือ</th>
                        <th className="px-4 py-3 font-semibold text-right w-28">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleItems.map((item) => {
                        const dbBalance = data.balances.find((b) => b.product.id === item.id)?.quantity ?? 0;
                        const seq = seqById.get(item.id) ?? 0;
                        const isMenu = item.stockType === "SALE_ITEM" || item.isMenu;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-sm font-bold tabular-nums text-slate-400">
                              {seq}
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
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                                {item.category || "-"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-bold ${
                                dbBalance <= (item.lowStockAlert || 0)
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
                      {visibleItems.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                            ไม่พบรายการที่ตรงกับตัวกรอง
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
                  {actionType === "stock_in" ? "เลือกประเภทเพื่อรับเข้า" : actionType === "issue" ? "เลือกประเภทเพื่อจ่ายออก" : ""}
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
                  {actionType === "stock_in" ? "รับเข้าสต๊อก" : actionType === "issue" ? "จ่ายออกสต๊อก" : ""}
                </h2>
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
                <div className="sticky bottom-4 mt-8 rounded-2xl bg-slate-900 p-4 shadow-lg border border-slate-800 flex items-center justify-between z-10 gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-white">
                      {actionType === "stock_in" ? "ยอดรับเข้า" : "ยอดจ่ายออก"}
                    </h3>
                    <p className="text-xs text-slate-400">เลือกไว้ {selectedItems.length} รายการ</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] font-semibold text-slate-400">จำนวนรวม</p>
                    <p className="text-lg font-black tabular-nums leading-none text-white">
                      {formatPrice(selectedTotalQty)}
                    </p>
                  </div>
                  <button
                    onClick={() => void submitChanges()}
                    disabled={busy}
                    className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm active:scale-[0.98] transition-transform disabled:opacity-70 ${
                      actionType === "stock_in" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-amber-500 hover:bg-amber-400"
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
                  placeholder="เช่น กล่องใส่อาหาร, ถุงกระดาษ..."
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
                  placeholder="เช่น ชิ้น, ห่อ, กล่อง"
                />
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
                <label className="block text-sm font-semibold text-slate-700 mb-1">ราคา (ถ้ามี)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newItemData.price}
                  onChange={(e) => setNewItemData({...newItemData, price: e.target.value})}
                  className={adminInputClass}
                  placeholder="0.00"
                />
              </div>

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
