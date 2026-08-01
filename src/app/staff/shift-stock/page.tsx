"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import {
  assignStableMenuSequence,
  sortStaffMenuItems,
} from "@/lib/staff-menu-order";

type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

const STOCK_TYPE_LABELS: Record<StockType, string> = {
  SALE_ITEM: "สินค้าขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

type AuditItem = {
  product: {
    id: string;
    name: string;
    unit: string;
    stockType: StockType;
    lowStockAlert: number | null;
    sellingPrice: number | null;
    sortOrder?: number;
  };
  prevQty: number;
  addedQty: number;
  salesQty: number;
  wasteQty: number;
  expectedQty: number;
  currentSystemQty: number;
};

type AuditPayload = {
  stockActive: boolean;
  hasActiveShift: boolean;
  activeShift?: {
    id: string;
    roundNumber: number;
    openedAt: string;
    calendarDate: string;
  } | null;
  items: AuditItem[];
};

export default function StaffShiftStockPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<AuditPayload | null>(null);

  // Form input map: brandProductId -> counted string
  const [countsMap, setCountsMap] = useState<Record<string, string>>({});
  // Reasons map: brandProductId -> reason string
  const [reasonsMap, setReasonsMap] = useState<Record<string, string>>({});

  // Warning modal state
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [discrepancyList, setDiscrepancyList] = useState<
    { item: AuditItem; counted: number; variance: number }[]
  >([]);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/shifts/stock-count");
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      if (res.ok) {
        const body = (await res.json()) as AuditPayload;
        setData(body);

        // Pre-fill countsMap with expectedQty or currentSystemQty
        const initialMap: Record<string, string> = {};
        for (const item of body.items ?? []) {
          initialMap[item.product.id] = String(item.expectedQty);
        }
        setCountsMap(initialMap);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const itemsByType = useMemo(() => {
    const groups: Record<StockType, AuditItem[]> = {
      SALE_ITEM: [],
      CONSUMABLE: [],
      EQUIPMENT: [],
    };
    for (const item of data?.items ?? []) {
      const t = item.product.stockType || "SALE_ITEM";
      groups[t].push(item);
    }
    for (const type of Object.keys(groups) as StockType[]) {
      groups[type] = sortStaffMenuItems(
        groups[type].map((item) => ({
          ...item,
          id: item.product.id,
          name: item.product.name,
          sortOrder: item.product.sortOrder ?? 0,
        })),
      ).map((row) => {
        const { id: _id, name: _name, sortOrder: _sortOrder, ...item } = row;
        return item;
      });
    }
    return groups;
  }, [data?.items]);

  const seqByType = useMemo(() => {
    const maps: Record<StockType, Map<string, number>> = {
      SALE_ITEM: new Map(),
      CONSUMABLE: new Map(),
      EQUIPMENT: new Map(),
    };
    for (const type of Object.keys(itemsByType) as StockType[]) {
      maps[type] = assignStableMenuSequence(
        itemsByType[type].map((item) => ({ id: item.product.id })),
      );
    }
    return maps;
  }, [itemsByType]);

  const updateCount = (id: string, deltaOrValue: number | string) => {
    setCountsMap((prev) => {
      const currentVal = Number.parseInt(prev[id] ?? "0", 10) || 0;
      if (typeof deltaOrValue === "number") {
        const next = Math.max(0, currentVal + deltaOrValue);
        return { ...prev, [id]: String(next) };
      } else {
        return { ...prev, [id]: deltaOrValue };
      }
    });
  };

  const handlePreSubmitCheck = () => {
    if (!data?.items?.length) return;

    const list: { item: AuditItem; counted: number; variance: number }[] = [];

    for (const item of data.items) {
      const raw = countsMap[item.product.id] ?? "";
      const counted = Number.parseInt(raw, 10);
      const val = Number.isFinite(counted) && counted >= 0 ? counted : 0;
      const diff = val - item.expectedQty;

      if (diff !== 0) {
        list.push({ item, counted: val, variance: diff });
      }
    }

    if (list.length > 0) {
      setDiscrepancyList(list);
      setShowAlertModal(true);
    } else {
      void submitStockAudit();
    }
  };

  const submitStockAudit = async () => {
    if (!data?.items?.length) return;

    setBusy(true);
    try {
      const payloadLines = data.items.map((item) => {
        const raw = countsMap[item.product.id] ?? "";
        const parsed = Number.parseInt(raw, 10);
        const countedQty = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        const varianceReason = reasonsMap[item.product.id]?.trim() || undefined;

        return {
          brandProductId: item.product.id,
          countedQty,
          varianceReason,
        };
      });

      const res = await fetch("/api/staff/shifts/stock-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: payloadLines,
          note: `บันทึกนับสต๊อกรอบกะขายที่ ${data.activeShift?.roundNumber ?? 1}`,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", body.error ?? "กรุณาลองใหม่อีกครั้ง");
        return;
      }

      toast.success("บันทึกสรุปยอดนับสต๊อกกะนี้เรียบร้อยแล้ว");
      setShowAlertModal(false);
      await loadData();
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 bg-slate-50">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  return (
    <StaffAppShell active="stock">
      <div className="space-y-4 px-4 py-4 mb-20 max-w-2xl mx-auto">
        {/* Active Shift Header Banner */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                กะขายเปิดอยู่ #{data.activeShift?.roundNumber ?? 1}
              </span>
              <h1 className="mt-1.5 text-lg font-extrabold tracking-tight">
                กรอกและตรวจนับสต๊อกประจำรอบกะ
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                ตรวจสอบยอดคงเหลือ เปรียบเทียบยอดขายจากบิล และปรับปรุงยอดตามจริง
              </p>
            </div>
          </div>
        </div>

        {!data.stockActive ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm border border-slate-200">
            <p className="text-base font-bold text-slate-800">
              สาขานี้ยังไม่เปิดใช้งานระบบสต๊อก
            </p>
            <p className="mt-1 text-xs text-slate-500">
              กรุณาแจ้งผู้จัดการหรือแอดมินเพื่อเปิดใช้งานสต๊อกที่สาขานี้
            </p>
          </div>
        ) : !data.hasActiveShift ? (
          <div className="rounded-2xl bg-amber-50 p-6 text-center shadow-sm border border-amber-200">
            <p className="text-base font-bold text-amber-900">
              ยังไม่มีรอบกะขายที่เปิดอยู่
            </p>
            <p className="mt-1 text-xs text-amber-700">
              กรุณาเปิดกะขายหน้าร้านก่อนทำการตรวจนับสต๊อกประจำรอบ
            </p>
          </div>
        ) : (
          <>
            {/* Audit Product Tables by Type */}
            {(["SALE_ITEM", "CONSUMABLE", "EQUIPMENT"] as StockType[]).map((type) => {
              const items = itemsByType[type];
              if (!items || items.length === 0) return null;

              return (
                <div key={type} className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-orange-500" />
                      {STOCK_TYPE_LABELS[type]} ({items.length})
                    </h2>
                  </div>

                  <div className="space-y-2.5">
                    {items.map((item) => {
                      const rawCount = countsMap[item.product.id] ?? "";
                      const parsedCount = Number.parseInt(rawCount, 10);
                      const countedVal =
                        Number.isFinite(parsedCount) && parsedCount >= 0
                          ? parsedCount
                          : 0;

                      const diff = countedVal - item.expectedQty;
                      const seq = seqByType[type].get(item.product.id) ?? 0;

                      return (
                        <div
                          key={item.product.id}
                          className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200/80 transition-all hover:border-slate-300"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-slate-400 pt-0.5">
                                {seq}
                              </span>
                              <div>
                                <h3 className="text-sm font-bold text-slate-900">
                                  {item.product.name}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  หน่วย: {item.product.unit}
                                </p>
                              </div>
                            </div>

                            {/* Diff Badge */}
                            <div className="text-right">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                  diff === 0
                                    ? "bg-slate-100 text-slate-600"
                                    : diff > 0
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-rose-100 text-rose-700 font-extrabold animate-pulse"
                                }`}
                              >
                                {diff === 0
                                  ? "ตรงกับระบบ"
                                  : diff > 0
                                    ? `เกิน +${diff}`
                                    : `ขาด ${diff}`}
                              </span>
                            </div>
                          </div>

                          {/* Audit Metrics Breakdown */}
                          <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-xl bg-slate-50 p-2.5 text-center text-xs border border-slate-100">
                            <div>
                              <span className="text-[10px] text-slate-500 block font-medium">
                                รอบก่อน
                              </span>
                              <span className="font-bold text-slate-700">
                                {item.prevQty}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block font-medium">
                                +เติมเพิ่ม
                              </span>
                              <span className="font-bold text-emerald-600">
                                +{item.addedQty}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block font-medium">
                                -ขายตามบิล
                              </span>
                              <span className="font-bold text-amber-600">
                                -{item.salesQty}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block font-medium">
                                ควรเหลือ
                              </span>
                              <span className="font-bold text-slate-900 text-sm">
                                {item.expectedQty}
                              </span>
                            </div>
                          </div>

                          {/* Input Section */}
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-slate-700">
                              ยอดนับได้จริง:
                            </span>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateCount(item.product.id, -1)}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-base font-bold text-slate-700 active:scale-95 transition"
                              >
                                −
                              </button>

                              <input
                                type="number"
                                min="0"
                                value={rawCount}
                                onChange={(e) =>
                                  updateCount(item.product.id, e.target.value)
                                }
                                className="w-20 rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-center text-base font-extrabold text-slate-900 shadow-inner outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                              />

                              <button
                                type="button"
                                onClick={() => updateCount(item.product.id, 1)}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-base font-bold text-slate-700 active:scale-95 transition"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Submit Action Bar */}
            <div className="pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={handlePreSubmitCheck}
                className="w-full rounded-2xl bg-orange-600 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-orange-600/30 transition hover:bg-orange-700 active:scale-[0.99] disabled:opacity-50"
              >
                {busy ? "กำลังบันทึกข้อมูล..." : "บันทึกและสรุปยอดสต๊อกรอบกะนี้"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Discrepancy Alert Modal */}
      {showAlertModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  พบผลต่างสต๊อกไม่ตรงกับบิลขาย!
                </h3>
                <p className="text-xs text-slate-500">
                  กรุณากรอกสาเหตุหรือหมายเหตุผลต่างก่อนยืนยันบันทึก
                </p>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
              {discrepancyList.map(({ item, counted, variance }) => (
                <div
                  key={item.product.id}
                  className="rounded-2xl border border-rose-100 bg-rose-50/50 p-3 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      {item.product.name}
                    </span>
                    <span
                      className={`font-extrabold ${
                        variance < 0 ? "text-rose-600" : "text-emerald-600"
                      }`}
                    >
                      {variance < 0
                        ? `ขาด ${variance} ${item.product.unit}`
                        : `เกิน +${variance} ${item.product.unit}`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 flex justify-between">
                    <span>ควรเหลือ: {item.expectedQty}</span>
                    <span>นับได้จริง: {counted}</span>
                  </div>
                  <input
                    type="text"
                    placeholder="ระบุสาเหตุ (เช่น ของเสียลืมคีย์, แถมลูกค้า)"
                    value={reasonsMap[item.product.id] ?? ""}
                    onChange={(e) =>
                      setReasonsMap({
                        ...reasonsMap,
                        [item.product.id]: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-rose-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-rose-400"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAlertModal(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 active:scale-95"
              >
                กลับไปแก้ไข
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submitStockAudit}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-rose-700 active:scale-95 disabled:opacity-50"
              >
                {busy ? "กำลังบันทึก..." : "ยืนยันบันทึกผลต่าง"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </StaffAppShell>
  );
}
