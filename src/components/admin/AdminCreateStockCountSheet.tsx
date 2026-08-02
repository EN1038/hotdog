"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  stockType: StockType;
  quantity: number;
};

type Props = {
  branchId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const TYPE_OPTIONS: { id: StockType; label: string; hint: string }[] = [
  {
    id: "SALE_ITEM",
    label: "เมนูขาย",
    hint: "รอ Convert หรือปรับทันที",
  },
  {
    id: "CONSUMABLE",
    label: "ของสิ้นเปลือง",
    hint: "ปรับสต๊อกทันที",
  },
  {
    id: "EQUIPMENT",
    label: "อุปกรณ์",
    hint: "ปรับสต๊อกทันที",
  },
];

export function AdminCreateStockCountSheet({
  branchId,
  open,
  onClose,
  onCreated,
}: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [stockType, setStockType] = useState<StockType>("SALE_ITEM");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [docName, setDocName] = useState("");
  const [note, setNote] = useState("");
  const [cash, setCash] = useState("0");
  const [transfer, setTransfer] = useState("0");
  const [change, setChange] = useState("0");
  const [customers, setCustomers] = useState("0");
  const [saving, setSaving] = useState(false);
  const [showChangedOnly, setShowChangedOnly] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/stock`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "โหลดรายการสต๊อกไม่สำเร็จ");
        return;
      }
      const balances: Array<{
        id: string;
        quantity: number;
        product: {
          id: string;
          name: string;
          unit: string;
          stockType: StockType;
        };
      }> = body.balances || [];
      const items: CatalogItem[] = balances.map((b) => ({
        id: b.product?.id || b.id,
        name: b.product?.name || "—",
        unit: b.product?.unit || "ชิ้น",
        stockType: b.product?.stockType || "SALE_ITEM",
        quantity: b.quantity ?? 0,
      }));
      setCatalog(items);
      const next: Record<string, string> = {};
      for (const item of items) {
        next[item.id] = String(item.quantity);
      }
      setQtys(next);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoadingCatalog(false);
    }
  }, [branchId, toast]);

  useEffect(() => {
    if (!open) return;
    setStockType("SALE_ITEM");
    setQ("");
    setDocName("");
    setNote("");
    setCash("0");
    setTransfer("0");
    setChange("0");
    setCustomers("0");
    setShowChangedOnly(false);
    void loadCatalog();
  }, [open, loadCatalog]);

  const typedItems = useMemo(
    () => catalog.filter((i) => i.stockType === stockType),
    [catalog, stockType],
  );

  const mismatchCount = useMemo(() => {
    let n = 0;
    for (const item of typedItems) {
      const counted = Math.max(0, Math.floor(Number(qtys[item.id]) || 0));
      if (counted !== item.quantity) n += 1;
    }
    return n;
  }, [typedItems, qtys]);

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return typedItems.filter((item) => {
      if (needle && !item.name.toLowerCase().includes(needle)) return false;
      if (!showChangedOnly) return true;
      const counted = Math.max(0, Math.floor(Number(qtys[item.id]) || 0));
      return counted !== item.quantity;
    });
  }, [typedItems, q, showChangedOnly, qtys]);

  function resetToSystem() {
    const next: Record<string, string> = { ...qtys };
    for (const item of typedItems) {
      next[item.id] = String(item.quantity);
    }
    setQtys(next);
    toast.success("ตั้งยอดตามระบบแล้ว");
  }

  function zeroAll() {
    const next: Record<string, string> = { ...qtys };
    for (const item of typedItems) {
      next[item.id] = "0";
    }
    setQtys(next);
  }

  async function submit(applyNow: boolean) {
    if (typedItems.length === 0) {
      toast.error("ไม่มีรายการในประเภทนี้");
      return;
    }

    const typeLabel =
      TYPE_OPTIONS.find((t) => t.id === stockType)?.label ?? stockType;
    const ok = await confirm({
      title: applyNow
        ? "บันทึกเอกสารและปรับสต๊อกเลย?"
        : "บันทึกเอกสารยอดนับรอ Convert?",
      message: applyNow
        ? `จะสร้างเอกสาร${typeLabel} และตั้งยอดสต๊อกตามจำนวนที่กรอก (ADJUST)${
            mismatchCount > 0 ? ` · ยอดต่าง ${mismatchCount} รายการ` : ""
          }`
        : `จะสร้างเอกสาร${typeLabel} รอ Convert → ADJUST ภายหลัง (ยังไม่แตะสต๊อก)`,
      confirmLabel: applyNow ? "บันทึกและปรับสต๊อก" : "บันทึกรอ Convert",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const lines = typedItems.map((item) => ({
        itemId: item.id,
        countedQty: Math.max(0, Math.floor(Number(qtys[item.id]) || 0)),
      }));
      const res = await fetch(`/api/admin/branches/${branchId}/stock/counts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockType,
          applyNow,
          name: docName.trim() || undefined,
          note: note.trim() || null,
          cash: Number(cash) || 0,
          transfer: Number(transfer) || 0,
          change: Number(change) || 0,
          customers: Math.floor(Number(customers) || 0),
          lines,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "สร้างเอกสารไม่สำเร็จ");
        return;
      }
      toast.success(
        applyNow
          ? `บันทึกและปรับสต๊อกแล้ว${
              typeof body.adjustedItemCount === "number"
                ? ` · ADJUST ${body.adjustedItemCount} รายการ`
                : ""
            }`
          : "สร้างเอกสารรอ Convert แล้ว",
      );
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        onClick={() => (!saving ? onClose() : undefined)}
        aria-hidden
      />
      <div className="relative z-10 flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              สร้างเอกสารยอดนับ
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              กรอกยอดตั้งตามที่นับได้ แล้วเลือกบันทึกรอ Convert หรือปรับสต๊อกทันที
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
          >
            ปิด
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {/* Type segmented */}
          <div>
            <p className={`${adminLabelClass} mb-1.5`}>ประเภทสต๊อก</p>
            <div className="grid grid-cols-3 gap-1.5">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={saving}
                  onClick={() => setStockType(t.id)}
                  className={`rounded-xl px-2 py-2.5 text-center transition ${
                    stockType === t.id
                      ? "bg-site-primary text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <span className="block text-xs font-bold sm:text-sm">
                    {t.label}
                  </span>
                  <span
                    className={`mt-0.5 block text-[10px] ${
                      stockType === t.id ? "text-white/80" : "text-slate-400"
                    }`}
                  >
                    {t.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={adminLabelClass}>ชื่อเอกสาร (ไม่บังคับ)</label>
            <input
              className={adminInputClass}
              value={docName}
              disabled={saving}
              placeholder="เช่น ตรวจนับพิเศษรอบบ่าย"
              onChange={(e) => setDocName(e.target.value)}
            />
          </div>

          {stockType === "SALE_ITEM" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold text-slate-600">
                ยอดขาย (ถ้ามี)
              </p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {(
                  [
                    ["เงินสด", cash, setCash],
                    ["เงินโอน", transfer, setTransfer],
                    ["เงินทอน", change, setChange],
                    ["ลูกค้า (คิว)", customers, setCustomers],
                  ] as const
                ).map(([label, value, setter]) => (
                  <div key={label}>
                    <label className={adminLabelClass}>{label}</label>
                    <input
                      type="number"
                      min={0}
                      className={adminInputClass}
                      value={value}
                      disabled={saving}
                      onChange={(e) => setter(e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label className={adminLabelClass}>หมายเหตุ</label>
            <input
              className={adminInputClass}
              value={note}
              disabled={saving}
              placeholder="เหตุผลการนับ / ปรับยอด"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
            <input
              type="search"
              className={`${adminInputClass} min-w-[10rem] flex-1`}
              value={q}
              disabled={saving || loadingCatalog}
              placeholder="ค้นหาชื่อรายการ…"
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              type="button"
              disabled={saving || loadingCatalog}
              onClick={resetToSystem}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              ใช้ยอดระบบ
            </button>
            <button
              type="button"
              disabled={saving || loadingCatalog}
              onClick={zeroAll}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              เคลียร์เป็น 0
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 px-1 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={showChangedOnly}
                onChange={(e) => setShowChangedOnly(e.target.checked)}
              />
              เฉพาะที่ยอดเปลี่ยน
            </label>
          </div>

          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>
              {typedItems.length} รายการ
              {filteredItems.length !== typedItems.length
                ? ` · แสดง ${filteredItems.length}`
                : ""}
            </span>
            <span
              className={
                mismatchCount > 0 ? "text-amber-700" : "text-emerald-700"
              }
            >
              {mismatchCount > 0
                ? `ยอดต่าง ${mismatchCount} รายการ`
                : "ยอดตรงกับระบบทั้งหมด"}
            </span>
          </div>

          {loadingCatalog ? (
            <p className="py-10 text-center text-sm text-slate-500">
              กำลังโหลดรายการ…
            </p>
          ) : filteredItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {typedItems.length === 0
                ? "ไม่มีรายการในประเภทนี้"
                : "ไม่มีรายการตามตัวกรอง"}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">รายการ</th>
                    <th className="px-3 py-2.5 text-right font-semibold">
                      ระบบ
                    </th>
                    <th className="px-3 py-2.5 text-right font-semibold">
                      ยอดตั้ง
                    </th>
                    <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">
                      ต่าง
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => {
                    const counted = Math.max(
                      0,
                      Math.floor(Number(qtys[item.id]) || 0),
                    );
                    const diff = counted - item.quantity;
                    const isDiff = diff !== 0;
                    return (
                      <tr
                        key={item.id}
                        className={isDiff ? "bg-amber-50/80" : "bg-white"}
                      >
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {item.name}
                          <span className="ml-1 text-xs font-normal text-slate-400">
                            {item.unit}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            disabled={saving}
                            className={`${adminInputClass} ml-auto max-w-[6.5rem] text-right`}
                            value={qtys[item.id] ?? "0"}
                            onChange={(e) =>
                              setQtys((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                          />
                        </td>
                        <td
                          className={`hidden px-3 py-2 text-right text-xs font-bold tabular-nums sm:table-cell ${
                            isDiff ? "text-amber-800" : "text-slate-300"
                          }`}
                        >
                          {diff > 0 ? "+" : ""}
                          {diff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:justify-end sm:px-5">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="order-last rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:order-first"
          >
            ยกเลิก
          </button>
          {stockType === "SALE_ITEM" ? (
            <button
              type="button"
              disabled={saving || loadingCatalog || typedItems.length === 0}
              onClick={() => void submit(false)}
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              {saving ? "กำลังบันทึก…" : "บันทึกรอ Convert"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving || loadingCatalog || typedItems.length === 0}
            onClick={() => void submit(true)}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving
              ? "กำลังบันทึก…"
              : stockType === "SALE_ITEM"
                ? "บันทึกและ Convert ทันที"
                : "บันทึกและปรับสต๊อก"}
          </button>
        </div>
      </div>
    </div>
  );
}
