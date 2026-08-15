"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
  btnDanger,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { bangkokDateKey, isBangkokDateKey } from "@/lib/constants";
import { ZoomableImage } from "@/components/ZoomableImage";

type Movement = {
  id: string;
  type: string;
  quantity: number;
  note: string | null;
  imageUrl: string | null;
  batchId: string | null;
  createdAt: string;
  cancelledAt?: string | null;
  cancelNote?: string | null;
  isCancelled?: boolean;
  stockType: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
  unit: string;
  source: "menu" | "non_menu";
  menuItem: { id: string; name: string };
  createdByStaff: { id: string; name: string } | null;
  order: { id: string; orderNumber: string } | null;
};

type Batch = {
  id: string;
  type: string;
  createdAt: string;
  note: string | null;
  imageUrl: string | null;
  createdByStaff: { id: string; name: string } | null;
  itemCount: number;
  totalQty: number;
  stockTypes: string[];
  isCancelled?: boolean;
  cancelledAt?: string | null;
  cancelNote?: string | null;
  lines: Array<{
    id: string;
    name: string;
    quantity: number;
    signedQuantity: number;
    unit: string;
    stockType: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
    source: "menu" | "non_menu";
    isCancelled?: boolean;
  }>;
};

type ShiftOpt = {
  id: string;
  roundNumber: number;
  openedAt: string;
  closedAt: string | null;
};

const TYPE_FILTERS: Array<{ id: string; label: string }> = [
  { id: "ALL", label: "ทั้งหมด" },
  { id: "WASTE", label: "ของเสีย / จ่ายออก" },
  { id: "SALE", label: "ขาย (SALE)" },
  { id: "STOCK_IN", label: "รับเข้า" },
  { id: "ISSUE", label: "จ่ายออก" },
  { id: "ADJUST", label: "ปรับยอด" },
  { id: "DAMAGE", label: "เสียหาย" },
  { id: "LOST", label: "สูญหาย" },
];

