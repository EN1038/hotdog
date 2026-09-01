"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { DateInput } from "@/components/DateInput";
import { bangkokDateKey } from "@/lib/constants";
import { resolveSkewerMenuImageUrl } from "@/lib/skewer-order";
import {
  formatPackageQtyLabel,
  resolveMenuItemPackageUnit,
} from "@/lib/stock-package-unit";
import {
  formatThaiDateKey,
  planLotNumbersForRows,
} from "@/lib/stock-label-format";
import { openPackageLabelPrint } from "@/lib/stock-package-label-print";
import { IconPrinter } from "@/components/icons";

type MenuItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
  skewerImageUrl?: string | null;
  itemCode?: string | null;
  stockQuantity?: number | null;
  quantityUnit?: string | null;
  sticksPerUnit?: number | null;
  countsAsSticks?: boolean | null;
  optionGroups?: Array<{ mode?: string }> | null;
  category?: { name: string } | null;
};

type ConsumableItem = {
  id: string;
  name: string;
  unit: string;
  imageUrl?: string | null;
  itemCode?: string | null;
};

type PackageRow = {
  key: string;
  itemId: string;
  quantity: number;
  producedAt: string;
  receivedAt: string;
  stickerCopies: number;
  printSticker: boolean;
  expanded: boolean;
};

type MetaPayload = {
  stockActive: boolean;
  brandName?: string | null;
  sourceBranches: Array<{ id: string; name: string }>;
  defaultSourceId?: string | null;
  producedAt?: string;
};

function newRowKey() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPackageRow(patch?: Partial<PackageRow>): PackageRow {
  const today = bangkokDateKey();
  return {
    key: newRowKey(),
    itemId: "",
    quantity: 1,
    producedAt: today,
    receivedAt: today,
    stickerCopies: 1,
    printSticker: true,
    expanded: false,
    ...patch,
  };
}

function menuThumb(item: MenuItem | ConsumableItem | undefined) {
  if (!item) return null;
  if ("skewerImageUrl" in item || "quantityUnit" in item) {
    return resolveSkewerMenuImageUrl(item as MenuItem);
  }
  return item.imageUrl?.trim() || null;
}

function rowItemUnit(
  itemId: string,
  menuById: Map<string, MenuItem>,
  consumableById: Map<string, ConsumableItem>,
): string {
  const menu = menuById.get(itemId);
  if (menu) return resolveMenuItemPackageUnit(menu);
  const consumable = consumableById.get(itemId);
  if (consumable) return consumable.unit.trim() || "ชิ้น";
  return "ชิ้น";
}

type ScannedItemMeta = {
  name: string;
  productCode: string;
};

type PackageInPrefill = {
  itemId: string;
  name: string;
  productCode: string;
};

type Props = {
  onBack: () => void;
  onSuccess?: (batchId: string) => void;
  prefillItem?: PackageInPrefill | null;
  onPrefillApplied?: () => void;
};

