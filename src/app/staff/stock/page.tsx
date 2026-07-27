"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";

type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

const STOCK_TYPE_LABELS: Record<StockType, string> = {
  SALE_ITEM: "สินค้าขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

type Product = {
  id: string;
  name: string;
  unit: string;
  stockType: StockType;
  lowStockAlert: number | null;
  trackStock?: boolean;
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

type Balance = {
  id: string;
  quantity: number;
  product: Product;
};

type CountSummary = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  _count?: { lines: number };
};

type CountLine = {
  id: string;
  brandProductId: string;
  systemQty: number;
  countedQty: number | null;
  note: string | null;
  product: Product;
};

type CountDetail = {
  id: string;
  name: string;
  status: string;
  lines: CountLine[];
};

type Payload = {
  stockActive: boolean;
  locationId: string | null;
  pending: Pending[];
  balances: Balance[];
  products: Product[];
  lowItems: Balance[];
  counts: CountSummary[];
};

type TabId =
  | "pending"
  | "low"
  | "balances"
  | "scan"
  | "stock_in"
  | "damage"
  | "issue"
  | "count";

const TABS: { id: TabId; label: string }[] = [
  { id: "pending", label: "รอรับ" },
  { id: "low", label: "ใกล้หมด" },
  { id: "balances", label: "คงเหลือ" },
  { id: "scan", label: "สแกน" },
  { id: "stock_in", label: "รับเข้า" },
  { id: "damage", label: "เสีย/สูญ" },
  { id: "issue", label: "เบิกใช้" },
  { id: "count", label: "ตรวจนับ" },
];

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";
const sectionCard = "rounded-2xl bg-white p-4 shadow-sm";

export default function StaffStockPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<TabId>("pending");

  // stock_in
  const [inProductId, setInProductId] = useState("");
  const [inQty, setInQty] = useState("1");
  const [inSupplier, setInSupplier] = useState("");
  const [inNote, setInNote] = useState("");

  // damage / lost
  const [outKind, setOutKind] = useState<"damage" | "lost">("damage");
  const [outProductId, setOutProductId] = useState("");
  const [outQty, setOutQty] = useState("1");
  const [outReason, setOutReason] = useState("");
  const [outNote, setOutNote] = useState("");

  // issue
  const [issueProductId, setIssueProductId] = useState("");
  const [issueQty, setIssueQty] = useState("1");
  const [issueNote, setIssueNote] = useState("");

  // count
  const [countName, setCountName] = useState("");
  const [activeCountId, setActiveCountId] = useState<string | null>(null);
  const [countDetail, setCountDetail] = useState<CountDetail | null>(null);
  const [countQtyMap, setCountQtyMap] = useState<Record<string, string>>({});
  const [countLoading, setCountLoading] = useState(false);

  // barcode scan
  const [scanCode, setScanCode] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<{
    id: string;
    name: string;
    unit: string;
    barcode: string | null;
    branchQty: number;
    lots: { lotNumber: string; quantity: number; expiresAt: string | null }[];
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/stock");
    if (res.status === 401) {
      router.replace("/staff/login");
      return;
    }
    if (res.status === 403 || res.status === 404) {
      setData({
        stockActive: false,
        locationId: null,
        pending: [],
        balances: [],
        products: [],
        lowItems: [],
        counts: [],
      });
      setLoading(false);
      return;
    }
    if (res.ok) {
      setData((await res.json()) as Payload);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const consumables = useMemo(
    () => (data?.products ?? []).filter((p) => p.stockType === "CONSUMABLE"),
    [data?.products],
  );

  const balancesByType = useMemo(() => {
    const groups: Record<StockType, Balance[]> = {
      SALE_ITEM: [],
      CONSUMABLE: [],
      EQUIPMENT: [],
    };
    for (const b of data?.balances ?? []) {
      const t = b.product.stockType ?? "SALE_ITEM";
      groups[t].push(b);
    }
    return groups;
  }, [data?.balances]);

  const openCount = useMemo(
    () =>
      (data?.counts ?? []).find(
        (c) => c.status === "DRAFT" || c.status === "IN_PROGRESS",
      ) ?? null,
    [data?.counts],
  );

  useEffect(() => {
    if (!data?.products?.length) return;
    if (!inProductId) setInProductId(data.products[0].id);
    if (!outProductId) setOutProductId(data.products[0].id);
  }, [data?.products, inProductId, outProductId]);

  useEffect(() => {
    if (!consumables.length) return;
    if (!issueProductId || !consumables.some((p) => p.id === issueProductId)) {
      setIssueProductId(consumables[0].id);
    }
  }, [consumables, issueProductId]);

  async function postAction(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/staff/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return null;
      }
      toast.success(okMsg);
      await load();
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function confirmReceive(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/staff/stock/transfers/${id}/receive`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("รับของไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("รับเข้าสต๊อกสาขาแล้ว");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function submitStockIn() {
    const qty = Number.parseInt(inQty, 10);
    if (!inProductId || !Number.isFinite(qty) || qty <= 0) {
      toast.error("เลือกสินค้าและจำนวนที่ถูกต้อง");
      return;
    }
    const ok = await postAction(
      {
        action: "stock_in",
        brandProductId: inProductId,
        quantity: qty,
        supplier: inSupplier.trim() || null,
        note: inNote.trim() || null,
      },
      "รับเข้าสาขาแล้ว",
    );
    if (ok) {
      setInQty("1");
      setInSupplier("");
      setInNote("");
    }
  }

  async function submitDamageLost() {
    const qty = Number.parseInt(outQty, 10);
    if (!outProductId || !Number.isFinite(qty) || qty <= 0) {
      toast.error("เลือกสินค้าและจำนวนที่ถูกต้อง");
      return;
    }
    const ok = await postAction(
      {
        action: outKind,
        brandProductId: outProductId,
        quantity: qty,
        reason: outReason.trim() || null,
        note: outNote.trim() || null,
      },
      outKind === "damage" ? "บันทึกของเสียแล้ว" : "บันทึกสูญหายแล้ว",
    );
    if (ok) {
      setOutQty("1");
      setOutReason("");
      setOutNote("");
    }
  }

  async function submitIssue() {
    const qty = Number.parseInt(issueQty, 10);
    if (!issueProductId || !Number.isFinite(qty) || qty <= 0) {
      toast.error("เลือกสินค้าและจำนวนที่ถูกต้อง");
      return;
    }
    const ok = await postAction(
      {
        action: "issue",
        brandProductId: issueProductId,
        quantity: qty,
        note: issueNote.trim() || null,
      },
      "เบิกใช้แล้ว",
    );
    if (ok) {
      setIssueQty("1");
      setIssueNote("");
    }
  }

  async function createCount() {
    const name = countName.trim() || `ตรวจนับ ${new Date().toLocaleDateString("th-TH")}`;
    const created = await postAction(
      { action: "count_create", name },
      "สร้างรอบตรวจนับแล้ว",
    );
    if (created?.id) {
      setCountName("");
      setActiveCountId(created.id);
      await loadCount(created.id);
      setTab("count");
    }
  }

  async function loadCount(id: string) {
    setCountLoading(true);
    setActiveCountId(id);
    try {
      const res = await fetch(`/api/staff/stock/counts/${id}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("โหลดตรวจนับไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      const detail = body as CountDetail;
      setCountDetail(detail);
      const map: Record<string, string> = {};
      for (const line of detail.lines) {
        map[line.brandProductId] =
          line.countedQty != null ? String(line.countedQty) : "";
      }
      setCountQtyMap(map);
    } finally {
      setCountLoading(false);
    }
  }

  async function saveCountLines(complete: boolean) {
    if (!activeCountId || !countDetail) return;
    const lines = countDetail.lines.map((line) => {
      const raw = countQtyMap[line.brandProductId];
      const n = Number.parseInt(raw ?? "", 10);
      return {
        brandProductId: line.brandProductId,
        countedQty: Number.isFinite(n) && n >= 0 ? n : 0,
      };
    });

    if (complete) {
      const missing = lines.filter((l) => {
        const raw = countQtyMap[l.brandProductId];
        return raw === undefined || raw.trim() === "";
      });
      if (missing.length > 0) {
        toast.error(`ยังนับไม่ครบ ${missing.length} รายการ`);
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/staff/stock/counts/${activeCountId}`, {
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
      if (complete) {
        setCountDetail(null);
        setActiveCountId(null);
        setCountQtyMap({});
        await load();
      } else {
        setCountDetail(body as CountDetail);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  return (
    <StaffAppShell active="stock">
      <div className="space-y-3 px-4 py-4">
        {!data.stockActive ? (
          <div className={`${sectionCard} text-center`}>
            <p className="text-sm font-bold text-slate-900">
              สาขานี้ยังไม่เปิดระบบสต๊อก
            </p>
            <p className="mt-1 text-xs text-slate-500">
              ให้แอดมินเปิดสต๊อกที่แบรนด์และสาขาก่อน
            </p>
          </div>
        ) : (
          <>
            <div className="-mx-4 overflow-x-auto px-4">
              <div className="flex w-max gap-1.5 pb-1">
                {TABS.map((t) => {
                  const badge =
                    t.id === "pending"
                      ? data.pending.length
                      : t.id === "low"
                        ? data.lowItems.length
                        : t.id === "count"
                          ? openCount
                            ? 1
                            : 0
                          : 0;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTab(t.id);
                        if (t.id === "count" && openCount && !countDetail) {
                          void loadCount(openCount.id);
                        }
                      }}
                      className={`relative shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-600 shadow-sm"
                      }`}
                    >
                      {t.label}
                      {badge > 0 ? (
                        <span
                          className={`ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                            t.id === "pending"
                              ? "bg-emerald-500 text-white"
                              : "bg-amber-500 text-white"
                          }`}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {tab === "pending" ? (
              <section className={sectionCard}>
                <h2 className="text-sm font-bold text-slate-900">
                  ของรอรับ
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  จากบ้านกลางหรือสาขาอื่น — กดยืนยันเมื่อของถึงแล้ว
                </p>
                <ul className="mt-3 divide-y divide-slate-100">
                  {data.pending.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.quantity} {item.product.unit}
                          {item.note ? ` · ${item.note}` : ""}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          จาก{" "}
                          {item.sourceBranch?.name
                            ? `สาขา ${item.sourceBranch.name}`
                            : "บ้านกลาง"}
                          {" · "}
                          {new Date(item.createdAt).toLocaleString("th-TH")}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void confirmReceive(item.id)}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {busyId === item.id ? "กำลังรับ..." : "ยืนยันรับ"}
                      </button>
                    </li>
                  ))}
                  {data.pending.length === 0 ? (
                    <li className="py-4 text-center text-sm text-slate-500">
                      ไม่มีของรอรับ
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            {tab === "scan" ? (
              <section className={sectionCard}>
                <h2 className="text-sm font-bold text-slate-900">
                  สแกนบาร์โค้ด
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  สแกนหรือพิมพ์บาร์โค้ดเพื่อดูยอดคงเหลือสาขานี้
                </p>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void (async () => {
                      const code = scanCode.trim();
                      if (!code) {
                        toast.error("ใส่บาร์โค้ด");
                        return;
                      }
                      setScanBusy(true);
                      try {
                        const res = await fetch(
                          `/api/staff/stock/barcode?barcode=${encodeURIComponent(code)}`,
                        );
                        const body = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setScanResult(null);
                          toast.error(
                            "ไม่พบสินค้า",
                            body.error ?? "ลองใหม่",
                          );
                          return;
                        }
                        setScanResult(body);
                        setInProductId(body.id);
                      } finally {
                        setScanBusy(false);
                      }
                    })();
                  }}
                >
                  <input
                    className={inputClass}
                    value={scanCode}
                    onChange={(e) => setScanCode(e.target.value)}
                    placeholder="บาร์โค้ด"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={scanBusy}
                    className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {scanBusy ? "..." : "ค้นหา"}
                  </button>
                </form>
                {scanResult ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {scanResult.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {scanResult.barcode
                        ? `บาร์โค้ด ${scanResult.barcode}`
                        : ""}
                      {" · คงเหลือ "}
                      {scanResult.branchQty} {scanResult.unit}
                    </p>
                    {scanResult.lots?.length ? (
                      <ul className="mt-2 space-y-1 text-xs text-slate-600">
                        {scanResult.lots.map((lot) => (
                          <li key={lot.lotNumber}>
                            ล็อต {lot.lotNumber}: {lot.quantity}
                            {lot.expiresAt
                              ? ` · หมด ${new Date(lot.expiresAt).toLocaleDateString("th-TH")}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      type="button"
                      className="mt-3 text-xs font-semibold text-emerald-700"
                      onClick={() => setTab("stock_in")}
                    >
                      ไปรับเข้าสินค้านี้ →
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {tab === "low" ? (
              <section className={sectionCard}>
                <h2 className="text-sm font-bold text-slate-900">ใกล้หมด</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  รายการที่หมดหรือต่ำกว่าเกณฑ์แจ้งเตือน
                </p>
                <ul className="mt-3 divide-y divide-slate-100">
                  {data.lowItems.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {b.product.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {STOCK_TYPE_LABELS[b.product.stockType] ??
                            b.product.stockType}
                          {b.product.lowStockAlert != null
                            ? ` · แจ้งเตือน ≤ ${b.product.lowStockAlert}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-sm font-bold ${
                          b.quantity <= 0 ? "text-red-600" : "text-amber-600"
                        }`}
                      >
                        {b.quantity} {b.product.unit}
                      </span>
                    </li>
                  ))}
                  {data.lowItems.length === 0 ? (
                    <li className="py-4 text-center text-sm text-slate-500">
                      ไม่มีรายการใกล้หมด
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            {tab === "balances" ? (
              <section className={sectionCard}>
                <h2 className="text-sm font-bold text-slate-900">คงเหลือ</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  สต๊อกปัจจุบันที่สาขา แยกตามประเภท
                </p>
                {(
                  ["SALE_ITEM", "CONSUMABLE", "EQUIPMENT"] as StockType[]
                ).map((type) => {
                  const rows = balancesByType[type];
                  if (!rows.length) return null;
                  return (
                    <div key={type} className="mt-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        {STOCK_TYPE_LABELS[type]}
                      </p>
                      <ul className="mt-1 divide-y divide-slate-100">
                        {rows.map((b) => (
                          <li
                            key={b.id}
                            className="flex items-center justify-between py-2"
                          >
                            <span className="text-sm text-slate-800">
                              {b.product.name}
                            </span>
                            <span
                              className={`font-mono text-sm font-bold ${
                                b.quantity <= 0
                                  ? "text-red-600"
                                  : "text-slate-900"
                              }`}
                            >
                              {b.quantity} {b.product.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {data.balances.length === 0 ? (
                  <p className="mt-4 py-2 text-center text-sm text-slate-500">
                    ยังไม่มีของในสาขา
                  </p>
                ) : null}
              </section>
            ) : null}

            {tab === "stock_in" ? (
              <section className={sectionCard}>
                <h2 className="text-sm font-bold text-slate-900">
                  รับเข้าสาขา
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  รับของเข้าสต๊อกสาขาโดยตรง (ไม่ผ่านบ้านกลาง)
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={labelClass}>สินค้า</label>
                    <select
                      className={inputClass}
                      value={inProductId}
                      onChange={(e) => setInProductId(e.target.value)}
                    >
                      {data.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({STOCK_TYPE_LABELS[p.stockType]}) · {p.unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>จำนวน</label>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className={inputClass}
                      value={inQty}
                      onChange={(e) => setInQty(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ผู้จำหน่าย (ถ้ามี)</label>
                    <input
                      className={inputClass}
                      value={inSupplier}
                      onChange={(e) => setInSupplier(e.target.value)}
                      placeholder="ชื่อร้าน / บริษัท"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>หมายเหตุ</label>
                    <input
                      className={inputClass}
                      value={inNote}
                      onChange={(e) => setInNote(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy || !data.products.length}
                    onClick={() => void submitStockIn()}
                    className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {busy ? "กำลังบันทึก..." : "บันทึกรับเข้า"}
                  </button>
                </div>
              </section>
            ) : null}

            {tab === "damage" ? (
              <section className={sectionCard}>
                <h2 className="text-sm font-bold text-slate-900">
                  เสีย / สูญหาย
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  ตัดสต๊อกเมื่อของเสียหรือสูญหาย
                </p>
                <div className="mt-3 flex gap-2">
                  {(
                    [
                      { id: "damage" as const, label: "เสียหาย" },
                      { id: "lost" as const, label: "สูญหาย" },
                    ] as const
                  ).map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setOutKind(k.id)}
                      className={`flex-1 rounded-xl py-2 text-xs font-bold ${
                        outKind === k.id
                          ? "bg-red-600 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={labelClass}>สินค้า</label>
                    <select
                      className={inputClass}
                      value={outProductId}
                      onChange={(e) => setOutProductId(e.target.value)}
                    >
                      {data.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>จำนวน</label>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className={inputClass}
                      value={outQty}
                      onChange={(e) => setOutQty(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>สาเหตุ</label>
                    <input
                      className={inputClass}
                      value={outReason}
                      onChange={(e) => setOutReason(e.target.value)}
                      placeholder="เช่น หมดอายุ / แตก"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>หมายเหตุ</label>
                    <input
                      className={inputClass}
                      value={outNote}
                      onChange={(e) => setOutNote(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy || !data.products.length}
                    onClick={() => void submitDamageLost()}
                    className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {busy
                      ? "กำลังบันทึก..."
                      : outKind === "damage"
                        ? "บันทึกของเสีย"
                        : "บันทึกสูญหาย"}
                  </button>
                </div>
              </section>
            ) : null}

            {tab === "issue" ? (
              <section className={sectionCard}>
                <h2 className="text-sm font-bold text-slate-900">เบิกใช้</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  เบิกของสิ้นเปลืองออกจากสต๊อกสาขา
                </p>
                {consumables.length === 0 ? (
                  <p className="mt-4 py-2 text-center text-sm text-slate-500">
                    ยังไม่มีสินค้าประเภทของสิ้นเปลือง
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className={labelClass}>ของสิ้นเปลือง</label>
                      <select
                        className={inputClass}
                        value={issueProductId}
                        onChange={(e) => setIssueProductId(e.target.value)}
                      >
                        {consumables.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.unit}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>จำนวน</label>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        className={inputClass}
                        value={issueQty}
                        onChange={(e) => setIssueQty(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>หมายเหตุ</label>
                      <input
                        className={inputClass}
                        value={issueNote}
                        onChange={(e) => setIssueNote(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submitIssue()}
                      className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {busy ? "กำลังบันทึก..." : "บันทึกเบิกใช้"}
                    </button>
                  </div>
                )}
              </section>
            ) : null}

            {tab === "count" ? (
              <section className={sectionCard}>
                <h2 className="text-sm font-bold text-slate-900">ตรวจนับ</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  สร้างรอบตรวจนับ กรอกยอดจริง แล้วปิดรอบเพื่อปรับสต๊อก
                </p>

                {!countDetail ? (
                  <div className="mt-3 space-y-3">
                    {openCount ? (
                      <button
                        type="button"
                        disabled={countLoading}
                        onClick={() => void loadCount(openCount.id)}
                        className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-left"
                      >
                        <p className="text-sm font-bold text-emerald-900">
                          รอบเปิดอยู่: {openCount.name}
                        </p>
                        <p className="mt-0.5 text-xs text-emerald-700">
                          {openCount._count?.lines ?? "—"} รายการ · กดเพื่อกรอกยอด
                        </p>
                      </button>
                    ) : null}

                    {(data.counts ?? []).length > 0 && !openCount ? (
                      <p className="text-xs text-slate-500">
                        ไม่มีรอบเปิด — สร้างรอบใหม่ด้านล่าง
                      </p>
                    ) : null}

                    <div>
                      <label className={labelClass}>ชื่อรอบตรวจนับ</label>
                      <input
                        className={inputClass}
                        value={countName}
                        onChange={(e) => setCountName(e.target.value)}
                        placeholder={`ตรวจนับ ${new Date().toLocaleDateString("th-TH")}`}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy || Boolean(openCount)}
                      onClick={() => void createCount()}
                      className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {busy
                        ? "กำลังสร้าง..."
                        : openCount
                          ? "มีรอบเปิดอยู่แล้ว"
                          : "สร้างรอบตรวจนับ"}
                    </button>
                  </div>
                ) : countLoading ? (
                  <div className="mt-4">
                    <LoadingState className="w-full" />
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {countDetail.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {countDetail.lines.length} รายการ
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-slate-500"
                        onClick={() => {
                          setCountDetail(null);
                          setActiveCountId(null);
                        }}
                      >
                        ปิด
                      </button>
                    </div>

                    <ul className="divide-y divide-slate-100">
                      {countDetail.lines.map((line) => (
                        <li
                          key={line.id}
                          className="flex items-center gap-2 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {line.product.name}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              ในระบบ {line.systemQty} {line.product.unit}
                            </p>
                          </div>
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center font-mono text-sm"
                            placeholder="นับ"
                            value={countQtyMap[line.brandProductId] ?? ""}
                            onChange={(e) =>
                              setCountQtyMap((prev) => ({
                                ...prev,
                                [line.brandProductId]: e.target.value,
                              }))
                            }
                          />
                        </li>
                      ))}
                    </ul>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveCountLines(false)}
                        className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-800 disabled:opacity-60"
                      >
                        บันทึก
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveCountLines(true)}
                        className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                      >
                        ปิดรอบ
                      </button>
                    </div>
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </StaffAppShell>
  );
}
