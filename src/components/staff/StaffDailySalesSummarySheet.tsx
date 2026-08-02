"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toPng } from "html-to-image";
import { bangkokDateKey, formatPrice, isBangkokDateKey } from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";

type StockLine = {
  name: string;
  systemQty: number;
  countedQty: number;
  unitPrice?: number;
  seq?: number;
};

type StockTotals = {
  systemQty: number;
  countedQty: number;
  systemValueBaht: number;
  countedValueBaht: number;
};

type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

const STOCK_TYPE_LABEL: Record<StockType, string> = {
  SALE_ITEM: "เมนูขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

type DailySummary = {
  id: string;
  name: string;
  status?: string;
  pendingAdminApply?: boolean;
  completedAt: string;
  shiftId: string | null;
  shift: {
    id: string;
    roundNumber: number;
    openedAt: string;
    closedAt: string | null;
  } | null;
  createdByStaff: { id: string; name: string } | null;
  stockType?: StockType;
  cash: number;
  transfer: number;
  change: number;
  customers: number;
  lines: StockLine[];
  stockTotals?: StockTotals;
  rawNote: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialDate?: string | null;
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
    return `${date} เวลา ${formatHm(iso)} น.`;
  } catch {
    return "—";
  }
}

function computeStockTotals(lines: StockLine[]): StockTotals {
  return lines.reduce(
    (acc, line) => {
      const price = Number(line.unitPrice) || 0;
      return {
        systemQty: acc.systemQty + line.systemQty,
        countedQty: acc.countedQty + line.countedQty,
        systemValueBaht: acc.systemValueBaht + line.systemQty * price,
        countedValueBaht: acc.countedValueBaht + line.countedQty * price,
      };
    },
    {
      systemQty: 0,
      countedQty: 0,
      systemValueBaht: 0,
      countedValueBaht: 0,
    },
  );
}

function SummaryRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-1 py-2.5 text-sm ${
        last ? "" : "border-b border-gray-200"
      }`}
    >
      <span className="text-gray-600">{label}</span>
      <span className="text-right font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function StockTotalRow({
  label,
  qty,
  valueBaht,
  last = false,
  emphasize = false,
}: {
  label: string;
  qty: number;
  valueBaht: number;
  last?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 px-1 py-2.5 text-sm ${
        last ? "" : "border-b border-gray-200"
      } ${emphasize ? "rounded-lg bg-red-50 px-2" : ""}`}
    >
      <span
        className={`min-w-0 shrink font-medium ${
          emphasize ? "text-red-700" : "text-gray-700"
        }`}
      >
        {label}
      </span>
      <div className="flex shrink-0 items-baseline gap-3 text-right">
        <span
          className={`tabular-nums font-bold ${
            emphasize ? "text-red-800" : "text-gray-900"
          }`}
        >
          {qty.toLocaleString("th-TH")}
        </span>
        <span
          className={`min-w-[7.5rem] tabular-nums font-semibold ${
            emphasize ? "text-red-800" : "text-gray-900"
          }`}
        >
          มูลค่า {formatPrice(valueBaht)} บาท
        </span>
      </div>
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