export function StaffPackageInPanel({
  onBack,
  onSuccess,
  prefillItem,
  onPrefillApplied,
}: Props) {
  const toast = useToast();
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [consumableItems, setConsumableItems] = useState<ConsumableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRowKey, setPickerRowKey] = useState<string | null>(null);
  const [menuQ, setMenuQ] = useState("");

  const [sourceBranchId, setSourceBranchId] = useState<string>("");
  const [rows, setRows] = useState<PackageRow[]>([createPackageRow()]);
  const [lotCountsByDay, setLotCountsByDay] = useState<Record<string, number>>(
    {},
  );
  const [scannedItems, setScannedItems] = useState<
    Record<string, ScannedItemMeta>
  >({});
  const lastPrefillIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [metaRes, menuRes] = await Promise.all([
        fetch("/api/staff/stock/package-in"),
        fetch("/api/staff/menu?imageMode=skewer&packageIn=1"),
      ]);
      const metaBody = await metaRes.json().catch(() => ({}));
      const menuBody = await menuRes.json().catch(() => ({}));
      if (!metaRes.ok) {
        throw new Error(
          typeof metaBody.error === "string"
            ? metaBody.error
            : "โหลดข้อมูลไม่สำเร็จ",
        );
      }
      setMeta(metaBody as MetaPayload);
      if (metaBody.defaultSourceId) {
        setSourceBranchId(metaBody.defaultSourceId);
      }
      const items = Array.isArray(menuBody.menuItems)
        ? (menuBody.menuItems as MenuItem[])
        : [];
      setMenuItems(
        items.filter(
          (item) =>
            item.category?.name !== undefined &&
            !(item.optionGroups ?? []).some((g) => g.mode === "FROM_MENU"),
        ),
      );
      const consumables = Array.isArray(menuBody.consumables)
        ? (menuBody.consumables as ConsumableItem[])
        : [];
      setConsumableItems(consumables);
    } catch (e) {
      toast.error(
        "โหลดไม่สำเร็จ",
        e instanceof Error ? e.message : "ลองใหม่",
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const producedDaysKey = useMemo(
    () =>
      [...new Set(rows.map((r) => r.producedAt))]
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort()
        .join(","),
    [rows],
  );

  useEffect(() => {
    if (!producedDaysKey || !meta?.stockActive) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/staff/stock/package-in?lotDays=${encodeURIComponent(producedDaysKey)}`,
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const counts = body.lotCountsByDay;
        if (counts && typeof counts === "object") {
          setLotCountsByDay(counts as Record<string, number>);
        }
      } catch {
        // keep previous counts on transient errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [producedDaysKey, meta?.stockActive]);

  const lotByRowKey = useMemo(() => {
    const planned = planLotNumbersForRows(rows, lotCountsByDay);
    const map = new Map<string, string>();
    rows.forEach((row, index) => {
      map.set(row.key, planned[index] ?? "—");
    });
    return map;
  }, [rows, lotCountsByDay]);

  const willPrintAny = useMemo(
    () => rows.some((r) => r.printSticker && r.stickerCopies > 0),
    [rows],
  );

  const menuById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of menuItems) map.set(item.id, item);
    return map;
  }, [menuItems]);

  const consumableById = useMemo(() => {
    const map = new Map<string, ConsumableItem>();
    for (const item of consumableItems) map.set(item.id, item);
    return map;
  }, [consumableItems]);

  const itemById = useMemo(() => {
    const map = new Map<string, MenuItem | ConsumableItem>();
    for (const item of menuItems) map.set(item.id, item);
    for (const item of consumableItems) map.set(item.id, item);
    return map;
  }, [menuItems, consumableItems]);

  const applyItemToRows = useCallback((itemId: string, itemName: string) => {
    setRows((prev) => {
      const empty = prev.find((row) => !row.itemId);
      const lastSame = [...prev].reverse().find((row) => row.itemId === itemId);
      if (lastSame && !empty) {
        return prev.map((row) =>
          row.key === lastSame.key
            ? { ...row, quantity: row.quantity + 1, expanded: true }
            : { ...row, expanded: false },
        );
      }
      if (empty) {
        return prev.map((row) =>
          row.key === empty.key
            ? { ...row, itemId, expanded: true }
            : { ...row, expanded: false },
        );
      }
      return [
        ...prev.map((row) => ({ ...row, expanded: false })),
        createPackageRow({ itemId, expanded: true }),
      ];
    });
    toast.success("เพิ่มรายการ", itemName);
  }, [toast]);

  useEffect(() => {
    if (!prefillItem) {
      lastPrefillIdRef.current = null;
    }
  }, [prefillItem]);

  useEffect(() => {
    if (loading || !prefillItem?.itemId) return;
    if (lastPrefillIdRef.current === prefillItem.itemId) return;
    lastPrefillIdRef.current = prefillItem.itemId;

    if (!itemById.has(prefillItem.itemId)) {
      setScannedItems((prev) => ({
        ...prev,
        [prefillItem.itemId]: {
          name: prefillItem.name,
          productCode: prefillItem.productCode,
        },
      }));
    }
    applyItemToRows(prefillItem.itemId, prefillItem.name);
    onPrefillApplied?.();
  }, [
    applyItemToRows,
    itemById,
    loading,
    onPrefillApplied,
    prefillItem,
  ]);

  const filteredSaleMenu = useMemo(() => {
    const q = menuQ.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter((item) =>
      `${item.name} ${item.itemCode ?? ""} ${item.category?.name ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [menuItems, menuQ]);

  const filteredConsumables = useMemo(() => {
    const q = menuQ.trim().toLowerCase();
    if (!q) return consumableItems;
    return consumableItems.filter((item) =>
      `${item.name} ${item.itemCode ?? ""} ${item.unit}`
        .toLowerCase()
        .includes(q),
    );
  }, [consumableItems, menuQ]);

  function rowSnapshot(row: PackageRow): Partial<PackageRow> {
    return {
      itemId: row.itemId,
      quantity: row.quantity,
      producedAt: row.producedAt,
      receivedAt: row.receivedAt,
      stickerCopies: row.stickerCopies,
      printSticker: row.printSticker,
      expanded: false,
    };
  }

  function addEmptyRow() {
    setRows((prev) => [...prev, createPackageRow()]);
  }

  function copyLastRow() {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      return [...prev, createPackageRow(rowSnapshot(last))];
    });
  }

  function duplicateRow(sourceKey: string) {
    setRows((prev) => {
      const source = prev.find((r) => r.key === sourceKey);
      if (!source) return prev;
      const index = prev.findIndex((r) => r.key === sourceKey);
      const copy = createPackageRow(rowSnapshot(source));
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function removeRow(key: string) {
    setRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((r) => r.key !== key),
    );
  }

  function updateRow(key: string, patch: Partial<PackageRow>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function toggleExpanded(key: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key ? { ...r, expanded: !r.expanded } : r,
      ),
    );
  }

  function openItemPicker(rowKey: string) {
    setPickerRowKey(rowKey);
    setMenuQ("");
    setPickerOpen(true);
  }

  async function submit() {
    if (busy) return;
    const validRows = rows.filter((r) => r.itemId && r.quantity > 0);
    if (validRows.length === 0) {
      toast.error("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/staff/stock/package-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceBranchId: sourceBranchId || null,
          lines: validRows.map((r) => ({
            itemId: r.itemId,
            quantity: r.quantity,
            producedAt: r.producedAt,
            receivedAt: r.receivedAt,
            labelCopies: r.printSticker ? r.stickerCopies : 0,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "บันทึกไม่สำเร็จ",
        );
      }

      const labels = Array.isArray(body.labels) ? body.labels : [];
      const toPrint = labels.filter(
        (l: { copies?: number }) => (l.copies ?? 1) > 0,
      );
      if (toPrint.length > 0) {
        await openPackageLabelPrint(toPrint);
      }

      toast.success(
        "บันทึกสำเร็จ",
        `${body.packageCount ?? validRows.length} รายการ${body.documentNo ? ` · ${body.documentNo}` : ""}`,
      );

      const batchId = String(body.batchId ?? "");
      onSuccess?.(batchId);
    } catch (e) {
      toast.error(
        "บันทึกไม่สำเร็จ",
        e instanceof Error ? e.message : "ลองใหม่",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState label="กำลังโหลดฟอร์มรับเข้ารายการ…" />;
  }

  if (!meta?.stockActive) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-bold text-slate-900">
          สาขานี้ยังไม่เปิดระบบสต๊อก
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
        >
          ← กลับ
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold leading-snug text-slate-900">
            รับเข้าและพิมพ์บาร์โค้ด + QR
          </h2>
        </div>
      </div>

      {meta.sourceBranches.length > 0 ? (
        <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-600">
              สาขาต้นทาง
            </span>
            <select
              value={sourceBranchId}
              onChange={(e) => setSourceBranchId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] font-semibold"
            >
              {meta.sourceBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="mt-1 space-y-3">
        <p className="text-[14px] font-extrabold text-slate-900">
          รายการ ({rows.length})
        </p>

        {rows.map((row, index) => {
          const item = itemById.get(row.itemId);
          const scanned = scannedItems[row.itemId];
          const displayName = item?.name ?? scanned?.name;
          const thumb = menuThumb(item);
          const productCode =
            (item && "itemCode" in item ? item.itemCode?.trim() : null) ||
            scanned?.productCode ||
            "—";
          const unit = rowItemUnit(row.itemId, menuById, consumableById);
          const lotPreview = lotByRowKey.get(row.key) ?? "—";

          return (
            <div
              key={row.key}
              className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${
                row.expanded
                  ? "border-teal-300 ring-1 ring-teal-100"
                  : "border-slate-100"
              }`}
            >
              <div className="flex items-stretch gap-0">
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex items-start gap-3">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                        🍢
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-teal-700">
                          รายการ #{index + 1}
                        </p>
                        <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                          {formatPackageQtyLabel(row.quantity, unit)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openItemPicker(row.key)}
                        className={`mt-1 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition active:scale-[0.99] ${
                          item
                            ? "border-slate-200 bg-white"
                            : "border-dashed border-site-primary/40 bg-teal-50/50"
                        }`}
                      >
                        <span
                          className={`min-w-0 flex-1 truncate text-[15px] font-extrabold ${
                            displayName ? "text-slate-900" : "text-site-primary"
                          }`}
                        >
                          {displayName ?? "เลือกรายการ"}
                        </span>
                        <span className="shrink-0 text-[12px] font-bold text-site-primary">
                          {item ? "เปลี่ยน ›" : "เลือก ›"}
                        </span>
                      </button>
                      <p className="mt-1.5 text-[11px] font-semibold leading-snug text-slate-500">
                        ผลิต {formatThaiDateKey(row.producedAt)} · รับ{" "}
                        {formatThaiDateKey(row.receivedAt)}
                      </p>
                      <p className="text-[11px] font-mono font-semibold text-slate-600">
                        {productCode} · LOT {lotPreview}
                        {row.printSticker
                          ? ` · พิมพ์ ${row.stickerCopies} ใบ`
                          : ""}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col border-l border-slate-100">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(row.key)}
                    className="flex flex-1 items-center justify-center px-3 text-slate-500 active:bg-slate-50"
                    aria-label={row.expanded ? "ย่อการ์ด" : "ขยายการ์ด"}
                  >
                    <span
                      className={`text-lg transition-transform ${
                        row.expanded ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateRow(row.key)}
                    className="border-t border-slate-100 px-3 py-2 text-[11px] font-bold text-indigo-600 active:bg-indigo-50"
                  >
                    คัดลอก
                  </button>
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="border-t border-slate-100 px-3 py-2 text-[11px] font-bold text-rose-600 active:bg-rose-50"
                    >
                      ลบ
                    </button>
                  ) : null}
                </div>
              </div>

              {row.expanded ? (
                <div className="space-y-3 border-t border-slate-100 bg-slate-50/80 px-3 py-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                        วันที่ผลิต *
                      </span>
                      <DateInput
                        value={row.producedAt}
                        onChange={(v) => updateRow(row.key, { producedAt: v })}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                        วันที่รับเข้า *
                      </span>
                      <DateInput
                        value={row.receivedAt}
                        onChange={(v) => updateRow(row.key, { receivedAt: v })}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-white px-3 py-2.5">
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500">
                        รหัสสินค้า
                      </p>
                      <p className="font-mono text-[13px] font-bold text-slate-900">
                        {productCode}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500">
                        LOT (เลขถัดไป)
                      </p>
                      <p className="font-mono text-[13px] font-bold text-slate-900">
                        {lotPreview}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-end gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="mb-1 block text-[12px] font-semibold text-slate-600">
                        จำนวนในรายการนี้ ({unit})
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={row.quantity}
                        onChange={(e) =>
                          updateRow(row.key, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[16px] font-extrabold"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        updateRow(row.key, {
                          printSticker: !row.printSticker,
                        })
                      }
                      aria-label={
                        row.printSticker ? "ปิดการพิมพ์" : "เปิดการพิมพ์"
                      }
                      aria-pressed={row.printSticker}
                      className={`flex h-[46px] w-12 shrink-0 items-center justify-center rounded-xl border-2 transition active:scale-95 ${
                        row.printSticker
                          ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-400"
                      }`}
                    >
                      <IconPrinter size={22} aria-hidden />
                    </button>
                  </div>

                  {row.printSticker ? (
                    <label className="block">
                      <span className="mb-1 block text-[12px] font-semibold text-slate-600">
                        จำนวนใบที่พิมพ์
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={row.stickerCopies}
                        onChange={(e) =>
                          updateRow(row.key, {
                            stickerCopies: Math.max(
                              1,
                              Math.min(99, Number(e.target.value) || 1),
                            ),
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[16px] font-extrabold"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={copyLastRow}
            className="flex min-h-[4.5rem] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-sm active:bg-slate-50"
          >
            คัดลอกแถวล่าสุด
          </button>
          <button
            type="button"
            onClick={addEmptyRow}
            className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 px-3 text-emerald-700 active:bg-emerald-50"
          >
            <span className="text-[28px] font-light leading-none">+</span>
            <span className="text-[12px] font-extrabold">เพิ่มรายการ</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-4 w-full rounded-2xl bg-emerald-600 py-4 text-[16px] font-extrabold text-white shadow-md disabled:opacity-60"
      >
        {busy
          ? "กำลังบันทึก…"
          : willPrintAny
            ? "บันทึกและพิมพ์"
            : "บันทึก"}
      </button>

      {pickerOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="ปิด"
            onClick={() => setPickerOpen(false)}
          />
          <div className="relative z-10 max-h-[80dvh] w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-[16px] font-extrabold text-slate-900">
                เลือกรายการ
              </p>
              <input
                value={menuQ}
                onChange={(e) => setMenuQ(e.target.value)}
                placeholder="ค้นหาชื่อเมนูหรือของสิ้นเปลือง"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-semibold"
                autoFocus
              />
            </div>
            <ul className="max-h-[60dvh] overflow-y-auto p-2">
              {filteredSaleMenu.length > 0 ? (
                <li className="px-2 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                  เมนูขาย
                </li>
              ) : null}
              {filteredSaleMenu.map((item) => {
                const thumb = menuThumb(item);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (pickerRowKey) {
                          updateRow(pickerRowKey, {
                            itemId: item.id,
                            expanded: true,
                          });
                        }
                        setPickerOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-slate-50"
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
                          🍢
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-extrabold text-slate-900">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {item.itemCode ?? "—"} · {item.category?.name ?? "—"} ·{" "}
                          {resolveMenuItemPackageUnit(item)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
              {filteredConsumables.length > 0 ? (
                <li className="px-2 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                  ของสิ้นเปลือง
                </li>
              ) : null}
              {filteredConsumables.map((item) => {
                const thumb = menuThumb(item);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (pickerRowKey) {
                          updateRow(pickerRowKey, {
                            itemId: item.id,
                            expanded: true,
                          });
                        }
                        setPickerOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-slate-50"
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
                          📦
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-extrabold text-slate-900">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {item.itemCode ?? "—"} · {item.unit}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
              {filteredSaleMenu.length === 0 &&
              filteredConsumables.length === 0 ? (
                <li className="px-3 py-8 text-center text-[13px] font-medium text-slate-500">
                  ไม่พบรายการ
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
