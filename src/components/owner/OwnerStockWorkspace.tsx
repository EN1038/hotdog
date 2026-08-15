"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  OwnerAppShell,
  useOwnerDashboard,
} from "@/components/owner/OwnerAppShell";
import { useToast } from "@/components/admin/Toast";

const STOCK_TYPE_LABELS: Record<string, string> = {
  SALE_ITEM: "สินค้าขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

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

type StockTypeId = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

type ProductRow = {
  id: string;
  name: string;
  unit: string;
  stockType: StockTypeId;
  isActive: boolean;
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

type MovementRow = {
  id: string;
  type: string;
  quantity: number;
  afterQty: number | null;
  note: string | null;
  createdAt: string;
  product: { id: string; name: string; unit: string };
};

type WarehouseBranch = {
  id: string;
  name: string;
  warehouseIssueMode: "TRANSFER" | "ISSUE" | "BOTH";
  warehouseAllowedBranchIds: string[];
};

type StockPayload = {
  brand: { id: string; name: string; stockEnabled: boolean };
  warehouse: Warehouse | null;
  warehouseBranch: WarehouseBranch | null;
  products: ProductRow[];
  branches: BranchRow[];
  recentMovements: MovementRow[];
};

type TabId = "balance" | "record" | "history";
type SheetKind =
  | "product"
  | "receive"
  | "produce"
  | "out"
  | "settings"
  | null;
type OutKind = "transfer" | "direct" | "waste" | "sale" | "other";

const OUT_OPTIONS: { id: OutKind; label: string; hint: string }[] = [
  { id: "transfer", label: "ส่งสาขา", hint: "โอนจากสต๊อกกลางไปสาขา" },
  { id: "direct", label: "ส่งตรง", hint: "จ่ายออกโดยไม่ผ่านสาขา" },
  { id: "waste", label: "เสีย", hint: "ของเสีย / ใช้ไม่ได้" },
  { id: "sale", label: "ขาย", hint: "ขายออกจากสต๊อกกลาง" },
  { id: "other", label: "จ่ายอื่นๆ", hint: "เบิกใช้ หรือจ่ายนอกประเภท" },
];

function movementLabel(row: MovementRow) {
  if (row.note?.startsWith("เสียบไม้")) return "เสียบไม้";
  if (row.note?.startsWith("ส่งตรง")) return "ส่งตรง";
  return MOVEMENT_TYPE_LABELS[row.type] ?? row.type;
}

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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

  const [tab, setTab] = useState<TabId>("balance");
  const [payload, setPayload] = useState<StockPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);

  const [productName, setProductName] = useState("");
  const [productUnit, setProductUnit] = useState("ไม้");
  const [productType, setProductType] = useState<StockTypeId>("SALE_ITEM");

  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [outKind, setOutKind] = useState<OutKind>("transfer");
  const [branchId, setBranchId] = useState("");
  const [autoReceive, setAutoReceive] = useState(false);
  const [hqName, setHqName] = useState("");
  const [issueMode, setIssueMode] = useState<"TRANSFER" | "ISSUE" | "BOTH">(
    "TRANSFER",
  );
  const [allowedIds, setAllowedIds] = useState<string[]>([]);

  const warehouse = payload?.warehouse ?? null;
  const hq = payload?.warehouseBranch ?? null;
  const products = useMemo(
    () => (payload?.products ?? []).filter((p) => p.isActive !== false),
    [payload],
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

  function resetForm() {
    setQty("");
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
    setBusy(true);
    try {
      const res = await fetch(`${stockApiBase}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productName.trim(),
          unit: productUnit.trim() || "ชิ้น",
          stockType: productType,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "เพิ่มสินค้าไม่สำเร็จ");
      toast.success("เพิ่มรายการแล้ว");
      setProductName("");
      if (typeof body.id === "string") setItemId(body.id);
      closeSheet();
      await load();
    } catch (e) {
      toast.error("เพิ่มสินค้าไม่สำเร็จ", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function postMovement(body: Record<string, unknown>, okMsg: string) {
    if (!brandId) return;
    const quantity = Number(qty);
    if (!itemId || quantity <= 0) {
      toast.error("เลือกสินค้าและจำนวน");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${stockApiBase}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          brandProductId: itemId,
          quantity,
          note: note.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      toast.success(okMsg);
      closeSheet();
      setTab("history");
      await load();
    } catch (e) {
      toast.error("บันทึกไม่สำเร็จ", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function submitSheet() {
    if (sheet === "product") {
      await createProduct();
      return;
    }
    if (sheet === "receive") {
      await postMovement({ action: "receive" }, "นำเข้าสต๊อกกลางแล้ว");
      return;
    }
    if (sheet === "produce") {
      await postMovement({ action: "produce" }, "บันทึกเสียบไม้แล้ว");
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
      return;
    }
    if (sheet === "out") {
      const loc = warehouse?.id;
      if (!loc) {
        toast.error("ยังไม่มีสต๊อกกลาง");
        return;
      }
      if (outKind === "transfer") {
        if (!branchId) {
          toast.error("เลือกสาขาปลายทาง");
          return;
        }
        await postMovement(
          {
            action: "transfer",
            branchId,
            autoReceive:
              issueMode === "ISSUE" ||
              (issueMode === "BOTH" && autoReceive),
          },
          issueMode === "ISSUE" || autoReceive
            ? "จ่ายเข้าสาขาแล้ว"
            : "สร้างรายการโอนรอสาขารับแล้ว",
        );
        return;
      }
      const action =
        outKind === "waste"
          ? "waste"
          : outKind === "sale"
            ? "sale"
            : outKind === "direct"
              ? "direct"
              : "issue";
      const ok =
        outKind === "waste"
          ? "บันทึกของเสียแล้ว"
          : outKind === "sale"
            ? "บันทึกขายแล้ว"
            : outKind === "direct"
              ? "บันทึกส่งตรงแล้ว"
              : "บันทึกจ่ายออกแล้ว";
      await postMovement({ action, stockLocationId: loc }, ok);
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
    <div className="px-4 pb-6 pt-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[20px] font-black text-slate-900">
            {hq?.name || warehouse?.name || "สต๊อกกลาง"}
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-slate-500">
            ไม่มีเมนูขาย · {products.length} รายการสต๊อก
          </p>
        </div>
        {canManageSettings ? (
          <button
            type="button"
            onClick={() => setSheet("settings")}
            className="shrink-0 rounded-full bg-white px-3 py-2 text-[13px] font-bold text-slate-700 shadow-sm"
          >
            ตั้งชื่อ/สิทธิ์
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex rounded-full bg-slate-100 p-1.5">
        {(
          [
            { id: "balance", label: "คงเหลือ" },
            { id: "record", label: "บันทึก" },
            { id: "history", label: "ประวัติ" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex-1 rounded-full py-2.5 text-[14px] font-extrabold ${
              tab === item.id
                ? "bg-site-primary text-white shadow-sm"
                : "text-slate-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "balance" ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setSheet("product")}
            className="w-full rounded-2xl border border-dashed border-site-primary/40 bg-white px-4 py-3 text-[14px] font-bold text-site-primary"
          >
            + เพิ่มรายการสินค้า
          </button>
          {products.length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
              ยังไม่มีรายการ — เพิ่มสินค้า แล้วกดแท็บบันทึกเพื่อนำเข้ายอด
            </p>
          ) : (
            products.map((p) => {
              const quantity = qtyByProduct.get(p.id) ?? 0;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm"
                >
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-[16px] font-extrabold text-slate-900">
                      {p.name}
                    </p>
                    <p className="text-[12px] font-semibold text-slate-500">
                      {STOCK_TYPE_LABELS[p.stockType] ?? p.stockType}
                    </p>
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
      ) : null}

      {tab === "record" ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setSheet("receive")}
            className="w-full rounded-2xl bg-white px-4 py-4 text-left shadow-sm"
          >
            <p className="text-[17px] font-black text-slate-900">นำเข้า</p>
            <p className="mt-1 text-[13px] text-slate-500">
              บันทึกยอดที่มีอยู่ หรือรับวัตถุดิบเข้าสต๊อกกลาง
            </p>
          </button>
          <button
            type="button"
            onClick={() => setSheet("produce")}
            className="w-full rounded-2xl bg-site-primary px-4 py-4 text-left text-white shadow-sm"
          >
            <p className="text-[17px] font-black">เสียบไม้</p>
            <p className="mt-1 text-[13px] text-white/85">
              แต่ละรอบเสียบ — จำนวนที่นำเข้าสต๊อกกลาง
            </p>
          </button>
          <button
            type="button"
            onClick={() => setSheet("out")}
            className="w-full rounded-2xl bg-white px-4 py-4 text-left shadow-sm"
          >
            <p className="text-[17px] font-black text-slate-900">จ่ายออก</p>
            <p className="mt-1 text-[13px] text-slate-500">
              {canManageSettings
                ? "ส่งสาขา · ส่งตรง · เสีย · ขาย · จ่ายอื่นๆ"
                : "ส่งสาขา · ส่งตรง · เสีย · จ่ายอื่นๆ"}
            </p>
          </button>
        </div>
      ) : null}

      {tab === "history" ? (
        <ul className="space-y-2">
          {(payload.recentMovements ?? []).length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
              ยังไม่มีรายการเคลื่อนไหว
            </p>
          ) : (
            payload.recentMovements.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-site-primary">
                      {movementLabel(row)}
                    </p>
                    <p className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                      {row.product.name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {formatWhen(row.createdAt)}
                      {row.note ? ` · ${row.note}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-[17px] font-black tabular-nums text-slate-900">
                    {row.quantity.toLocaleString("th-TH")}
                    <span className="ml-1 text-[11px] font-bold text-slate-400">
                      {row.product.unit}
                    </span>
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
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
                ? "เพิ่มรายการสินค้า"
                : sheet === "settings"
                  ? "ตั้งชื่อและสิทธิ์สต๊อกกลาง"
                  : sheet === "receive"
                    ? "นำเข้าสต๊อกกลาง"
                    : sheet === "produce"
                      ? "บันทึกเสียบไม้"
                      : "จ่ายออก"}
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
                      <option value="SALE_ITEM">สินค้าขาย / ไม้</option>
                      <option value="CONSUMABLE">วัตถุดิบ / สิ้นเปลือง</option>
                      <option value="EQUIPMENT">อุปกรณ์</option>
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
                {sheet === "out" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {outOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setOutKind(opt.id)}
                        className={`rounded-xl px-3 py-2.5 text-left ${
                          outKind === opt.id
                            ? "bg-site-primary text-white"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        <span className="block text-[13px] font-extrabold">
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                    สินค้า
                  </span>
                  <select
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[15px] font-bold"
                  >
                    {products.length === 0 ? (
                      <option value="">ยังไม่มีสินค้า — เพิ่มรายการก่อน</option>
                    ) : (
                      products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.unit})
                        </option>
                      ))
                    )}
                  </select>
                </label>

                {sheet === "out" && outKind === "transfer" ? (
                  <>
                    <label className="mt-3 block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                        ส่งไปสาขา
                      </span>
                      <select
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[15px] font-bold"
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
                        className="mt-3 w-full rounded-xl bg-slate-100 px-3 py-3 text-left"
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
                  <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                    จำนวน
                  </span>
                  <input
                    inputMode="numeric"
                    value={qty}
                    onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[18px] font-black tabular-nums outline-none focus:border-site-primary"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-slate-500">
                    หมายเหตุ (ถ้ามี)
                  </span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      sheet === "produce" ? "เช่น รอบเช้า / คนเสียบ" : ""
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-site-primary"
                  />
                </label>
              </>
            )}

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
  const { data, loading } = useOwnerDashboard();
  const brandId = data?.brand?.id;
  return (
    <OwnerAppShell active="home">
      <div className="px-4 pt-3">
        <Link
          href="/owner"
          className="text-sm font-semibold text-site-primary"
        >
          ‹ กลับงานวันนี้
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
    </OwnerAppShell>
  );
}