export function StaffDailySalesSummarySheet({
  open,
  onClose,
  initialDate,
  brandName: brandNameProp,
  branchName: branchNameProp,
}: Props) {
  const router = useRouter();
  const captureRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(() =>
    initialDate && isBangkokDateKey(initialDate)
      ? initialDate
      : bangkokDateKey(),
  );
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportBusy, setExportBusy] = useState<"save" | "share" | "copy" | null>(
    null,
  );
  const [exportMsg, setExportMsg] = useState("");
  const [brandName, setBrandName] = useState(brandNameProp?.trim() || "");
  const [branchName, setBranchName] = useState(branchNameProp?.trim() || "");

  useEffect(() => {
    if (!open) return;
    // Prefer explicit date; otherwise Bangkok calendar today (not shift operating day).
    setDate(
      initialDate && isBangkokDateKey(initialDate)
        ? initialDate
        : bangkokDateKey(),
    );
  }, [open, initialDate]);

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
      setLoading(true);
      setError("");
      setExportMsg("");
      try {
        const res = await fetch(
          `/api/staff/stock/summaries?date=${encodeURIComponent(date)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "โหลดไม่สำเร็จ");
          setSummaries([]);
          setSelectedId(null);
          return;
        }
        const nextSummaries = Array.isArray(data.summaries)
          ? (data.summaries as DailySummary[])
          : [];
        setSummaries(nextSummaries);
        setSelectedId(nextSummaries[0]?.id ?? null);
      } catch {
        if (!cancelled) {
          setError("โหลดไม่สำเร็จ");
          setSummaries([]);
          setSelectedId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, date]);

  const selected = summaries.find((s) => s.id === selectedId) ?? null;
  const selectedStockType: StockType = selected?.stockType ?? "SALE_ITEM";
  const selectedIncludesSales = selectedStockType === "SALE_ITEM";
  const selectedTypeLabel = STOCK_TYPE_LABEL[selectedStockType];
  const stockTotals =
    selected?.stockTotals ??
    (selected ? computeStockTotals(selected.lines) : null);
  const mismatchLines =
    selected?.lines.filter((line) => line.systemQty !== line.countedQty) ?? [];
  const stockTotalsMismatch = Boolean(
    stockTotals && stockTotals.systemQty !== stockTotals.countedQty,
  );

  function goCreate() {
    onClose();
    router.push("/staff/stock?action=summary");
  }

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
    const round = selected?.shift
      ? `รอบ${selected.shift.roundNumber}`
      : "สรุป";
    return `สรุปนับสต็อก_${date}_${round}.png`;
  }

  async function handleSaveImage() {
    if (!selected || exportBusy) return;
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
    if (!selected || exportBusy) return;
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
          title: [brandName, formatBranchLabel(branchName) ? `สาขา ${formatBranchLabel(branchName)}` : "", "สรุปนับสต็อก"]
            .filter(Boolean)
            .join(" · "),
          text: selected.name,
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
    if (!selected) return "";
    const branchLabel = formatBranchLabel(branchName);
    const lines: string[] = [];
    if (brandName) lines.push(brandName);
    if (branchLabel) lines.push(`สาขา ${branchLabel}`);
    lines.push(
      selectedIncludesSales
        ? "สรุปยอดสต๊อกและขายราย"
        : `สรุปยอดสต๊อก · ${selectedTypeLabel}`,
    );
    lines.push(selected.name);
    lines.push(`ประเภท: ${selectedTypeLabel}`);
    lines.push(`บันทึกเมื่อ: ${formatShiftDateTime(selected.completedAt)}`);
    if (selected.shift) {
      lines.push(`รอบขาย: รอบที่ ${selected.shift.roundNumber}`);
    }
    lines.push(`ผู้บันทึก: ${selected.createdByStaff?.name ?? "—"}`);
    if (selectedIncludesSales) {
      lines.push(`ยอดเงินสด: ${formatPrice(selected.cash)} บาท`);
      lines.push(`ยอดเงินโอน: ${formatPrice(selected.transfer)} บาท`);
      lines.push(`เงินทอน: ${formatPrice(selected.change)} บาท`);
      lines.push(
        `จำนวนลูกค้า: ${selected.customers.toLocaleString("th-TH")} คิว`,
      );
    }
    if (stockTotals) {
      lines.push("");
      lines.push("สรุปสต็อก");
      lines.push(
        `สต๊อกปัจจุบัน (ระบบ): ${stockTotals.systemQty.toLocaleString("th-TH")} (มูลค่า ${formatPrice(stockTotals.systemValueBaht)} บาท)`,
      );
      lines.push(
        `สต๊อกที่นับได้: ${stockTotals.countedQty.toLocaleString("th-TH")} (มูลค่า ${formatPrice(stockTotals.countedValueBaht)} บาท)`,
      );
      if (mismatchLines.length > 0) {
        lines.push(
          `พบ ${mismatchLines.length} รายการที่ยอดนับได้ไม่ตรงสต๊อกปัจจุบัน`,
        );
      }
    }
    if (selected.lines.length > 0) {
      lines.push("");
      lines.push("สต็อกที่นับ:");
      selected.lines.forEach((line, index) => {
        const seq = line.seq && line.seq > 0 ? line.seq : index + 1;
        const isDiff = line.systemQty !== line.countedQty;
        const delta = line.countedQty - line.systemQty;
        lines.push(
          `${seq}. ${line.name}: ปัจจุบัน ${line.systemQty.toLocaleString("th-TH")} → นับได้ ${line.countedQty.toLocaleString("th-TH")}${
            isDiff
              ? ` (${delta > 0 ? "+" : ""}${delta.toLocaleString("th-TH")})`
              : ""
          }`,
        );
      });
    } else if (selected.rawNote) {
      lines.push("");
      lines.push(selected.rawNote);
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
    if (!selected || exportBusy) return;
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="สรุปยอดสต๊อกและขาย"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-base font-bold text-gray-900">
              สรุปยอดสต๊อกและขาย
            </p>
            <p className="text-xs text-gray-500">
              เลือกวันเพื่อดูสรุป หรือสร้างสรุปใหม่ตามประเภท
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-50"
          >
            ปิด
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block text-xs font-medium text-gray-600">
            วันที่
            <input
              type="date"
              value={date}
              max={bangkokDateKey()}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900"
            />
          </label>

          {loading ? (
            <p className="text-sm text-gray-500">กำลังโหลด…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : summaries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
              ยังไม่มีสรุปยอดสต๊อกในวันที่{" "}
              {formatOperatingDayLabel(date) || date}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {summaries.map((s) => {
                  const active = s.id === selectedId;
                  const typeLabel =
                    STOCK_TYPE_LABEL[s.stockType ?? "SALE_ITEM"];
                  const pending =
                    s.pendingAdminApply || s.status === "IN_PROGRESS";
                  const cancelled = s.status === "CANCELLED";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs ${
                        active
                          ? "border-blue-500 bg-blue-50 font-bold text-blue-700"
                          : cancelled
                            ? "border-slate-200 bg-slate-50 text-slate-500"
                            : pending
                              ? "border-amber-300 bg-amber-50 text-amber-900"
                              : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      <span className="block">{typeLabel}</span>
                      <span className="mt-0.5 block opacity-80">
                        {pending
                          ? "รอแอดมินปรับสต๊อก · "
                          : cancelled
                            ? "ปฏิเสธแล้ว · "
                            : ""}
                        {s.shift
                          ? `รอบที่ ${s.shift.roundNumber} · `
                          : ""}
                        {formatHm(s.completedAt)} น.
                      </span>
                    </button>
                  );
                })}
              </div>

              {selected ? (
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
                      {formatBranchLabel(branchName) ? (
                        <p className="mt-0.5 text-sm font-semibold text-gray-800">
                          สาขา {formatBranchLabel(branchName)}
                        </p>
                      ) : null}
                      <p
                        className={`text-xs font-medium text-gray-500 ${
                          brandName || formatBranchLabel(branchName)
                            ? "mt-1.5"
                            : ""
                        }`}
                      >
                        {selectedIncludesSales
                          ? "สรุปยอดสต๊อกและขายราย"
                          : `สรุปยอดสต๊อก · ${selectedTypeLabel}`}
                      </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-1">
                      <SummaryRow label="ชื่อสรุป" value={selected.name} />
                      <SummaryRow label="ประเภท" value={selectedTypeLabel} />
                      <SummaryRow
                        label="สถานะ"
                        value={
                          selected.pendingAdminApply ||
                          selected.status === "IN_PROGRESS"
                            ? "รอแอดมินปรับสต๊อก"
                            : selected.status === "CANCELLED"
                              ? "ปฏิเสธแล้ว"
                              : "ปรับสต๊อกแล้ว / บันทึกแล้ว"
                        }
                      />
                      <SummaryRow
                        label="บันทึกเมื่อ"
                        value={formatShiftDateTime(selected.completedAt)}
                      />
                      {selected.shift ? (
                        <SummaryRow
                          label="รอบขาย"
                          value={`รอบที่ ${selected.shift.roundNumber}`}
                        />
                      ) : null}
                      <SummaryRow
                        label="ผู้บันทึก"
                        value={selected.createdByStaff?.name ?? "—"}
                        last={!selectedIncludesSales}
                      />
                      {selectedIncludesSales ? (
                        <>
                          <SummaryRow
                            label="ยอดเงินสด"
                            value={`${formatPrice(selected.cash)} บาท`}
                          />
                          <SummaryRow
                            label="ยอดเงินโอน"
                            value={`${formatPrice(selected.transfer)} บาท`}
                          />
                          <SummaryRow
                            label="เงินทอน"
                            value={`${formatPrice(selected.change)} บาท`}
                          />
                          <SummaryRow
                            label="จำนวนลูกค้า"
                            value={`${selected.customers.toLocaleString("th-TH")} คิว`}
                            last
                          />
                        </>
                      ) : null}
                    </div>

                    {selected.lines.length > 0 && stockTotals ? (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-gray-700">
                          สรุปสต็อก
                        </p>
                        {stockTotalsMismatch || mismatchLines.length > 0 ? (
                          <p className="mb-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700">
                            พบ {mismatchLines.length} รายการที่ยอดนับได้ไม่ตรงสต๊อกปัจจุบัน
                          </p>
                        ) : null}
                        <div
                          className={`rounded-xl border bg-white px-3 py-1 ${
                            stockTotalsMismatch
                              ? "border-red-300"
                              : "border-gray-200"
                          }`}
                        >
                          <StockTotalRow
                            label="สต๊อกปัจจุบัน (ระบบ)"
                            qty={stockTotals.systemQty}
                            valueBaht={stockTotals.systemValueBaht}
                            emphasize={stockTotalsMismatch}
                          />
                          <StockTotalRow
                            label="สต๊อกที่นับได้"
                            qty={stockTotals.countedQty}
                            valueBaht={stockTotals.countedValueBaht}
                            last
                            emphasize={stockTotalsMismatch}
                          />
                        </div>
                      </div>
                    ) : null}

                    {selected.lines.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-gray-700">
                          สต็อกที่นับ
                        </p>
                        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                          {selected.lines.map((line, index) => {
                            const seq =
                              line.seq && line.seq > 0 ? line.seq : index + 1;
                            const isDiff = line.systemQty !== line.countedQty;
                            const delta = line.countedQty - line.systemQty;
                            return (
                              <li
                                key={`${seq}-${line.name}-${line.systemQty}-${line.countedQty}`}
                                className={`flex items-center justify-between gap-3 px-3 py-2.5 ${
                                  isDiff ? "bg-red-50" : "bg-white"
                                }`}
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <span
                                    className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${
                                      isDiff ? "text-red-600" : "text-slate-500"
                                    }`}
                                  >
                                    {seq}
                                  </span>
                                  <p
                                    className={`min-w-0 flex-1 truncate text-sm font-medium ${
                                      isDiff
                                        ? "font-bold text-red-800"
                                        : "text-gray-900"
                                    }`}
                                  >
                                    {line.name}
                                  </p>
                                </div>
                                <p
                                  className={`shrink-0 text-right text-sm font-semibold tabular-nums ${
                                    isDiff ? "text-red-800" : "text-gray-900"
                                  }`}
                                >
                                  ปัจจุบัน{" "}
                                  {line.systemQty.toLocaleString("th-TH")} →
                                  นับได้{" "}
                                  {line.countedQty.toLocaleString("th-TH")}
                                  {isDiff ? (
                                    <span className="ml-1 font-bold">
                                      ({delta > 0 ? "+" : ""}
                                      {delta.toLocaleString("th-TH")})
                                    </span>
                                  ) : null}
                                </p>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : selected.rawNote ? (
                      <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        {selected.rawNote}
                      </p>
                    ) : null}
                  </div>

                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="space-y-2 border-t border-gray-100 px-4 py-3">
          {selected ? (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!!exportBusy || selected.lines.length === 0}
                onClick={() => void handleSaveImage()}
                className="rounded-xl border border-gray-300 bg-white px-2 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              >
                {exportBusy === "save" ? "กำลังบันทึก…" : "Save รูป"}
              </button>
              <button
                type="button"
                disabled={!!exportBusy || selected.lines.length === 0}
                onClick={() => void handleShareImage()}
                className="rounded-xl border border-green-600 bg-green-50 px-2 py-2.5 text-sm font-bold text-green-800 hover:bg-green-100 disabled:opacity-60"
              >
                {exportBusy === "share" ? "กำลังแชร์…" : "แชร์รูป"}
              </button>
              <button
                type="button"
                disabled={!!exportBusy}
                onClick={() => void handleCopyText()}
                className="rounded-xl border border-blue-600 bg-blue-50 px-2 py-2.5 text-sm font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60"
              >
                {exportBusy === "copy" ? "กำลังคัดลอก…" : "Copy"}
              </button>
            </div>
          ) : null}
          {exportMsg ? (
            <p className="text-center text-xs text-gray-600">{exportMsg}</p>
          ) : selected ? (
            <p className="text-center text-xs text-gray-400">
              แชร์รูป หรือกด Copy แล้ววางข้อความในไลน์อีกช่องทาง
            </p>
          ) : null}
          <button
            type="button"
            onClick={goCreate}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"
          >
            สร้างสรุปยอด (เลือกประเภท)
          </button>
        </div>
      </div>
    </div>
  );
}
