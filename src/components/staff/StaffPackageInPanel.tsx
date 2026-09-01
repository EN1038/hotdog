"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { DateInput } from "@/components/DateInput";
import { StockDocumentNoField } from "@/components/stock/StockDocumentNoField";
import { bangkokDateKey } from "@/lib/constants";
import { openPackageLabelPrint } from "@/lib/stock-package-label-print";
import type { StockDocumentKind } from "@/lib/stock-document-no-format";

type MenuItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
  itemCode?: string | null;
  stockQuantity?: number | null;
  category?: { name: string } | null;
};

type PackageRow = {
  key: string;
  itemId: string;
  quantity: number;
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

  const [documentNo, setDocumentNo] = useState("");
  const [docGenerating, setDocGenerating] = useState(false);
  const [producedAt, setProducedAt] = useState(bangkokDateKey());
  const [sourceBranchId, setSourceBranchId] = useState<string>("");
  const [rows, setRows] = useState<PackageRow[]>([
    { key: newRowKey(), itemId: "", quantity: 1 },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [metaRes, menuRes] = await Promise.all([
        fetch("/api/staff/stock/package-in"),
        fetch("/api/staff/menu"),
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
      if (metaBody.producedAt) setProducedAt(metaBody.producedAt);
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

  async function genDocumentNo(kind: StockDocumentKind) {
    setDocGenerating(true);
    try {
      const res = await fetch(`/api/staff/stock/document-no?kind=${kind}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "สร้างเลขไม่สำเร็จ",
        );
      }
      const next = String(json.documentNo ?? "").trim();
      if (next) setDocumentNo(next);
    } catch (e) {
      toast.error(
        "สร้างเลขเอกสารไม่สำเร็จ",
        e instanceof Error ? e.message : "",
      );
    } finally {
      setDocGenerating(false);
    }
  }

  useEffect(() => {
    if (!documentNo && meta?.stockActive) {
      void genDocumentNo("IN");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.stockActive]);

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

  function addRow(copyLast = false) {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          key: newRowKey(),
          itemId: copyLast && last ? last.itemId : "",
          quantity: copyLast && last ? last.quantity : 1,
        },
      ];
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

  async function submit() {
    const validRows = rows.filter((r) => r.itemId && r.quantity > 0);
    if (validRows.length === 0) {
      toast.error("กรุณาเลือกสินค้าอย่างน้อย 1 แพ็ก");
      return;
    }
    if (!documentNo.trim()) {
      toast.error("กรุณาระบุเลขที่เอกสาร");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/staff/stock/package-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentNo: documentNo.trim(),
          producedAt,
          sourceBranchId: sourceBranchId || null,
          lines: validRows.map((r) => ({
            itemId: r.itemId,
            quantity: r.quantity,
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
      if (labels.length > 0) {
        await openPackageLabelPrint(labels);
      }

      toast.success(
        "บันทึกสำเร็จ",
        `${body.packageCount ?? validRows.length} แพ็ก · ${body.documentNo ?? documentNo}`,
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
            สร้างป้ายแพ็กหลายรายการ · พิมพ์ครั้งเดียว
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

        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-600">
            วันที่ผลิต *
          </span>
          <DateInput value={producedAt} onChange={setProducedAt} />
        </label>

        <StockDocumentNoField
          value={documentNo}
          onChange={setDocumentNo}
          onGenerate={() => void genDocumentNo("IN")}
          generating={docGenerating}
          label="เลขที่เอกสารรับเข้า"
        />
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-extrabold text-slate-900">
            รายการแพ็ก ({rows.length})
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addRow(true)}
              className="rounded-xl bg-slate-100 px-3 py-1.5 text-[12px] font-bold text-slate-700"
            >
              คัดลอกแถวล่าสุด
            </button>
            <button
              type="button"
              onClick={() => addRow(false)}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white"
            >
              + เพิ่มแพ็ก
            </button>
          </div>
        </div>

        {rows.map((row, index) => {
          const item = itemById.get(row.itemId);
          return (
            <div
              key={row.key}
              className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-extrabold text-slate-800">
                  แพ็ก #{index + 1}
                </p>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="text-[12px] font-bold text-rose-600"
                  >
                    ลบ
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPickerRowKey(row.key);
                  setMenuQ("");
                  setPickerOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left"
              >
                {item?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-14 w-14 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-200 text-2xl">
                    🍜
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-extrabold text-slate-900">
                    {item?.name ?? "แตะเพื่อเลือกเมนู"}
                  </p>
                  {item ? (
                    <p className="text-[11px] font-semibold text-slate-500">
                      {item.itemCode ?? "—"} · คงเหลือ{" "}
                      {item.stockQuantity ?? 0}
                    </p>
                  ) : null}
                </div>
                <span className="text-slate-400">›</span>
              </button>
              <label className="mt-3 block">
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[16px] font-extrabold"
                />
              </label>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-5 w-full rounded-2xl bg-emerald-600 py-4 text-[16px] font-extrabold text-white shadow-md disabled:opacity-60"
      >
        {busy ? "กำลังบันทึก…" : "บันทึกและพิมพ์ป้าย"}
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
              {filteredMenu.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (pickerRowKey) {
                        updateRow(pickerRowKey, { itemId: item.id });
                      }
                      setPickerOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-slate-50"
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
                        🍜
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-extrabold text-slate-900">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {item.category?.name ?? "—"}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
