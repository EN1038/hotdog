"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AdminLoadingState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  adminSelectClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";

type TabId =
  | "suppliers"
  | "po"
  | "branch_transfer"
  | "lots"
  | "recipes"
  | "forecast"
  | "accounting";

type Product = {
  id: string;
  name: string;
  unit: string;
  stockType: string;
  barcode?: string | null;
  trackLots?: boolean;
};

type BranchRow = { id: string; name: string; stockEnabled: boolean };
type Location = { id: string; name: string; type: string };

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

type StockMeta = {
  brand: { id: string; name: string; stockEnabled: boolean };
  products: Product[];
  branches: BranchRow[];
  locations: Location[];
  warehouse: { id: string } | null;
};

const TABS: { id: TabId; label: string }[] = [
  { id: "suppliers", label: "ผู้ขาย" },
  { id: "po", label: "ใบสั่งซื้อ" },
  { id: "branch_transfer", label: "โอนระหว่างสาขา" },
  { id: "lots", label: "ล็อต/หมดอายุ" },
  { id: "recipes", label: "สูตร/BOM" },
  { id: "forecast", label: "พยากรณ์สั่ง" },
  { id: "accounting", label: "บัญชี CSV" },
];

const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

const PO_STATUS: Record<string, string> = {
  DRAFT: "ร่าง",
  ORDERED: "สั่งแล้ว",
  PARTIAL: "รับบางส่วน",
  RECEIVED: "รับครบ",
  CANCELLED: "ยกเลิก",
};

export default function BrandStockAdvancedPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState<TabId>("suppliers");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<StockMeta | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");

  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [poSupplierId, setPoSupplierId] = useState("");
  const [poProductId, setPoProductId] = useState("");
  const [poQty, setPoQty] = useState("10");
  const [poUnitCost, setPoUnitCost] = useState("");
  const [receiveQtyMap, setReceiveQtyMap] = useState<Record<string, string>>(
    {},
  );

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

  const apiBase = `/api/admin/brands/${id}/stock`;

  const loadMeta = useCallback(async () => {
    const res = await fetch(apiBase);
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (!res.ok) {
      router.replace("/admin");
      return;
    }
    setMeta((await res.json()) as StockMeta);
    setLoading(false);
  }, [apiBase, router]);

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
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!meta?.brand.stockEnabled) return;
    if (tab === "suppliers") void loadSuppliers();
    if (tab === "po") {
      void loadSuppliers();
      void loadPos();
    }
    if (tab === "lots") void loadLots();
    if (tab === "recipes") void loadRecipes();
    if (tab === "forecast") void loadForecast();
  }, [
    tab,
    meta,
    loadSuppliers,
    loadPos,
    loadLots,
    loadRecipes,
    loadForecast,
  ]);

  useEffect(() => {
    if (!meta?.products.length) return;
    if (!poProductId) setPoProductId(meta.products[0].id);
    if (!btProductId) setBtProductId(meta.products[0].id);
    if (!recipeParentId) setRecipeParentId(meta.products[0].id);
    if (!recipeComponentId && meta.products[1]) {
      setRecipeComponentId(meta.products[1].id);
    }
  }, [meta, poProductId, btProductId, recipeParentId, recipeComponentId]);

  useEffect(() => {
    if (!suppliers.length) return;
    if (!poSupplierId) setPoSupplierId(suppliers[0].id);
  }, [suppliers, poSupplierId]);

  useEffect(() => {
    const branches = meta?.branches.filter((b) => b.stockEnabled) ?? [];
    if (branches.length < 2) return;
    if (!btSource) setBtSource(branches[0].id);
    if (!btDest) setBtDest(branches[1].id);
  }, [meta, btSource, btDest]);

  const stockBranches = useMemo(
    () => meta?.branches.filter((b) => b.stockEnabled) ?? [],
    [meta],
  );

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
          stockLocationId: meta?.warehouse?.id ?? null,
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
      if (action === "receive") await loadLots();
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

  if (loading || !meta) return <AdminLoadingState />;

  const products = meta.products;

  return (
    <div>
      <AdminPageHeader
        title={`สต๊อกขั้นสูง · ${meta.brand.name}`}
        description="ผู้ขาย · PO · โอนสาขา · ล็อต · สูตร · พยากรณ์ · ส่งออกบัญชี"
        actions={
          <Link href={`/admin/brands/${id}/stock`} className={btnOutline}>
            กลับสต๊อกหลัก
          </Link>
        }
      />

      {!meta.brand.stockEnabled ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          เปิดระบบสต๊อกที่หน้าหลักก่อน แล้วค่อยใช้ฟีเจอร์ขั้นสูง
        </p>
      ) : (
        <>
          <div className="sticky top-[3.25rem] z-20 -mx-1 mb-4 overflow-x-auto filter-scroll-row bg-slate-50/95 px-1 py-2 backdrop-blur lg:top-[3.75rem]">
            <div className="flex min-w-max gap-0.5 rounded-2xl border border-slate-200 bg-white/90 p-1.5 shadow-sm">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-xl px-3.5 py-2 text-sm transition ${
                    tab === t.id
                      ? "bg-site-primary font-semibold text-white shadow-sm"
                      : "font-medium text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "suppliers" && (
            <section className={cardClass}>
              <h3 className="text-sm font-semibold text-slate-900">ผู้ขาย</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={adminLabelClass}>ชื่อ</label>
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
              {stockBranches.length < 2 ? (
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
                      {stockBranches.map((b) => (
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
                      {stockBranches.map((b) => (
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
                disabled={busy || stockBranches.length < 2}
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
                    ยังไม่มีล็อต — รับเข้าพร้อมเลขล็อตที่หน้าสต๊อกหลัก หรือจาก
                    PO
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
                  <input
                    className={adminInputClass}
                    type="date"
                    value={acctFrom}
                    onChange={(e) => setAcctFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>ถึงวันที่</label>
                  <input
                    className={adminInputClass}
                    type="date"
                    value={acctTo}
                    onChange={(e) => setAcctTo(e.target.value)}
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
        </>
      )}
    </div>
  );
}
