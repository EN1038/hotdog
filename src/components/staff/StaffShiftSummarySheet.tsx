"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  bangkokDateKey,
  formatPrice,
  isBangkokDateKey,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";
import { StaffOrderHistoryDetail } from "@/components/staff/StaffOrderHistoryDetail";
import { ShareExportMenu } from "@/components/staff/ShareExportMenu";
import { DateInput } from "@/components/DateInput";
import { formatQueueNumber } from "@/lib/order-queue-format";

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
  }>;
  menus: Array<{ name: string; quantity: number; revenueBaht: number }>;
  channels?: Array<{
    channel: string;
    label: string;
    orderCount: number;
    revenueBaht: number;
  }>;
};

type Props = {
  open?: boolean;
  onClose?: () => void;
  /** sheet = bottom modal (default); inline = embed on page */
  variant?: "sheet" | "inline";
  initialDate?: string | null;
  /** When both set, load shifts across the range (overrides single initialDate for listing) */
  dateFrom?: string | null;
  dateTo?: string | null;
  brandName?: string | null;
  branchName?: string | null;
};

function formatBranchLabel(branchName: string) {
  const trimmed = branchName.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^สาขา\s*/i, "");
}

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
        last ? "" : "border-b border-gray-200"
      }`}
    >
      <span className={labelClassName ?? "text-gray-600"}>{label}</span>
      <span
        className={`text-right font-semibold ${
          valueClassName ?? "text-gray-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
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

export function StaffShiftSummarySheet({
  open = true,
  onClose,
  variant = "sheet",
  initialDate,
  dateFrom,
  dateTo,
  brandName: brandNameProp,
  branchName: branchNameProp,
}: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const rangeMode =
    Boolean(dateFrom && isBangkokDateKey(dateFrom)) &&
    Boolean(dateTo && isBangkokDateKey(dateTo));
  const [date, setDate] = useState(
    () =>
      (initialDate && isBangkokDateKey(initialDate)
        ? initialDate
        : bangkokDateKey()),
  );
  const [shifts, setShifts] = useState<ShiftListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState("");
  const [exportBusy, setExportBusy] = useState<"save" | "share" | "copy" | null>(
    null,
  );
  const [exportMsg, setExportMsg] = useState("");
  const [brandName, setBrandName] = useState(brandNameProp?.trim() || "");
  const [branchName, setBranchName] = useState(branchNameProp?.trim() || "");
  const [shiftOrders, setShiftOrders] = useState<
    Array<{
      id: string;
      orderNumber: string;
      queueNumber: number;
      status: string;
      paymentMethod: string;
      customerName: string | null;
      createdAt: string;
      itemCount: number;
      total: number;
    }>
  >([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (rangeMode) {
      setSelectedId(null);
      setSummary(null);
      setExportMsg("");
      setDetailOrderId(null);
      setShiftOrders([]);
      return;
    }
    const next =
      initialDate && isBangkokDateKey(initialDate)
        ? initialDate
        : bangkokDateKey();
    setDate(next);
    setSelectedId(null);
    setSummary(null);
    setExportMsg("");
    setDetailOrderId(null);
    setShiftOrders([]);
  }, [open, initialDate, rangeMode, dateFrom, dateTo]);

  useEffect(() => {
    if (brandNameProp?.trim()) setBrandName(brandNameProp.trim());
    if (branchNameProp?.trim()) setBranchName(branchNameProp.trim());
  }, [brandNameProp, branchNameProp]);

  useEffect(() => {
    if (!open) return;
    if (brandNameProp?.trim() && branchNameProp?.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/staff/branding");
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const nextBrand =
          (typeof data.brand?.nameTh === "string" && data.brand.nameTh.trim()) ||
          (typeof data.brand?.name === "string" && data.brand.name.trim()) ||
          "";
        const nextBranch =
          typeof data.branchName === "string" ? data.branchName.trim() : "";
        if (nextBrand) setBrandName(nextBrand);
        if (nextBranch) setBranchName(nextBranch);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, brandNameProp, branchNameProp]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      setError("");
      try {
        const qs =
          rangeMode && dateFrom && dateTo
            ? `from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`
            : `date=${encodeURIComponent(date)}`;
        const res = await fetch(`/api/staff/shifts?${qs}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "โหลดรอบไม่สำเร็จ");
          setShifts([]);
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
  }, [open, date, rangeMode, dateFrom, dateTo]);

  useEffect(() => {
    if (!open || !selectedId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSummary(true);
      setError("");
      setExportMsg("");
      try {
        const res = await fetch(`/api/staff/shifts/${selectedId}/summary`);
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
  }, [open, selectedId]);

  useEffect(() => {
    if (!open || !selectedId) {
      setShiftOrders([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingOrders(true);
      try {
        const res = await fetch(`/api/staff/shifts/${selectedId}/orders`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setShiftOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch {
        if (!cancelled) setShiftOrders([]);
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedId]);

  async function captureSummaryPng(): Promise<string> {
    const node = captureRef.current;
    if (!node) throw new Error("ไม่พบเนื้อหาสรุป");
    return toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
  }

  function exportFilename() {
    const round = summary?.shift.roundNumber ?? "";
    return `สรุปยอดขายตามรอบ_${date}_รอบ${round}.png`;
  }

  async function handleSaveImage() {
    if (!summary || exportBusy) return;
    setExportBusy("save");
    setExportMsg("");
    try {
      const dataUrl = await captureSummaryPng();
      downloadDataUrl(dataUrl, exportFilename());
      setExportMsg("บันทึกรูปแล้ว");
    } catch {
      setExportMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareImage() {
    if (!summary || exportBusy) return;
    setExportBusy("share");
    setExportMsg("");
    try {
      const dataUrl = await captureSummaryPng();
      const blob = await dataUrlToBlob(dataUrl);
      const file = new File([blob], exportFilename(), { type: "image/png" });

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          files: [file],
          title: [
            brandName,
            formatBranchLabel(branchName)
              ? `สาขา ${formatBranchLabel(branchName)}`
              : "",
            "สรุปยอดขายตามรอบ",
          ]
            .filter(Boolean)
            .join(" · "),
          text: summary.shift.code,
        });
        setExportMsg("แชร์รูปแล้ว");
        return;
      }

      downloadDataUrl(dataUrl, exportFilename());
      setExportMsg("อุปกรณ์นี้แชร์ไม่ได้ — บันทึกรูปแทนแล้ว ส่งในไลน์จากแกลเลอรี");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setExportMsg("");
        return;
      }
      setExportMsg("แชร์รูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  function buildCopyText() {
    if (!summary) return "";
    const branchLabel = formatBranchLabel(branchName);
    const lines: string[] = [];
    if (brandName) lines.push(brandName);
    if (branchLabel) lines.push(`สาขา ${branchLabel}`);
    lines.push("สรุปยอดขายตามรอบ");
    if (summary.shift.isCancelled) {
      lines.push("สถานะรอบ: ยกเลิก");
      if (summary.shift.cancelNote) {
        lines.push(`เหตุผล: ${summary.shift.cancelNote}`);
      }
      if (summary.shift.cancelledAt) {
        lines.push(
          `ยกเลิกเมื่อ: ${formatShiftDateTime(summary.shift.cancelledAt)}`,
        );
      }
    }
    lines.push(`เลขที่รอบ: ${summary.shift.code}`);
    lines.push(`รอบที่: ${summary.shift.roundNumber}`);
    lines.push(`วันที่และเวลาเปิด: ${formatShiftDateTime(summary.shift.openedAt)}`);
    lines.push(
      `วันที่และเวลาปิด: ${
        summary.shift.closedAt
          ? formatShiftDateTime(summary.shift.closedAt)
          : "ยังไม่ปิดรอบ"
      }`,
    );
    lines.push(
      `จำนวนออเดอร์: ${summary.orderCount.toLocaleString("th-TH")} ออเดอร์`,
    );
    if (summary.cancelledOrders > 0 || summary.shift.isCancelled) {
      lines.push(
        `ออเดอร์ยกเลิก: ${summary.cancelledOrders.toLocaleString("th-TH")} ออเดอร์`,
      );
      lines.push(
        `ยอดเงินที่ยกเลิก: ${formatPrice(summary.cancelledRevenueBaht ?? 0)} บาท`,
      );
      const restored =
        summary.stockRestoredQuantity ?? summary.cancelledItemQuantity ?? 0;
      lines.push(
        `สต๊อกที่คืน: ${restored.toLocaleString("th-TH")} ชิ้น`,
      );
    }
    lines.push(
      `เงินเริ่มต้น: ${formatPrice(summary.shift.openingCash)} บาท`,
    );
    if (summary.shift.note) lines.push(`หมายเหตุ: ${summary.shift.note}`);
    lines.push(`ยอดเงินสด: ${formatPrice(summary.cashRevenueBaht)} บาท`);
    lines.push(`ยอดเงินโอน: ${formatPrice(summary.transferRevenueBaht)} บาท`);
    lines.push(`ยอดขายสุทธิ: ${formatPrice(summary.revenueBaht)} บาท`);
    lines.push(
      `ยอดรวมเงินเริ่มต้น: ${formatPrice(summary.totalWithOpeningCash)} บาท`,
    );
    lines.push(
      `จำนวนของแถม: ${summary.giftQuantity.toLocaleString("th-TH")} ชิ้น`,
    );
    lines.push("");
    lines.push("สรุปช่องทาง:");
    const channels = summary.channels ?? [];
    if (channels.length === 0) {
      lines.push("- ยังไม่มีออเดอร์ที่นับยอด");
    } else {
      channels.forEach((c, index) => {
        lines.push(
          `${index + 1}. ${c.label}: ${c.orderCount.toLocaleString("th-TH")} ออเดอร์ · ${formatPrice(c.revenueBaht)}฿`,
        );
      });
    }
    lines.push("");
    lines.push("เมนูที่ขาย:");
    if (summary.menus.length === 0) {
      lines.push("- ยังไม่มีรายการที่นับยอด");
    } else {
      summary.menus.forEach((m, index) => {
        lines.push(
          `${index + 1}. ${m.name}: ${m.quantity.toLocaleString("th-TH")} ชิ้น · ${formatPrice(m.revenueBaht)}฿`,
        );
      });
    }
    return lines.join("\n");
  }

  async function copyTextToClipboard(text: string) {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("copy failed");
  }

  async function handleCopyText() {
    if (!summary || exportBusy) return;
    setExportBusy("copy");
    setExportMsg("");
    try {
      await copyTextToClipboard(buildCopyText());
      setExportMsg("คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย");
    } catch {
      setExportMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  if (variant === "sheet" && !open) return null;

  const branchLabel = formatBranchLabel(branchName);

  const panel = (
    <>
        {variant === "sheet" ? (
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <p className="text-base font-bold text-gray-900">
                สรุปยอดขายตามรอบ
              </p>
              <p className="text-xs text-gray-500">
                เลือกวันและรอบเพื่อดูยอดขาย
              </p>
            </div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                ปิด
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${
            variant === "inline" ? "px-0 py-0" : "px-4 py-3"
          }`}
        >
          {variant === "sheet" && !rangeMode ? (
            <label className="block text-xs font-medium text-gray-600">
              วันที่
              <DateInput
                value={date}
                max={bangkokDateKey()}
                aria-label="วันที่"
                onChange={(v) => {
                  if (v) setDate(v);
                }}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900"
              />
            </label>
          ) : null}

          {variant === "inline" ? (
            <p className="text-[13px] font-semibold text-slate-600">
              {rangeMode && dateFrom && dateTo
                ? dateFrom === dateTo
                  ? `เลือกรอบ · ${formatOperatingDayLabel(dateTo)}`
                  : `เลือกรอบในช่วงที่เลือก (${shifts.length} รอบ)`
                : `เลือกรอบขาย · ${formatOperatingDayLabel(date)}`}
            </p>
          ) : null}

          {loadingList ? (
            <p className="text-sm text-gray-500">กำลังโหลดรอบ…</p>
          ) : shifts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
              {rangeMode
                ? "ไม่มีรอบขายในช่วงวันที่เลือก"
                : `ไม่มีรอบในวันที่ ${formatOperatingDayLabel(date)}`}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shifts.map((s) => {
                const selected = s.id === selectedId;
                const cancelled = Boolean(s.isCancelled || s.cancelledAt);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs ${
                      selected
                        ? cancelled
                          ? "border-red-500 bg-red-50 font-bold text-red-700"
                          : "border-site-primary bg-site-primary-soft font-bold text-site-primary"
                        : cancelled
                          ? "border-red-200 bg-red-50/80 text-red-700"
                          : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    <span className="block">
                      {rangeMode && s.calendarDate
                        ? `${formatOperatingDayLabel(s.calendarDate)} · `
                        : ""}
                      รอบที่ {s.roundNumber}
                      {cancelled ? " · ยกเลิก" : ""}
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

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {loadingSummary ? (
            <p className="text-sm text-gray-500">กำลังโหลดสรุป…</p>
          ) : summary ? (
            <div className="space-y-3">
              <div
                ref={captureRef}
                className="space-y-3 rounded-xl bg-white p-1"
              >
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-center">
                  {brandName ? (
                    <p className="text-base font-bold text-gray-900">
                      {brandName}
                    </p>
                  ) : null}
                  {branchLabel ? (
                    <p className="mt-0.5 text-sm font-semibold text-gray-800">
                      สาขา {branchLabel}
                    </p>
                  ) : null}
                  <p
                    className={`text-xs font-medium ${
                      summary.shift.isCancelled
                        ? "text-red-600"
                        : "text-gray-500"
                    } ${brandName || branchLabel ? "mt-1.5" : ""}`}
                  >
                    สรุปยอดขายตามรอบ
                    {summary.shift.isCancelled ? " · ยกเลิก" : ""}
                  </p>
                </div>

                {summary.shift.isCancelled || summary.cancelledOrders > 0 ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-1">
                    <SummaryRow
                      label="สถานะรอบ"
                      value={
                        summary.shift.isCancelled
                          ? "ยกเลิก"
                          : summary.shift.closedAt
                            ? "ปิดรอบแล้ว"
                            : "เปิดอยู่"
                      }
                      labelClassName="font-medium text-red-800"
                      valueClassName="text-red-700"
                    />
                    {summary.shift.isCancelled && summary.shift.cancelNote ? (
                      <SummaryRow
                        label="เหตุผลการยกเลิก"
                        value={summary.shift.cancelNote}
                        labelClassName="text-red-800"
                        valueClassName="text-red-800"
                      />
                    ) : null}
                    {summary.shift.isCancelled && summary.shift.cancelledAt ? (
                      <SummaryRow
                        label="ยกเลิกเมื่อ"
                        value={formatShiftDateTime(summary.shift.cancelledAt)}
                        labelClassName="text-red-800"
                        valueClassName="text-red-800"
                      />
                    ) : null}
                    <SummaryRow
                      label="ออเดอร์ที่ยกเลิก"
                      value={`${summary.cancelledOrders.toLocaleString("th-TH")} ออเดอร์`}
                      labelClassName="text-red-800"
                      valueClassName="text-red-700"
                    />
                    <SummaryRow
                      label="ยอดเงินที่ยกเลิก"
                      value={`${formatPrice(summary.cancelledRevenueBaht ?? 0)} บาท`}
                      labelClassName="text-red-800"
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
                      labelClassName="text-red-800"
                      valueClassName="text-red-700"
                      last
                    />
                  </div>
                ) : null}

                <div className="rounded-xl border border-gray-200 bg-white px-3 py-1">
                  <SummaryRow label="เลขที่รอบ" value={summary.shift.code} />
                  {!summary.shift.isCancelled && summary.cancelledOrders === 0 ? (
                    <SummaryRow
                      label="สถานะรอบ"
                      value={
                        summary.shift.closedAt ? "ปิดรอบแล้ว" : "เปิดอยู่"
                      }
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

                {(summary.stockRestored?.length ?? 0) > 0 ? (
                  <div>
                    <p className="mb-2 text-sm font-bold text-red-800">
                      รายการสต๊อกที่คืน
                    </p>
                    <ul className="divide-y divide-red-100 rounded-xl border border-red-200 bg-red-50/40">
                      {summary.stockRestored!.map((m) => (
                        <li
                          key={m.menuItemId}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <p className="min-w-0 truncate text-sm font-medium text-gray-900">
                            {m.name}
                          </p>
                          <p className="shrink-0 text-sm font-semibold text-red-700">
                            +{m.quantity.toLocaleString("th-TH")} ชิ้น
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-sm font-bold text-gray-900">
                    สรุปช่องทาง
                  </p>
                  {(summary.channels ?? []).length === 0 ? (
                    <p className="text-sm text-gray-500">
                      ยังไม่มีออเดอร์ที่นับยอด
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                      {(summary.channels ?? []).map((c, index) => (
                        <li
                          key={c.channel}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-slate-500">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">
                                {c.label}
                              </p>
                              <p className="text-xs text-gray-500">
                                {c.orderCount.toLocaleString("th-TH")} ออเดอร์
                              </p>
                            </div>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-gray-800">
                            {formatPrice(c.revenueBaht)}฿
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-bold text-gray-900">
                    เมนูที่ขาย
                  </p>
                  {summary.menus.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      ยังไม่มีรายการที่นับยอด
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                      {summary.menus.map((m, index) => (
                        <li
                          key={m.name}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-slate-500">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">
                                {m.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {m.quantity.toLocaleString("th-TH")} ชิ้น
                              </p>
                            </div>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-gray-800">
                            {formatPrice(m.revenueBaht)}฿
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-bold text-gray-900">
                  ออเดอร์ในรอบนี้
                </p>
                {loadingOrders ? (
                  <p className="text-sm text-gray-500">กำลังโหลดออเดอร์…</p>
                ) : shiftOrders.length === 0 ? (
                  <p className="text-sm text-gray-500">ยังไม่มีออเดอร์ในรอบนี้</p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {shiftOrders.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => setDetailOrderId(o.id)}
                          className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left active:bg-gray-50"
                        >
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-gray-400">
                              {formatHm(o.createdAt)}
                              {o.queueNumber != null
                                ? ` · คิว ${formatQueueNumber(o.queueNumber)}`
                                : ""}
                            </span>
                            <span className="mt-0.5 block truncate text-sm font-bold text-gray-900">
                              {o.customerName || `#${o.orderNumber}`}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-gray-500">
                              {(ORDER_STATUS_LABELS as Record<string, string>)[
                                o.status
                              ] ?? o.status}
                              {" · "}
                              {(PAYMENT_METHOD_LABELS as Record<string, string>)[
                                o.paymentMethod
                              ] ?? o.paymentMethod}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-sm font-extrabold tabular-nums text-gray-900">
                              ฿{formatPrice(o.total)}
                            </span>
                            <span className="text-[11px] font-semibold text-site-primary">
                              ดู ›
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

            </div>
          ) : null}
        </div>

        {summary ? (
          <div
            className={
              variant === "inline"
                ? "sticky bottom-[4.75rem] z-30 -mx-1 flex items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-1 py-2.5 backdrop-blur"
                : "flex shrink-0 items-center justify-between gap-2 border-t border-gray-100 bg-white px-4 py-2.5"
            }
          >
            <p className="min-w-0 flex-1 text-[12px] font-medium text-slate-500">
              {exportMsg || "กดแชร์เพื่อส่งสรุปรอบนี้"}
            </p>
            <ShareExportMenu
              busy={exportBusy}
              message={exportMsg}
              onShareImage={handleShareImage}
              onSaveImage={handleSaveImage}
              onCopyText={handleCopyText}
            />
          </div>
        ) : null}

      <StaffOrderHistoryDetail
        open={Boolean(detailOrderId)}
        orderId={detailOrderId}
        onClose={() => setDetailOrderId(null)}
        brandName={brandName}
        branchName={branchName}
      />
    </>
  );

  if (variant === "inline") {
    return (
      <div className="space-y-3" aria-label="สรุปยอดขายตามรอบ">
        {panel}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="สรุปยอดขายตามรอบ"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {panel}
      </div>
    </div>
  );
}
