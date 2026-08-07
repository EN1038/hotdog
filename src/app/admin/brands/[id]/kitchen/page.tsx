"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AdminLoadingState,
  AdminPageHeader,
  adminCardClass,
  adminInputClass,
  adminLabelClass,
  btnDark,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import { formatPrice } from "@/lib/constants";

type ProductRow = {
  id: string;
  name: string;
  unit: string;
  stockType: string;
  trackLots: boolean;
  costPrice: number | null;
  warehouseQty: number;
  hasRecipe: boolean;
  recipeLines: {
    quantityPerUnit: number;
    component: { id: string; name: string; unit: string };
  }[];
};

type Overview = {
  warehouse: { id: string; name: string };
  pendingTransfers: number;
  pendingRequests: number;
  openPurchaseOrders: number;
  products: ProductRow[];
  consumables: ProductRow[];
  finishedGoods: ProductRow[];
  recentProductions: ProductionRow[];
};

type ProductionRow = {
  id: string;
  quantityProduced: number;
  quantityWasted: number;
  completedAt: string;
  lotNumber: string | null;
  note: string | null;
  finishedProduct: { id: string; name: string; unit: string };
  components: {
    quantityUsed: number;
    quantityPlanned: number;
    product: { name: string; unit: string };
  }[];
  createdByAdmin: { username: string } | null;
};

type RequestRow = {
  id: string;
  quantityRequested: number;
  quantityFulfilled: number;
  status: string;
  note: string | null;
  createdAt: string;
  product: { id: string; name: string; unit: string };
  branch: { id: string; name: string };
};

type PlanRow = {
  brandProductId: string;
  name: string;
  unit: string;
  totalRequested: number;
  branches: { branchId: string; branchName: string; qty: number }[];
};

type BranchOpt = { id: string; name: string };

type KitchenTab = "flow" | "produce" | "requests" | "ship" | "history";

const TABS: { id: KitchenTab; label: string }[] = [
  { id: "flow", label: "ภาพรวม flow" },
  { id: "produce", label: "ผลิต / เสียบไม้" },
  { id: "requests", label: "คำขอสาขา" },
  { id: "ship", label: "ส่งสาขา" },
  { id: "history", label: "ประวัติผลิต" },
];

const STATUS_TH: Record<string, string> = {
  PENDING: "รอจัดส่ง",
  FULFILLED: "จัดส่งแล้ว",
  REJECTED: "ปฏิเสธ",
  CANCELLED: "ยกเลิก",
};

