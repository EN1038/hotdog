"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toPng } from "html-to-image";
import {
  adminInputClass,
  adminLabelClass,
  btnDanger,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { DateInput } from "@/components/DateInput";
import { bangkokDateKey, formatPrice, isBangkokDateKey } from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";

type ShiftListItem = {
  id: string;
  calendarDate: string;
  roundNumber: number;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  note?: string | null;
  cancelledAt?: string | null;
  cancelNote?: string | null;
  isCancelled?: boolean;
};

type ShiftSummary = {
  shift: {
    id: string;
    calendarDate: string;
    roundNumber: number;
    openedAt: string;
    closedAt: string | null;
    openingCash: number;
    note: string | null;
    code: string;
    cancelledAt?: string | null;
    cancelNote?: string | null;
    isCancelled?: boolean;
  };
  totalOrders: number;
  cancelledOrders: number;
  orderCount: number;
  completedOrders: number;
  revenueBaht: number;
  cashRevenueBaht: number;
  transferRevenueBaht: number;
  expectedCash: number;
  totalWithOpeningCash: number;
  giftQuantity: number;
  cancelledRevenueBaht?: number;
  cancelledItemQuantity?: number;
  stockRestoredQuantity?: number;
  stockRestored?: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    orders: Array<{ id: string; orderNumber: string }>;
  }>;
  menus: Array<{ name: string; quantity: number; revenueBaht: number }>;
  channels?: Array<{
    channel: string;
    label: string;
    orderCount: number;
    revenueBaht: number;
  }>;
  stockDeductions: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    orders: Array<{ id: string; orderNumber: string }>;
  }>;
};

function formatHm(iso: string | null) {
  if (!iso) return "—";
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

function formatShiftDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
    const time = formatHm(iso);
    return `${date} เวลา ${time} น.`;
  } catch {
    return "—";
  }
}

