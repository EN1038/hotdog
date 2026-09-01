"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { DateInput } from "@/components/DateInput";
import { bangkokDateKey } from "@/lib/constants";
import { resolveSkewerMenuImageUrl } from "@/lib/skewer-order";
import {
  formatThaiDateKey,
  planLotNumbersForRows,
} from "@/lib/stock-label-format";
import { openPackageLabelPrint } from "@/lib/stock-package-label-print";
import { StaffPrinterStatusChip } from "@/components/staff/StaffPrinterStatusChip";

type MenuItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
  skewerImageUrl?: string | null;
  itemCode?: string | null;
  stockQuantity?: number | null;
  category?: { name: string } | null;
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

function menuThumb(item: MenuItem | undefined) {
  if (!item) return null;
  return resolveSkewerMenuImageUrl(item);
}

type Props = {
  onBack: () => void;
  onHistory?: () => void;
  onSuccess?: (batchId: string) => void;
};

export function StaffPackageInPanel({ onBack, onHistory, onSuccess }: Props) {
  const toast = useToast();
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [metaRes, menuRes] = await Promise.all([
        fetch("/api/staff/stock/package-in"),
        fetch("/api/staff/menu?imageMode=skewer"),
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
      setMenuItems(items.filter((i) => i.category?.name !== undefined));
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

  const itemById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of menuItems) map.set(item.id, item);
    return map;
  }, [menuItems]);

  const filteredMenu = useMemo(() => {
    const q = menuQ.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter((item) =>
      `${item.name} ${item.itemCode ?? ""} ${item.category?.name ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [menuItems, menuQ]);

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

  async function submit() {
    const validRows = rows.filter((r) => r.itemId && r.quantity > 0);
    if (validRows.length === 0) {
      toast.error("กรุณาเลือกสินค้าอย่างน้อย 1 แพ็ก");
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
        `${body.packageCount ?? validRows.length} แพ็ก${body.documentNo ? ` · ${body.documentNo}` : ""}`,
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
    return <LoadingState label="กำลังโหลดฟอร์มรับเข้าแพ็ก…" />;
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
          <h2 className="text-lg font-extrabold text-slate-900">รับเข้าแพ็ก</h2>
          <p className="text-xs font-semibold text-slate-600">
            แตะการ์ดเพื่อดู/แก้รายละเอียดแต่ละแพ็ก
          </p>
        </div>
        {onHistory ? (
          <button
            type="button"
            onClick={onHistory}
            className="rounded-xl bg-white px-3 py-2 text-[12px] font-bold text-indigo-700 shadow-sm"
          >
            ประวัติ
          </button>
        ) : null}
      </div>

      <StaffPrinterStatusChip showBrowserHint className="mb-3" />

      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        {meta.brandName ? (
          <p className="text-[13px] font-bold text-slate-700">
            แบรนด์ · {meta.brandName}
          </p>
        ) : null}

        {meta.sourceBranches.length > 0 ? (
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
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-[14px] font-extrabold text-slate-900">
          รายการแพ็ก ({rows.length})
        </p>

        {rows.map((row, index) => {
          const item = itemById.get(row.itemId);
          const thumb = menuThumb(item);
          const productCode = item?.itemCode?.trim() || "—";
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
                <button
                  type="button"
                  onClick={() => toggleExpanded(row.key)}
                  className="min-w-0 flex-1 p-3 text-left active:bg-slate-50"
                >
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
                          แพ็ก #{index + 1}
                        </p>
                        <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                          {row.quantity} ชิ้น
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                        {item?.name ?? "แตะเพื่อเลือกเมนู · ขยายแก้รายละเอียด"}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-500">
                        ผลิต {formatThaiDateKey(row.producedAt)} · รับ{" "}
                        {formatThaiDateKey(row.receivedAt)}
                      </p>
                      <p className="text-[11px] font-mono font-semibold text-slate-600">
                        {productCode} · LOT {lotPreview}
                        {row.printSticker
                          ? ` · พิมพ์ ${row.stickerCopies} ป้าย`
                          : ""}
                      </p>
                    </div>
                  </div>
                </button>
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
                  <button
                    type="button"
                    onClick={() => {
                      setPickerRowKey(row.key);
                      setMenuQ("");
                      setPickerOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-left"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-xl">
                        🍢
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-site-primary">
                        {item ? "เปลี่ยนเมนู" : "เลือกเมนู"}
                      </p>
                      <p className="truncate text-[14px] font-extrabold text-slate-900">
                        {item?.name ?? "แตะเพื่อเลือก"}
                      </p>
                    </div>
                    <span className="text-slate-400">›</span>
                  </button>

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

                  <label className="block">
                    <span className="mb-1 block text-[12px] font-semibold text-slate-600">
                      จำนวนในแพ็กนี้
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

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={row.printSticker}
                        onChange={(e) =>
                          updateRow(row.key, {
                            printSticker: e.target.checked,
                          })
                        }
                        className="h-5 w-5 rounded border-slate-300 text-emerald-600"
                      />
                      <span className="text-[13px] font-bold text-slate-800">
                        พิมพ์ป้ายแพ็กนี้
                      </span>
                    </label>
                    {row.printSticker ? (
                      <label className="mt-3 block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                          จำนวนป้ายที่พิมพ์
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
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[16px] font-extrabold"
                        />
                      </label>
                    ) : null}
                  </div>
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
            <span className="text-[12px] font-extrabold">เพิ่มแพ็ก</span>
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
            ? "บันทึกและพิมพ์ป้าย"
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
                เลือกเมนู
              </p>
              <input
                value={menuQ}
                onChange={(e) => setMenuQ(e.target.value)}
                placeholder="ค้นหาชื่อเมนู"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-semibold"
                autoFocus
              />
            </div>
            <ul className="max-h-[60dvh] overflow-y-auto p-2">
              {filteredMenu.map((item) => {
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
                          {item.itemCode ?? "—"} · {item.category?.name ?? "—"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