const STOCK_TYPE_LABEL: Record<string, string> = {
  SALE_ITEM: "เมนูขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

const CANCELLABLE_TYPES = new Set(["STOCK_IN", "ISSUE"]);

function typeLabel(type: string) {
  switch (type) {
    case "SALE":
      return "ขาย";
    case "STOCK_IN":
      return "รับเข้า";
    case "ISSUE":
      return "จ่ายออก";
    case "WASTE":
      return "ของเสีย / จ่ายออก";
    case "ADJUST":
      return "ปรับยอด";
    case "DAMAGE":
      return "เสียหาย";
    case "LOST":
      return "สูญหาย";
    default:
      return type;
  }
}

function typeTone(type: string) {
  switch (type) {
    case "SALE":
      return "bg-rose-50 text-rose-800 border-rose-100";
    case "STOCK_IN":
      return "bg-emerald-50 text-emerald-800 border-emerald-100";
    case "ISSUE":
      return "bg-amber-50 text-amber-900 border-amber-100";
    case "ADJUST":
      return "bg-sky-50 text-sky-900 border-sky-100";
    default:
      return "bg-slate-50 text-slate-700 border-slate-100";
  }
}

function formatHm(iso: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function stockTypesLabel(types: string[]) {
  if (!types.length) return "—";
  return types.map((t) => STOCK_TYPE_LABEL[t] ?? t).join(" · ");
}

export function BranchStockMovementsView({
  branchId,
  initialType = "ALL",
  initialDate,
  initialFrom,
  initialTo,
}: {
  branchId: string;
  initialType?: string;
  initialDate?: string | null;
  initialFrom?: string | null;
  initialTo?: string | null;
}) {
  const toast = useToast();
  const rangeFrom =
    initialFrom && initialTo && isBangkokDateKey(initialFrom) && isBangkokDateKey(initialTo)
      ? initialFrom <= initialTo
        ? initialFrom
        : initialTo
      : null;
  const rangeTo =
    initialFrom && initialTo && isBangkokDateKey(initialFrom) && isBangkokDateKey(initialTo)
      ? initialFrom <= initialTo
        ? initialTo
        : initialFrom
      : null;
  const [date, setDate] = useState(
    () =>
      (initialDate && isBangkokDateKey(initialDate)
        ? initialDate
        : rangeTo) || bangkokDateKey(),
  );
  const [from, setFrom] = useState(rangeFrom ?? "");
  const [to, setTo] = useState(rangeTo ?? "");
  const useRange = Boolean(from && to && from !== to);
  const [type, setType] = useState(
    TYPE_FILTERS.some((t) => t.id === initialType) ? initialType : "ALL",
  );
  const [stockType, setStockType] = useState<
    "ALL" | "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT"
  >("ALL");
  const [shiftId, setShiftId] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [shifts, setShifts] = useState<ShiftOpt[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [modal, setModal] = useState<null | {
    kind: "cancel" | "restore";
    lines: Array<{ id: string; source: "menu" | "non_menu" }>;
    label: string;
  }>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isBangkokDateKey(date)) return;
      try {
        const res = await fetch(
          `/api/admin/branches/${branchId}/shifts?date=${encodeURIComponent(date)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const list = Array.isArray(data.shifts)
          ? (data.shifts as ShiftOpt[])
          : [];
        setShifts(list);
        setShiftId((prev) =>
          prev && list.some((s) => s.id === prev) ? prev : "",
        );
      } catch {
        if (!cancelled) setShifts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId, date]);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ type });
      if (useRange) {
        qs.set("from", from);
        qs.set("to", to);
      } else {
        qs.set("date", date);
      }
      if (shiftId) qs.set("shiftId", shiftId);
      if (q) qs.set("q", q);
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/history?${qs}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("โหลดไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        setMovements([]);
        setBatches(null);
        return;
      }
      setMovements(Array.isArray(data.movements) ? data.movements : []);
      setBatches(Array.isArray(data.batches) ? data.batches : null);
      setExpandedBatchId(null);
    } finally {
      setLoading(false);
    }
  }, [branchId, date, from, to, useRange, type, shiftId, q]); // eslint-disable-line react-hooks/exhaustive-deps -- toast stable enough

  useEffect(() => {
    void load();
  }, [load]);

  const filteredMovements = useMemo(() => {
    if (stockType === "ALL") return movements;
    return movements.filter((m) => m.stockType === stockType);
  }, [movements, stockType]);

  const filteredBatches = useMemo(() => {
    if (!batches) return null;
    if (stockType === "ALL") return batches;
    return batches
      .map((b) => {
        const lines = b.lines.filter((l) => l.stockType === stockType);
        if (lines.length === 0) return null;
        const totalQty = lines.reduce(
          (s, l) => s + Math.abs(l.signedQuantity),
          0,
        );
        const cancelledLines = lines.filter((l) => l.isCancelled);
        return {
          ...b,
          lines,
          itemCount: lines.length,
          totalQty,
          stockTypes: Array.from(new Set(lines.map((l) => l.stockType))),
          isCancelled:
            lines.length > 0 && cancelledLines.length === lines.length,
        };
      })
      .filter(Boolean) as Batch[];
  }, [batches, stockType]);

  const showBatches =
    (type === "STOCK_IN" || type === "ISSUE" || type === "WASTE") &&
    Array.isArray(filteredBatches) &&
    filteredBatches.length > 0;

  async function submitStatus() {
    if (!modal || statusBusy) return;
    setStatusBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/history/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cancelled: modal.kind === "cancel",
            cancelNote:
              modal.kind === "cancel" ? cancelNote.trim() || null : null,
            lines: modal.lines,
          }),
          cache: "no-store",
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          modal.kind === "cancel" ? "ยกเลิกไม่สำเร็จ" : "กู้คืนไม่สำเร็จ",
          data.error ?? "กรุณาลองใหม่",
        );
        return;
      }
      toast.success(
        modal.kind === "cancel" ? "ยกเลิกรายการแล้ว" : "กู้คืนรายการแล้ว",
        `อัปเดต ${data.updated ?? modal.lines.length} รายการ`,
      );
      setModal(null);
      setCancelNote("");
      await load();
    } catch {
      toast.error(
        modal.kind === "cancel" ? "ยกเลิกไม่สำเร็จ" : "กู้คืนไม่สำเร็จ",
        "กรุณาลองใหม่",
      );
    } finally {
      setStatusBusy(false);
    }
  }

  function openBatchCancel(b: Batch) {
    setCancelNote("");
    setModal({
      kind: "cancel",
      label: `${typeLabel(b.type)} · ${b.itemCount} รายการ`,
      lines: b.lines
        .filter((l) => !l.isCancelled)
        .map((l) => ({ id: l.id, source: l.source })),
    });
  }

  function openBatchRestore(b: Batch) {
    setModal({
      kind: "restore",
      label: `${typeLabel(b.type)} · ${b.itemCount} รายการ`,
      lines: b.lines
        .filter((l) => l.isCancelled)
        .map((l) => ({ id: l.id, source: l.source })),
    });
  }

  function openLineCancel(m: Movement) {
    setCancelNote("");
    setModal({
      kind: "cancel",
      label: `${typeLabel(m.type)} · ${m.menuItem.name}`,
      lines: [{ id: m.id, source: m.source }],
    });
  }

  function openLineRestore(m: Movement) {
    setModal({
      kind: "restore",
      label: `${typeLabel(m.type)} · ${m.menuItem.name}`,
      lines: [{ id: m.id, source: m.source }],
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <h2 className="text-base font-extrabold text-slate-900">
            {type === "WASTE"
              ? "ของเสีย / จ่ายออกที่หน้าร้านบันทึก"
              : "ประวัติเคลื่อนไหวสต็อก"}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {type === "WASTE"
              ? "รายการที่พนักงานตัดของเสียหรือจ่ายออกจากแอปหน้าร้าน ตามช่วงวันที่เลือก"
              : "ดูรับเข้า จ่ายออก ขาย ปรับยอด ตามวัน — รับเข้า/จ่ายออก สามารถยกเลิกและกู้คืนได้ (ยอดสต๊อกจะกลับคืนอัตโนมัติ)"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {useRange ? (
            <>
              <div>
                <label className={adminLabelClass} htmlFor="stock-move-from">
                  จากวันที่
                </label>
                <DateInput
                  id="stock-move-from"
                  className={adminInputClass}
                  value={from}
                  max={to || bangkokDateKey()}
                  onChange={(v) => {
                    if (v) setFrom(v);
                  }}
                />
              </div>
              <div>
                <label className={adminLabelClass} htmlFor="stock-move-to">
                  ถึงวันที่
                </label>
                <DateInput
                  id="stock-move-to"
                  className={adminInputClass}
                  value={to}
                  min={from}
                  max={bangkokDateKey()}
                  onChange={(v) => {
                    if (v) setTo(v);
                  }}
                />
              </div>
            </>
          ) : (
          <div>
            <label className={adminLabelClass} htmlFor="stock-move-date">
              วันที่
            </label>
            <DateInput
              id="stock-move-date"
              className={adminInputClass}
              value={date}
              max={bangkokDateKey()}
              onChange={(v) => {
                if (v) setDate(v);
              }}
            />
          </div>
          )}
          {useRange ? null : (
          <div>
            <label className={adminLabelClass} htmlFor="stock-move-shift">
              รอบขาย
            </label>
            <select
              id="stock-move-shift"
              className={adminInputClass}
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
            >
              <option value="">ทั้งวัน</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  รอบที่ {s.roundNumber} · {formatHm(s.openedAt)}
                  {s.closedAt ? `–${formatHm(s.closedAt)}` : "–เปิดอยู่"}
                </option>
              ))}
            </select>
          </div>
          )}
          <div>
            <label className={adminLabelClass} htmlFor="stock-move-type">
              ประเภทรายการ
            </label>
            <select
              id="stock-move-type"
              className={adminInputClass}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPE_FILTERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminLabelClass} htmlFor="stock-move-stock-type">
              ประเภทสินค้า
            </label>
            <select
              id="stock-move-stock-type"
              className={adminInputClass}
              value={stockType}
              onChange={(e) =>
                setStockType(
                  e.target.value as
                    | "ALL"
                    | "SALE_ITEM"
                    | "CONSUMABLE"
                    | "EQUIPMENT",
                )
              }
            >
              <option value="ALL">ทั้งหมด</option>
              <option value="SALE_ITEM">เมนูขาย</option>
              <option value="CONSUMABLE">ของสิ้นเปลือง</option>
              <option value="EQUIPMENT">อุปกรณ์</option>
            </select>
          </div>
          <div>
            <label className={adminLabelClass} htmlFor="stock-move-q">
              ค้นหา
            </label>
            <input
              id="stock-move-q"
              type="search"
              className={adminInputClass}
              placeholder="ชื่อรายการ, พนักงาน, หมายเหตุ…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <AdminLoadingState className="py-8" />
      ) : showBatches ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-600">
            พบ {filteredBatches!.length} ครั้ง · รวม{" "}
            {filteredMovements.length} รายการ
          </p>
          {filteredBatches!.map((b) => {
            const open = expandedBatchId === b.id;
            const cancelled = Boolean(b.isCancelled);
            return (
              <div
                key={b.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                  cancelled
                    ? "border-red-200 ring-1 ring-red-100"
                    : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-stretch gap-0 sm:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => setExpandedBatchId(open ? null : b.id)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${typeTone(b.type)}`}
                        >
                          {typeLabel(b.type)}
                        </span>
                        {cancelled ? (
                          <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                            ยกเลิก
                          </span>
                        ) : null}
                        <span className="text-sm font-bold text-slate-900">
                          {stockTypesLabel(b.stockTypes)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatHm(b.createdAt)} น.
                        {b.createdByStaff
                          ? ` · ${b.createdByStaff.name}`
                          : " · ระบบ/แอดมิน"}
                        {" · "}
                        {b.itemCount.toLocaleString("th-TH")} รายการ · รวม{" "}
                        {b.totalQty.toLocaleString("th-TH")}
                        {b.note ? ` · ${b.note}` : ""}
                      </p>
                      {cancelled && b.cancelNote ? (
                        <p className="mt-1 text-xs font-medium text-red-700">
                          เหตุผล: {b.cancelNote}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-slate-400">
                      {open ? "▲" : "▼"}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-3 py-2 sm:border-l sm:border-t-0">
                    {cancelled ? (
                      <button
                        type="button"
                        disabled={statusBusy}
                        onClick={() => openBatchRestore(b)}
                        className={`${btnPrimary} px-3 py-2 text-xs disabled:opacity-60`}
                      >
                        กู้คืน
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={statusBusy}
                        onClick={() => openBatchCancel(b)}
                        className={`${btnDanger} px-3 py-2 text-xs disabled:opacity-60`}
                      >
                        ยกเลิก
                      </button>
                    )}
                  </div>
                </div>
                {open ? (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    {b.imageUrl ? (
                      <div className="mb-3">
                        <p className="mb-1.5 text-xs font-semibold text-slate-500">
                          รูปประกอบ — กดเพื่อดูเต็ม
                        </p>
                        <ZoomableImage
                          src={b.imageUrl}
                          alt="รูปประกอบ"
                          className="max-h-48 rounded-xl object-contain ring-1 ring-slate-200"
                        />
                      </div>
                    ) : null}
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {b.lines.map((line, index) => (
                        <li
                          key={line.id}
                          className={`flex items-center justify-between gap-3 px-3 py-2.5 ${
                            line.isCancelled ? "bg-red-50/50" : ""
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {index + 1}. {line.name}
                              {line.isCancelled ? (
                                <span className="ml-1 text-xs font-bold text-red-600">
                                  (ยกเลิก)
                                </span>
                              ) : null}
                              {line.stockType !== "SALE_ITEM" &&
                              line.unit?.trim() ? (
                                <span className="font-bold text-red-600">
                                  {" "}
                                  ({line.unit.trim()})
                                </span>
                              ) : null}
                            </p>
                            <p className="text-[11px] font-semibold text-slate-500">
                              {STOCK_TYPE_LABEL[line.stockType] ??
                                line.stockType}
                            </p>
                          </div>
                          <p
                            className={`shrink-0 text-sm font-extrabold tabular-nums ${
                              line.isCancelled
                                ? "text-slate-400 line-through"
                                : line.signedQuantity < 0
                                  ? "text-red-700"
                                  : "text-emerald-700"
                            }`}
                          >
                            {line.signedQuantity > 0 ? "+" : ""}
                            {line.signedQuantity.toLocaleString("th-TH")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : filteredMovements.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          ไม่พบการเคลื่อนไหวในช่วงที่เลือก
          {q ? ` ที่ตรงกับ “${q}”` : ""}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {filteredMovements.map((m) => {
              const cancelled = Boolean(m.isCancelled || m.cancelledAt);
              const canToggle = CANCELLABLE_TYPES.has(m.type);
              return (
                <li
                  key={m.id}
                  className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                    cancelled ? "bg-red-50/40" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${typeTone(m.type)}`}
                      >
                        {typeLabel(m.type)}
                      </span>
                      {cancelled ? (
                        <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                          ยกเลิก
                        </span>
                      ) : null}
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {m.menuItem.name}
                        {m.stockType !== "SALE_ITEM" && m.unit?.trim() ? (
                          <span className="font-bold text-red-600">
                            {" "}
                            ({m.unit.trim()})
                          </span>
                        ) : null}
                      </p>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {STOCK_TYPE_LABEL[m.stockType] ?? m.stockType}
                      </span>
                    </div>
                    {m.imageUrl ? (
                      <div className="mt-2">
                        <ZoomableImage
                          src={m.imageUrl}
                          alt="รูปประกอบ"
                          className="max-h-28 rounded-lg object-contain ring-1 ring-slate-200"
                        />
                      </div>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {formatHm(m.createdAt)} น.
                      {m.createdByStaff
                        ? ` · ${m.createdByStaff.name}`
                        : " · ระบบ/แอดมิน"}
                      {m.note && m.type !== "SALE" ? ` · ${m.note}` : ""}
                    </p>
                    {cancelled && m.cancelNote ? (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        เหตุผล: {m.cancelNote}
                      </p>
                    ) : null}
                    {m.order ? (
                      <p className="mt-1 text-xs">
                        <Link
                          href={`/admin/orders/${m.order.id}`}
                          className="font-medium text-site-primary hover:underline"
                        >
                          ออเดอร์ {m.order.orderNumber || m.order.id.slice(0, 8)}
                        </Link>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {canToggle ? (
                      cancelled ? (
                        <button
                          type="button"
                          disabled={statusBusy}
                          onClick={() => openLineRestore(m)}
                          className={`${btnPrimary} px-3 py-1.5 text-xs disabled:opacity-60`}
                        >
                          กู้คืน
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={statusBusy}
                          onClick={() => openLineCancel(m)}
                          className={`${btnDanger} px-3 py-1.5 text-xs disabled:opacity-60`}
                        >
                          ยกเลิก
                        </button>
                      )
                    ) : null}
                    <p
                      className={`text-base font-extrabold tabular-nums ${
                        cancelled
                          ? "text-slate-400 line-through"
                          : m.quantity < 0
                            ? "text-red-700"
                            : "text-emerald-700"
                      }`}
                    >
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity.toLocaleString("th-TH")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AdminModal
        open={modal != null}
        busy={statusBusy}
        maxWidthClassName="max-w-md"
        onClose={() => {
          if (!statusBusy) {
            setModal(null);
            setCancelNote("");
          }
        }}
        title={
          modal?.kind === "restore"
            ? "กู้คืนรายการสต๊อก?"
            : "ยกเลิกรายการสต๊อก?"
        }
      >
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-600">
            {modal?.kind === "restore" ? (
              <>
                จะกู้คืน:{" "}
                <span className="font-semibold text-slate-900">
                  {modal.label}
                </span>
                <span className="mt-1 block text-slate-500">
                  ยอดสต๊อกจะถูกตัด/เพิ่มกลับเหมือนตอนทำรายการเดิม
                </span>
              </>
            ) : (
              <>
                จะยกเลิก:{" "}
                <span className="font-semibold text-slate-900">
                  {modal?.label}
                </span>
                <span className="mt-1 block font-medium text-red-700">
                  ยอดสต๊อกจะถูกลบกลับ (รับเข้า→หักออก · จ่ายออก→คืนเข้า)
                </span>
              </>
            )}
          </p>
          {modal?.kind === "cancel" ? (
            <div>
              <label className={adminLabelClass} htmlFor="stock-hist-cancel-note">
                เหตุผล (ไม่บังคับ)
              </label>
              <textarea
                id="stock-hist-cancel-note"
                className={adminInputClass}
                rows={2}
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                placeholder="เช่น คีย์ผิด / ทดสอบ"
                disabled={statusBusy}
              />
            </div>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => {
                setModal(null);
                setCancelNote("");
              }}
              className={`flex-1 ${btnOutline}`}
            >
              ปิด
            </button>
            <button
              type="button"
              disabled={statusBusy || !modal || modal.lines.length === 0}
              onClick={() => void submitStatus()}
              className={`flex-1 ${
                modal?.kind === "restore" ? btnPrimary : btnDanger
              }`}
            >
              {statusBusy
                ? modal?.kind === "restore"
                  ? "กำลังกู้คืน…"
                  : "กำลังยกเลิก…"
                : modal?.kind === "restore"
                  ? "ยืนยันกู้คืน"
                  : "ยืนยันยกเลิก"}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