function SummaryRow({
  label,
  value,
  last = false,
  valueClassName,
  labelClassName,
}: {
  label: string;
  value: string;
  last?: boolean;
  valueClassName?: string;
  labelClassName?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-1 py-2.5 text-sm ${
        last ? "" : "border-b border-slate-100"
      }`}
    >
      <span className={labelClassName ?? "text-slate-600"}>{label}</span>
      <span
        className={`text-right font-semibold ${
          valueClassName ?? "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function formatBranchLabel(branchName: string) {
  const trimmed = branchName.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^สาขา\s*/i, "");
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function BranchShiftsPanel({ branchId }: { branchId: string }) {
  const searchParams = useSearchParams();
  const dateFromUrl = searchParams.get("date")?.trim() ?? "";
  const captureRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(() =>
    isBangkokDateKey(dateFromUrl) ? dateFromUrl : bangkokDateKey(),
  );
  const [shifts, setShifts] = useState<ShiftListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [brandName, setBrandName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [listTick, setListTick] = useState(0);

  useEffect(() => {
    if (isBangkokDateKey(dateFromUrl)) setDate(dateFromUrl);
  }, [dateFromUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/branches/${branchId}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const b = data as {
          name?: string;
          brand?: { name?: string | null } | null;
        };
        if (typeof b.name === "string") setBranchName(b.name);
        if (typeof b.brand?.name === "string") setBrandName(b.brand.name);
      } catch {
        /* optional header for export */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/branches/${branchId}/shifts?date=${encodeURIComponent(date)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "โหลดรอบไม่สำเร็จ");
          setShifts([]);
          setSelectedId(null);
          return;
        }
        const list = Array.isArray(data.shifts)
          ? (data.shifts as ShiftListItem[])
          : [];
        setShifts(list);
        setSelectedId((prev) => {
          if (prev && list.some((s) => s.id === prev)) return prev;
          return list.length > 0 ? list[list.length - 1]!.id : null;
        });
      } catch {
        if (!cancelled) setError("โหลดรอบไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId, date, listTick]);

  useEffect(() => {
    if (!selectedId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSummary(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/branches/${branchId}/shifts/${selectedId}/summary`,
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "โหลดสรุปไม่สำเร็จ");
          setSummary(null);
          return;
        }
        setSummary((data.summary as ShiftSummary) ?? null);
      } catch {
        if (!cancelled) setError("โหลดสรุปไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId, selectedId, listTick]);

  useEffect(() => {
    setMenuQuery("");
    setSaveMsg("");
  }, [selectedId]);

  const stockDeductions = summary?.stockDeductions ?? [];
  const needle = menuQuery.trim().toLowerCase();
  const filteredMenus = useMemo(() => {
    const menus = summary?.menus ?? [];
    if (!needle) return menus;
    return menus.filter((m) => m.name.toLowerCase().includes(needle));
  }, [summary?.menus, needle]);
  const filteredStockDeductions = useMemo(() => {
    if (!needle) return stockDeductions;
    return stockDeductions.filter((r) =>
      r.name.toLowerCase().includes(needle),
    );
  }, [stockDeductions, needle]);
  const stockTotalQty = filteredStockDeductions.reduce(
    (n, r) => n + r.quantity,
    0,
  );

  const branchLabel = formatBranchLabel(branchName);

  async function handleSaveImage() {
    if (!summary || saveBusy) return;
    const node = captureRef.current;
    if (!node) return;
    setSaveBusy(true);
    setSaveMsg("");
    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const round = summary.shift.roundNumber;
      const code = summary.shift.code || `รอบ${round}`;
      downloadDataUrl(
        dataUrl,
        `สรุปรอบขาย_${date}_${code}.png`,
      );
      setSaveMsg("บันทึกรูปแล้ว");
    } catch {
      setSaveMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setSaveBusy(false);
    }
  }

  async function submitShiftStatus(cancelled: boolean) {
    if (!selectedId || statusBusy) return;
    const noteSnapshot = cancelled ? cancelNote.trim() || null : null;
    setStatusBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/shifts/${selectedId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cancelled,
            cancelNote: noteSnapshot,
          }),
          cache: "no-store",
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error ??
            (cancelled ? "ยกเลิกรอบไม่สำเร็จ" : "กู้คืนรอบไม่สำเร็จ"),
        );
        setCancelModalOpen(false);
        setRestoreModalOpen(false);
        return;
      }
      setCancelModalOpen(false);
      setRestoreModalOpen(false);
      setCancelNote("");
      const nowIso = new Date().toISOString();
      if (cancelled) {
        setShifts((prev) =>
          prev.map((s) =>
            s.id === selectedId
              ? {
                  ...s,
                  isCancelled: true,
                  cancelledAt: nowIso,
                  cancelNote: noteSnapshot,
                  closedAt: s.closedAt ?? nowIso,
                }
              : s,
          ),
        );
        setSummary((prev) =>
          prev
            ? {
                ...prev,
                shift: {
                  ...prev.shift,
                  isCancelled: true,
                  cancelledAt: nowIso,
                  cancelNote: noteSnapshot,
                  closedAt: prev.shift.closedAt ?? nowIso,
                },
              }
            : prev,
        );
      } else {
        setShifts((prev) =>
          prev.map((s) =>
            s.id === selectedId
              ? {
                  ...s,
                  isCancelled: false,
                  cancelledAt: null,
                  cancelNote: null,
                }
              : s,
          ),
        );
        setSummary((prev) =>
          prev
            ? {
                ...prev,
                shift: {
                  ...prev.shift,
                  isCancelled: false,
                  cancelledAt: null,
                  cancelNote: null,
                },
              }
            : prev,
        );
      }
      setListTick((n) => n + 1);
    } catch {
      setError(cancelled ? "ยกเลิกรอบไม่สำเร็จ" : "กู้คืนรอบไม่สำเร็จ");
      setCancelModalOpen(false);
      setRestoreModalOpen(false);
    } finally {
      setStatusBusy(false);
    }
  }

  const selectedIsCancelled =
    summary?.shift.isCancelled ||
    Boolean(
      shifts.find((s) => s.id === selectedId)?.isCancelled ||
        shifts.find((s) => s.id === selectedId)?.cancelledAt,
    );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900">
              สรุปรอบขาย
            </h3>
            <p className="mt-0.5 text-sm text-slate-600">
              เลือกวันและรอบเพื่อดูยอดขาย ช่องทาง เงินเริ่มต้น ของแถม
              สต็อกที่หัก และเมนูที่ขาย — ยกเลิกรอบหรือกู้คืนได้ถ้าทำผิด
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedId ? (
              selectedIsCancelled ? (
                <button
                  type="button"
                  disabled={statusBusy || loadingSummary}
                  onClick={() => setRestoreModalOpen(true)}
                  className={`${btnPrimary} disabled:opacity-60`}
                >
                  {statusBusy ? "กำลังกู้คืน…" : "กู้คืนรอบ"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={statusBusy || loadingSummary}
                  onClick={() => {
                    setCancelNote("");
                    setCancelModalOpen(true);
                  }}
                  className={`${btnDanger} disabled:opacity-60`}
                >
                  ยกเลิกรอบ
                </button>
              )
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid w-full gap-3 sm:grid-cols-2 sm:max-w-md">
            <div>
              <label className={adminLabelClass} htmlFor="shift-summary-date">
                วันที่
              </label>
              <DateInput
                id="shift-summary-date"
                className={adminInputClass}
                value={date}
                max={bangkokDateKey()}
                onChange={(v) => {
                  if (v) setDate(v);
                }}
              />
            </div>
            <div>
              <label className={adminLabelClass} htmlFor="shift-summary-q">
                ค้นหาเมนู
              </label>
              <input
                id="shift-summary-q"
                type="search"
                className={adminInputClass}
                placeholder="ชื่อเมนู…"
                value={menuQuery}
                onChange={(e) => setMenuQuery(e.target.value)}
                disabled={!summary}
              />
            </div>
        </div>

        <div className="mt-4">
          {loadingList ? (
            <p className="text-sm text-slate-500">กำลังโหลดรอบ…</p>
          ) : shifts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              ไม่มีรอบในวันที่ {formatOperatingDayLabel(date) || date}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shifts.map((s) => {
                const selected = s.id === selectedId;
                const isCancelled = Boolean(s.isCancelled || s.cancelledAt);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                      selected
                        ? isCancelled
                          ? "border-red-400 bg-red-50 font-bold text-red-800"
                          : "border-site-primary bg-site-primary-soft font-bold text-site-primary"
                        : isCancelled
                          ? "border-red-200 bg-red-50/60 text-red-700 hover:border-red-300"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <span className="block">
                      รอบที่ {s.roundNumber}
                      {isCancelled ? " · ยกเลิก" : ""}
                    </span>
                    <span className="mt-0.5 block opacity-80">
                      {formatHm(s.openedAt)}
                      {s.closedAt ? `–${formatHm(s.closedAt)}` : "–เปิดอยู่"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loadingSummary ? (
        <p className="text-sm text-slate-500">กำลังโหลดสรุป…</p>
      ) : summary ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => void handleSaveImage()}
              className={`${btnOutline} disabled:opacity-60`}
            >
              {saveBusy ? "กำลังบันทึก…" : "Save รูป"}
            </button>
            {selectedIsCancelled ? (
              <button
                type="button"
                disabled={statusBusy}
                onClick={() => setRestoreModalOpen(true)}
                className={`${btnPrimary} disabled:opacity-60`}
              >
                {statusBusy ? "กำลังกู้คืน…" : "กู้คืนรอบ"}
              </button>
            ) : (
              <button
                type="button"
                disabled={statusBusy}
                onClick={() => {
                  setCancelNote("");
                  setCancelModalOpen(true);
                }}
                className={`${btnDanger} disabled:opacity-60`}
              >
                ยกเลิกรอบ
              </button>
            )}
            {saveMsg ? (
              <p
                className={`text-sm ${
                  saveMsg.includes("ไม่สำเร็จ")
                    ? "text-red-600"
                    : "text-slate-600"
                }`}
              >
                {saveMsg}
              </p>
            ) : null}
          </div>

          {selectedIsCancelled || (summary?.cancelledOrders ?? 0) > 0 ? (
            <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {selectedIsCancelled ? (
                <p className="font-semibold">
                  รอบนี้ถูกยกเลิกแล้ว
                  {summary?.shift.cancelledAt
                    ? ` · ${formatShiftDateTime(summary.shift.cancelledAt)}`
                    : ""}
                </p>
              ) : (
                <p className="font-semibold">มีออเดอร์ที่ยกเลิกในรอบนี้</p>
              )}
              {summary?.shift.cancelNote ? (
                <p>เหตุผล: {summary.shift.cancelNote}</p>
              ) : null}
              {summary ? (
                <div className="grid gap-1 text-red-900 sm:grid-cols-3">
                  <p>
                    ออเดอร์ยกเลิก{" "}
                    <span className="font-bold">
                      {summary.cancelledOrders.toLocaleString("th-TH")}
                    </span>
                  </p>
                  <p>
                    ยอดเงินยกเลิก{" "}
                    <span className="font-bold">
                      {formatPrice(summary.cancelledRevenueBaht ?? 0)}฿
                    </span>
                  </p>
                  <p>
                    สต๊อกคืน{" "}
                    <span className="font-bold">
                      {(
                        summary.stockRestoredQuantity &&
                        summary.stockRestoredQuantity > 0
                          ? summary.stockRestoredQuantity
                          : (summary.cancelledItemQuantity ?? 0)
                      ).toLocaleString("th-TH")}{" "}
                      ชิ้น
                    </span>
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            ref={captureRef}
            className="space-y-4 rounded-2xl bg-white p-1 sm:p-2"
          >
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
              {brandName ? (
                <p className="text-base font-bold text-slate-900">{brandName}</p>
              ) : null}
              {branchLabel ? (
                <p
                  className={`text-sm font-semibold text-slate-800 ${
                    brandName ? "mt-0.5" : ""
                  }`}
                >
                  สาขา {branchLabel}
                </p>
              ) : null}
              <p
                className={`text-xs font-medium text-slate-500 ${
                  brandName || branchLabel ? "mt-1.5" : ""
                }`}
              >
                สรุปรอบขาย · {summary.shift.code}
                {summary.shift.isCancelled ? " · ยกเลิก" : ""}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-1 shadow-sm sm:px-4">
                <SummaryRow label="เลขที่รอบ" value={summary.shift.code} />
                <SummaryRow
                  label="สถานะรอบ"
                  value={
                    summary.shift.isCancelled
                      ? "ยกเลิก"
                      : summary.shift.closedAt
                        ? "ปิดรอบแล้ว"
                        : "เปิดอยู่"
                  }
                  valueClassName={
                    summary.shift.isCancelled ? "text-red-700" : undefined
                  }
                />
                {summary.shift.isCancelled && summary.shift.cancelNote ? (
                  <SummaryRow
                    label="เหตุผลการยกเลิก"
                    value={summary.shift.cancelNote}
                    valueClassName="text-red-800"
                  />
                ) : null}
                <SummaryRow
                  label="วันที่และเวลาเปิด"
                  value={formatShiftDateTime(summary.shift.openedAt)}
                />
                <SummaryRow
                  label="วันที่และเวลาปิด"
                  value={
                    summary.shift.closedAt
                      ? formatShiftDateTime(summary.shift.closedAt)
                      : "ยังไม่ปิดรอบ"
                  }
                />
                <SummaryRow
                  label="จำนวนออเดอร์ (นับยอด)"
                  value={`${summary.orderCount.toLocaleString("th-TH")} ออเดอร์`}
                />
                {summary.cancelledOrders > 0 || summary.shift.isCancelled ? (
                  <>
                    <SummaryRow
                      label="ออเดอร์ที่ยกเลิก"
                      value={`${summary.cancelledOrders.toLocaleString("th-TH")} ออเดอร์`}
                      valueClassName="text-red-700"
                    />
                    <SummaryRow
                      label="ยอดเงินที่ยกเลิก"
                      value={`${formatPrice(summary.cancelledRevenueBaht ?? 0)} บาท`}
                      valueClassName="text-red-700"
                    />
                    <SummaryRow
                      label="สต๊อกที่คืน"
                      value={`${(
                        summary.stockRestoredQuantity &&
                        summary.stockRestoredQuantity > 0
                          ? summary.stockRestoredQuantity
                          : (summary.cancelledItemQuantity ?? 0)
                      ).toLocaleString("th-TH")} ชิ้น`}
                      valueClassName="text-red-700"
                    />
                  </>
                ) : null}
                <SummaryRow
                  label="เงินเริ่มต้น"
                  value={`${formatPrice(summary.shift.openingCash)} บาท`}
                />
                {summary.shift.note ? (
                  <SummaryRow label="หมายเหตุ" value={summary.shift.note} />
                ) : null}
                <SummaryRow
                  label="ยอดเงินสด"
                  value={`${formatPrice(summary.cashRevenueBaht)} บาท`}
                />
                <SummaryRow
                  label="ยอดเงินโอน"
                  value={`${formatPrice(summary.transferRevenueBaht)} บาท`}
                />
                <SummaryRow
                  label="ยอดขายสุทธิ"
                  value={`${formatPrice(summary.revenueBaht)} บาท`}
                />
                <SummaryRow
                  label="ยอดรวมเงินเริ่มต้น"
                  value={`${formatPrice(summary.totalWithOpeningCash)} บาท`}
                />
                <SummaryRow
                  label="จำนวนของแถม"
                  value={`${summary.giftQuantity.toLocaleString("th-TH")} ชิ้น`}
                  last
                />
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-2 text-sm font-bold text-slate-900">
                    สรุปช่องทาง
                  </p>
                  {(summary.channels ?? []).length === 0 ? (
                    <p className="text-sm text-slate-500">
                      ยังไม่มีออเดอร์ที่นับยอด
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {(summary.channels ?? []).map((c) => (
                        <li
                          key={c.channel}
                          className="flex items-center justify-between gap-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {c.label}
                            </p>
                            <p className="text-xs text-slate-500">
                              {c.orderCount.toLocaleString("th-TH")} ออเดอร์
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-slate-800">
                            {formatPrice(c.revenueBaht)}฿
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-2 text-sm font-bold text-slate-900">
                    เมนูที่ขาย
                  </p>
                  {summary.menus.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      ยังไม่มีรายการที่นับยอด
                    </p>
                  ) : filteredMenus.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      ไม่พบเมนูที่ตรงกับ “{menuQuery.trim()}”
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {filteredMenus.map((m) => (
                        <li
                          key={m.name}
                          className="flex items-center justify-between gap-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {m.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {m.quantity.toLocaleString("th-TH")} ชิ้น
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-slate-800">
                            {formatPrice(m.revenueBaht)}฿
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    สต็อกที่หักจากการขาย
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    รวมตามเมนูจากออเดอร์ที่ตัดสต็อกแล้วในรอบนี้
                  </p>
                </div>
                {filteredStockDeductions.length > 0 ? (
                  <p className="text-xs font-semibold text-slate-600">
                    รวม {stockTotalQty.toLocaleString("th-TH")} ชิ้น
                  </p>
                ) : null}
              </div>
              {stockDeductions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  ยังไม่มีรายการหักสต็อกในรอบนี้
                </p>
              ) : filteredStockDeductions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  ไม่พบรายการที่ตรงกับ “{menuQuery.trim()}”
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredStockDeductions.map((row) => (
                    <li
                      key={row.menuItemId}
                      className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {row.name}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                          {row.orders.map((o) => (
                            <Link
                              key={o.id}
                              href={`/admin/orders/${o.id}`}
                              className="font-medium text-site-primary hover:underline"
                            >
                              {o.orderNumber || o.id.slice(0, 8)}
                            </Link>
                          ))}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-red-700 tabular-nums">
                        −{row.quantity.toLocaleString("th-TH")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <AdminModal
        open={cancelModalOpen}
        busy={statusBusy}
        maxWidthClassName="max-w-md"
        onClose={() => {
          if (!statusBusy) setCancelModalOpen(false);
        }}
        title="ยกเลิกรอบขาย?"
      >
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-600">
            รอบที่เลือกจะถูกตั้งเป็นสถานะยกเลิก — ถ้ายังเปิดอยู่ระบบจะปิดรอบและปิดร้านให้
            <span className="mt-1 block font-medium text-red-700">
              ทุกรายการออเดอร์ในรอบนี้จะถูกยกเลิกด้วย และของที่หักสต๊อกแล้วจะคืนเข้าสต๊อก
            </span>
            <span className="mt-1 block text-slate-500">
              ถ้ากดผิดภายหลัง สามารถกด &quot;กู้คืนรอบ&quot; เพื่อคืนสถานะออเดอร์และตัดสต๊อกใหม่ได้
            </span>
          </p>
          <div>
            <label className={adminLabelClass} htmlFor="shift-cancel-note">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <textarea
              id="shift-cancel-note"
              className={adminInputClass}
              rows={2}
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              placeholder="เช่น เปิดผิดรอบ / ทดสอบ"
              disabled={statusBusy}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => setCancelModalOpen(false)}
              className={`flex-1 ${btnOutline}`}
            >
              ปิด
            </button>
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => void submitShiftStatus(true)}
              className={`flex-1 ${btnDanger}`}
            >
              {statusBusy ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}
            </button>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        open={restoreModalOpen}
        busy={statusBusy}
        maxWidthClassName="max-w-md"
        onClose={() => {
          if (!statusBusy) setRestoreModalOpen(false);
        }}
        title="กู้คืนรอบที่ยกเลิก?"
      >
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-600">
            ใช้เมื่อกดยกเลิกรอบผิด — ระบบจะ:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>ล้างสถานะยกเลิกรอบ</li>
            <li>คืนสถานะออเดอร์ที่ถูกยกเลิกจากการยกเลิกรอบ</li>
            <li>ตัดสต๊อกกลับเข้าออเดอร์ (เหมือนขายไปแล้วอีกครั้ง)</li>
          </ul>
          <p className="text-xs text-slate-500">
            ออเดอร์ที่พนักงานยกเลิกเอง (ไม่ใช่จากการยกเลิกรอบ) จะไม่ถูกกู้คืน
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => setRestoreModalOpen(false)}
              className={`flex-1 ${btnOutline}`}
            >
              ปิด
            </button>
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => void submitShiftStatus(false)}
              className={`flex-1 ${btnPrimary}`}
            >
              {statusBusy ? "กำลังกู้คืน…" : "ยืนยันกู้คืน"}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