export default function KitchenWorkspacePage() {
  const { id: brandId } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const toast = useToast();

  const [tab, setTab] = useState<KitchenTab>("flow");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [branches, setBranches] = useState<BranchOpt[]>([]);

  // produce form
  const [finishedId, setFinishedId] = useState("");
  const [produceQty, setProduceQty] = useState("10");
  const [wasteQty, setWasteQty] = useState("0");
  const [produceNote, setProduceNote] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [unitCostHint, setUnitCostHint] = useState<string | null>(null);

  // ship form
  const [shipProductId, setShipProductId] = useState("");
  const [shipBranchId, setShipBranchId] = useState("");
  const [shipQty, setShipQty] = useState("1");
  const [shipNote, setShipNote] = useState("");

  // admin request form
  const [reqBranchId, setReqBranchId] = useState("");
  const [reqProductId, setReqProductId] = useState("");
  const [reqQty, setReqQty] = useState("10");
  const [reqNote, setReqNote] = useState("");

  const apiBase = `/api/admin/brands/${brandId}/kitchen`;
  const stockHref = `/admin/brands/${brandId}/stock`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, reqsRes, plRes, brandRes] = await Promise.all([
        fetch(`${apiBase}?view=overview`),
        fetch(`${apiBase}?view=requests`),
        fetch(`${apiBase}?view=plan`),
        fetch(`/api/admin/brands/${brandId}`),
      ]);
      const ov = await ovRes.json();
      const reqs = await reqsRes.json();
      const pl = await plRes.json();
      const brandBody = brandRes.ok ? await brandRes.json() : null;
      if (ov?.error) throw new Error(ov.error);
      setData(ov as Overview);
      setRequests(Array.isArray(reqs) ? reqs : []);
      setPlan(Array.isArray(pl) ? pl : []);
      if (Array.isArray(brandBody?.branches)) {
        setBranches(
          brandBody.branches.map((b: { id: string; name: string }) => ({
            id: b.id,
            name: b.name,
          })),
        );
      }
      const goods = (ov as Overview).finishedGoods;
      if (goods[0] && !finishedId) setFinishedId(goods[0].id);
      if (goods[0] && !shipProductId) setShipProductId(goods[0].id);
      if (goods[0] && !reqProductId) setReqProductId(goods[0].id);
    } catch (e) {
      toast.error(
        "โหลดหน้าครัวไม่สำเร็จ",
        e instanceof Error ? e.message : "ลองใหม่",
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, brandId]);

  useEffect(() => {
    if (!loaded) return;
    if (session && !session.isPlatformAdmin && !session.brandIds.includes(brandId)) {
      router.replace("/admin");
      return;
    }
    void loadAll();
  }, [loaded, session, brandId, router, loadAll]);

  useEffect(() => {
    if (!finishedId) {
      setUnitCostHint(null);
      return;
    }
    fetch(`${apiBase}?view=unit-cost&productId=${finishedId}`)
      .then((r) => r.json())
      .then((body) => {
        if (body?.unitCost != null) {
          setUnitCostHint(
            `ประมาณต้นทุน ${formatPrice(body.unitCost)} ฿ / หน่วย (${body.source === "recipe" ? "จากสูตร" : "จากสินค้า"})`,
          );
        } else setUnitCostHint(null);
      })
      .catch(() => setUnitCostHint(null));
  }, [apiBase, finishedId]);

  const selectedFinished = useMemo(
    () => data?.finishedGoods.find((p) => p.id === finishedId) ?? null,
    [data, finishedId],
  );

  const previewLines = useMemo(() => {
    if (!selectedFinished) return [];
    const out =
      (Number(produceQty) || 0) + (Number(wasteQty) || 0);
    return selectedFinished.recipeLines.map((l) => ({
      name: l.component.name,
      unit: l.component.unit,
      need: Math.ceil(l.quantityPerUnit * out - 1e-9),
    }));
  }, [selectedFinished, produceQty, wasteQty]);

  async function postAction(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "ไม่สำเร็จ");
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function handleProduce() {
    const quantityProduced = Number(produceQty);
    const quantityWasted = Number(wasteQty) || 0;
    if (!finishedId) {
      toast.error("เลือกเมนูสำเร็จรูป");
      return;
    }
    if (quantityProduced + quantityWasted <= 0) {
      toast.error("ระบุจำนวนผลิตหรือของเสีย");
      return;
    }
    try {
      await postAction({
        action: "produce",
        finishedProductId: finishedId,
        quantityProduced,
        quantityWasted,
        note: produceNote.trim() || null,
        lotNumber: lotNumber.trim() || null,
      });
      toast.success("บันทึกการผลิตแล้ว — ตัดวัตถุดิบและเพิ่มสำเร็จรูป");
      setProduceNote("");
      setLotNumber("");
      await loadAll();
    } catch (e) {
      toast.error("ผลิตไม่สำเร็จ", e instanceof Error ? e.message : "");
    }
  }

  async function handleShip() {
    const quantity = Number(shipQty);
    if (!shipProductId || !shipBranchId || quantity <= 0) {
      toast.error("กรอกสินค้า สาขา และจำนวน");
      return;
    }
    try {
      await postAction({
        action: "ship",
        brandProductId: shipProductId,
        branchId: shipBranchId,
        quantity,
        note: shipNote.trim() || null,
      });
      toast.success("สร้างรายการส่งสาขาแล้ว — รอนับรับที่สาขา");
      setShipNote("");
      await loadAll();
    } catch (e) {
      toast.error("ส่งไม่สำเร็จ", e instanceof Error ? e.message : "");
    }
  }

  async function handleCreateRequest() {
    const quantityRequested = Number(reqQty);
    if (!reqBranchId || !reqProductId || quantityRequested <= 0) {
      toast.error("กรอกสาขา สินค้า และจำนวน");
      return;
    }
    try {
      await postAction({
        action: "request_create",
        branchId: reqBranchId,
        brandProductId: reqProductId,
        quantityRequested,
        note: reqNote.trim() || null,
      });
      toast.success("บันทึกคำขอแล้ว");
      setReqNote("");
      await loadAll();
    } catch (e) {
      toast.error("บันทึกคำขอไม่สำเร็จ", e instanceof Error ? e.message : "");
    }
  }

  async function fulfill(requestId: string) {
    try {
      await postAction({ action: "request_fulfill", requestId });
      toast.success("จัดส่งตามคำขอแล้ว");
      await loadAll();
    } catch (e) {
      toast.error("จัดส่งไม่สำเร็จ", e instanceof Error ? e.message : "");
    }
  }

  async function reject(requestId: string) {
    try {
      await postAction({ action: "request_reject", requestId });
      toast.success("ปฏิเสธคำขอแล้ว");
      await loadAll();
    } catch (e) {
      toast.error("ปฏิเสธไม่สำเร็จ", e instanceof Error ? e.message : "");
    }
  }

  if (!loaded || loading || !data) {
    return <AdminLoadingState />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-16">
      <AdminPageHeader
        title="ครัว / ผลิต & ส่งสาขา"
        description={`${data.warehouse.name} · ซื้อของ → เสียบไม้ → ส่งสาขา → สาขานับรับ`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/brands/${brandId}`} className={btnOutline}>
              กลับแบรนด์
            </Link>
            <Link href={stockHref} className={btnOutline}>
              สต๊อกเต็ม / PO / สูตร
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="รอสาขารับโอน"
          value={String(data.pendingTransfers)}
          tone="amber"
        />
        <StatCard
          label="คำขอสาขารอจัด"
          value={String(data.pendingRequests)}
          tone="sky"
        />
        <StatCard
          label="PO ค้าง"
          value={String(data.openPurchaseOrders)}
          tone="violet"
        />
        <StatCard
          label="เมนูสำเร็จรูป"
          value={String(data.finishedGoods.length)}
          tone="emerald"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              tab === t.id
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t.label}
            {t.id === "requests" && data.pendingRequests > 0
              ? ` (${data.pendingRequests})`
              : ""}
          </button>
        ))}
      </div>

      {tab === "flow" ? (
        <section className={`${adminCardClass} space-y-4`}>
          <h2 className="text-base font-extrabold text-slate-900">
            Flow ครัว (เฟส 1–4)
          </h2>
          <ol className="space-y-3 text-sm text-slate-700">
            <li className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <strong>1. ซื้อวัตถุดิบ</strong> — ใบสั่งซื้อ (PO) รับเข้าบ้านกลาง
              <div className="mt-1">
                <Link
                  href={`${stockHref}?tab=po`}
                  className="text-sky-700 underline"
                >
                  ไปแท็บ PO
                </Link>
              </div>
            </li>
            <li className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <strong>2. ตั้งสูตร (BOM)</strong> — เมนูสำเร็จรูปใช้วัตถุดิบต่อไม้เท่าไร
              <div className="mt-1">
                <Link
                  href={`${stockHref}?tab=recipes`}
                  className="text-sky-700 underline"
                >
                  ไปแท็บสูตร
                </Link>
              </div>
            </li>
            <li className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <strong>3. ผลิต / เสียบไม้</strong> — ตัดวัตถุดิบ + เพิ่มสำเร็จรูป + ของเสียผลิต
              (แท็บ “ผลิต / เสียบไม้”)
            </li>
            <li className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <strong>4. รวม demand จากสาขา</strong> — คำขอสาขา + แผนผลิต
            </li>
            <li className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <strong>5. ส่งสาขา</strong> — โอนจากบ้านกลาง รอนับรับที่หน้าร้าน
            </li>
            <li className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <strong>6. ล็อต / ต้นทุน</strong> — ถ้าเปิด trackLots จะตัด FEFO และติด
              lot ผลผลิต · ประมาณต้นทุนต่อไม้จากสูตร
            </li>
          </ol>

          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-800">
              คงเหลือบ้านกลาง (สรุป)
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2">สินค้า</th>
                    <th className="px-3 py-2">ประเภท</th>
                    <th className="px-3 py-2 text-right">คงเหลือ</th>
                    <th className="px-3 py-2">สูตร</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.products.slice(0, 40).map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {p.stockType === "SALE_ITEM"
                          ? "สำเร็จรูป"
                          : p.stockType === "CONSUMABLE"
                            ? "วัตถุดิบ"
                            : "อุปกรณ์"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatPrice(p.warehouseQty)} {p.unit}
                      </td>
                      <td className="px-3 py-2">
                        {p.hasRecipe ? (
                          <span className="text-emerald-700">มี</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "produce" ? (
        <section className={`${adminCardClass} space-y-4`}>
          <h2 className="text-base font-extrabold">ผลิต / เสียบไม้</h2>
          <p className="text-xs text-slate-500">
            ระบบตัดวัตถุดิบตามสูตร × (ผลิตได้ + เสีย) แล้วเพิ่มเมนูสำเร็จรูปเข้าบ้านกลาง
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={adminLabelClass}>เมนูสำเร็จรูป</label>
              <select
                className={adminInputClass}
                value={finishedId}
                onChange={(e) => setFinishedId(e.target.value)}
              >
                {data.finishedGoods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (คงเหลือ {p.warehouseQty})
                  </option>
                ))}
              </select>
              {unitCostHint ? (
                <p className="mt-1 text-xs text-violet-700">{unitCostHint}</p>
              ) : null}
            </div>
            <div>
              <label className={adminLabelClass}>เลขล็อตผลผลิต (ไม่บังคับ)</label>
              <input
                className={adminInputClass}
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="ว่าง = สร้างอัตโนมัติถ้าติดตามล็อต"
              />
            </div>
            <div>
              <label className={adminLabelClass}>จำนวนได้ใช้ได้</label>
              <input
                type="number"
                min={0}
                className={adminInputClass}
                value={produceQty}
                onChange={(e) => setProduceQty(e.target.value)}
              />
            </div>
            <div>
              <label className={adminLabelClass}>ของเสียตอนผลิต</label>
              <input
                type="number"
                min={0}
                className={adminInputClass}
                value={wasteQty}
                onChange={(e) => setWasteQty(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={adminLabelClass}>หมายเหตุ</label>
              <input
                className={adminInputClass}
                value={produceNote}
                onChange={(e) => setProduceNote(e.target.value)}
                placeholder="รอบเช้า / ทีม ก ฯลฯ"
              />
            </div>
          </div>

          {previewLines.length > 0 ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-sm">
              <p className="font-semibold text-amber-900">วัตถุดิบที่จะตัด</p>
              <ul className="mt-1 space-y-0.5 text-amber-900/90">
                {previewLines.map((l) => (
                  <li key={l.name}>
                    {l.name}: {formatPrice(l.need)} {l.unit}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-rose-600">
              เมนูนี้ยังไม่มีสูตร — ไปตั้งใน{" "}
              <Link href={`${stockHref}?tab=recipes`} className="underline">
                แท็บสูตร
              </Link>{" "}
              ก่อน
            </p>
          )}

          <button
            type="button"
            disabled={busy || !selectedFinished?.hasRecipe}
            onClick={() => void handleProduce()}
            className={btnPrimary}
          >
            {busy ? "กำลังบันทึก…" : "ยืนยันผลิต"}
          </button>
        </section>
      ) : null}

      {tab === "requests" ? (
        <div className="space-y-4">
          {plan.length > 0 ? (
            <section className={`${adminCardClass} space-y-2`}>
              <h2 className="text-base font-extrabold">แผน demand รวม (เฟส 3)</h2>
              <ul className="space-y-2 text-sm">
                {plan.map((p) => (
                  <li
                    key={p.brandProductId}
                    className="rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">{p.name}</span>
                      <span className="tabular-nums text-sky-800">
                        รวม {formatPrice(p.totalRequested)} {p.unit}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {p.branches
                        .map((b) => `${b.branchName} ${b.qty}`)
                        .join(" · ")}
                    </p>
                    <button
                      type="button"
                      className="mt-1 text-xs font-semibold text-violet-700 underline"
                      onClick={() => {
                        setFinishedId(p.brandProductId);
                        setProduceQty(String(p.totalRequested));
                        setTab("produce");
                      }}
                    >
                      ไปผลิตตามยอดนี้
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={`${adminCardClass} space-y-3`}>
            <h2 className="text-base font-extrabold">บันทึกคำขอแทนสาขา</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabelClass}>สาขา</label>
                <select
                  className={adminInputClass}
                  value={reqBranchId}
                  onChange={(e) => setReqBranchId(e.target.value)}
                >
                  <option value="">เลือกสาขา</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={adminLabelClass}>สินค้า</label>
                <select
                  className={adminInputClass}
                  value={reqProductId}
                  onChange={(e) => setReqProductId(e.target.value)}
                >
                  {data.finishedGoods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={adminLabelClass}>จำนวน</label>
                <input
                  type="number"
                  min={1}
                  className={adminInputClass}
                  value={reqQty}
                  onChange={(e) => setReqQty(e.target.value)}
                />
              </div>
              <div>
                <label className={adminLabelClass}>หมายเหตุ</label>
                <input
                  className={adminInputClass}
                  value={reqNote}
                  onChange={(e) => setReqNote(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              className={btnOutline}
              onClick={() => void handleCreateRequest()}
            >
              บันทึกคำขอ
            </button>
          </section>

          <section className={`${adminCardClass} space-y-2`}>
            <h2 className="text-base font-extrabold">รายการคำขอ</h2>
            {requests.length === 0 ? (
              <p className="text-sm text-slate-500">ยังไม่มีคำขอ</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-left">สาขา</th>
                      <th className="px-2 py-2 text-left">สินค้า</th>
                      <th className="px-2 py-2 text-right">ขอ</th>
                      <th className="px-2 py-2">สถานะ</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td className="px-2 py-2">{r.branch.name}</td>
                        <td className="px-2 py-2">{r.product.name}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {r.quantityRequested}
                        </td>
                        <td className="px-2 py-2">
                          {STATUS_TH[r.status] ?? r.status}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {r.status === "PENDING" ? (
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white"
                                onClick={() => void fulfill(r.id)}
                              >
                                ส่ง
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded-lg border px-2 py-1 text-xs font-semibold text-slate-600"
                                onClick={() => void reject(r.id)}
                              >
                                ปฏิเสธ
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === "ship" ? (
        <section className={`${adminCardClass} space-y-4`}>
          <h2 className="text-base font-extrabold">ส่งสำเร็จรูปไปสาขา</h2>
          <p className="text-xs text-slate-500">
            ตัดจากบ้านกลางทันที · สาขานับรับในหน้าสต๊อกหน้าร้าน
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={adminLabelClass}>สินค้า</label>
              <select
                className={adminInputClass}
                value={shipProductId}
                onChange={(e) => setShipProductId(e.target.value)}
              >
                {data.finishedGoods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (เหลือ {p.warehouseQty})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={adminLabelClass}>สาขาปลายทาง</label>
              <select
                className={adminInputClass}
                value={shipBranchId}
                onChange={(e) => setShipBranchId(e.target.value)}
              >
                <option value="">เลือกสาขา</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={adminLabelClass}>จำนวน</label>
              <input
                type="number"
                min={1}
                className={adminInputClass}
                value={shipQty}
                onChange={(e) => setShipQty(e.target.value)}
              />
            </div>
            <div>
              <label className={adminLabelClass}>หมายเหตุ</label>
              <input
                className={adminInputClass}
                value={shipNote}
                onChange={(e) => setShipNote(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            className={btnDark}
            onClick={() => void handleShip()}
          >
            {busy ? "กำลังส่ง…" : "สร้างรายการส่ง"}
          </button>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className={`${adminCardClass} space-y-3`}>
          <h2 className="text-base font-extrabold">ประวัติผลิตล่าสุด</h2>
          {data.recentProductions.length === 0 ? (
            <p className="text-sm text-slate-500">ยังไม่มีรอบผลิต</p>
          ) : (
            <ul className="space-y-2">
              {data.recentProductions.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-slate-100 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {p.finishedProduct.name} ×{p.quantityProduced}
                      {p.quantityWasted
                        ? ` (เสีย ${p.quantityWasted})`
                        : ""}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(p.completedAt).toLocaleString("th-TH")}
                    </span>
                  </div>
                  {p.lotNumber ? (
                    <p className="text-xs text-slate-500">ล็อต {p.lotNumber}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-600">
                    ใช้{" "}
                    {p.components
                      .map(
                        (c) =>
                          `${c.product.name} ${c.quantityUsed}${c.product.unit}`,
                      )
                      .join(" · ") || "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "amber" | "sky" | "violet" | "emerald";
}) {
  const toneClass = {
    amber: "border-amber-200 from-amber-50",
    sky: "border-sky-200 from-sky-50",
    violet: "border-violet-200 from-violet-50",
    emerald: "border-emerald-200 from-emerald-50",
  }[tone];
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br to-white p-4 shadow-sm ${toneClass}`}
    >
      <p className="text-xs text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}
