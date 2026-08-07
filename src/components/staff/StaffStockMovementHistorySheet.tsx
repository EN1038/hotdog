"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { bangkokDateKey, isBangkokDateKey } from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";

type MovementKind = "stock_in" | "issue";

type BatchLine = {
  id: string;
  name: string;
  quantity: number;
  signedQuantity: number;
  unit: string;
  stockType: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
  isCancelled?: boolean;
};

type Batch = {
  id: string;
  kind: MovementKind;
  createdAt: string;
  note: string | null;
  imageUrl: string | null;
  createdByStaff: { id: string; name: string } | null;
  itemCount: number;
  totalQty: number;
  isCancelled?: boolean;
  cancelledAt?: string | null;
  cancelNote?: string | null;
  lines: BatchLine[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  kind: MovementKind;
  onCreateNew: () => void;
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

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
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

const KIND_LABEL: Record<MovementKind, string> = {
  stock_in: "รับเข้า",
  issue: "จ่ายออก",
};

const STOCK_TYPE_LABEL: Record<BatchLine["stockType"], string> = {
  SALE_ITEM: "เมนูขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

function batchTypeLabel(batch: Batch) {
  const types = Array.from(
    new Set(batch.lines.map((l) => l.stockType).filter(Boolean)),
  );
  if (types.length === 0) return "—";
  if (types.length === 1) return STOCK_TYPE_LABEL[types[0]!];
  return types.map((t) => STOCK_TYPE_LABEL[t]).join(" · ");
}

export function StaffStockMovementHistorySheet({
  open,
  onClose,
  kind,
  onCreateNew,
  brandName: brandNameProp,
  branchName: branchNameProp,
}: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(() =>
    bangkokDateKey(),
  );
  const [batches, setBatches] = useState<Batch[]>([]);
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
    setDate(bangkokDateKey());
    setExportMsg("");
  }, [open, kind]);

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
          `/api/staff/stock/movements?date=${encodeURIComponent(date)}&kind=${kind}`,
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "โหลดไม่สำเร็จ");
          setBatches([]);
          setSelectedId(null);
          return;
        }
        const next = Array.isArray(data.batches)
          ? (data.batches as Batch[])
          : [];
        setBatches(next);
        setSelectedId(next[0]?.id ?? null);
      } catch {
        if (!cancelled) {
          setError("โหลดไม่สำเร็จ");
          setBatches([]);
          setSelectedId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, date, kind]);

  const selected = batches.find((b) => b.id === selectedId) ?? null;
  const title = KIND_LABEL[kind];
  const branchLabel = formatBranchLabel(branchName);

  async function capturePng(): Promise<string> {
    const node = captureRef.current;
    if (!node) throw new Error("ไม่พบเนื้อหา");
    return toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
  }

  function exportFilename() {
    const hm = selected ? formatHm(selected.createdAt).replace(":", "") : "";
    return `${title}_${date}_${hm || "ประวัติ"}.png`;
  }

  async function handleSaveImage() {
    if (!selected || exportBusy) return;
    setExportBusy("save");
    setExportMsg("");
    try {
      const dataUrl = await capturePng();
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
      const dataUrl = await capturePng();
      const blob = await dataUrlToBlob(dataUrl);
      const file = new File([blob], exportFilename(), { type: "image/png" });

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          files: [file],
          title: [brandName, branchLabel ? `สาขา ${branchLabel}` : "", title]
            .filter(Boolean)
            .join(" · "),
          text: `${title} ${formatDateTime(selected.createdAt)}`,
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
    const lines: string[] = [];
    if (brandName) lines.push(brandName);
    if (branchLabel) lines.push(`สาขา ${branchLabel}`);
    lines.push(`ประวัติ${title}`);
    if (selected.isCancelled) {
      lines.push("สถานะ: ยกเลิก");
      if (selected.cancelNote) lines.push(`เหตุผล: ${selected.cancelNote}`);
      if (selected.cancelledAt) {
        lines.push(`ยกเลิกเมื่อ: ${formatDateTime(selected.cancelledAt)}`);
      }
    }
    lines.push(`บันทึกเมื่อ: ${formatDateTime(selected.createdAt)}`);
    lines.push(`ผู้บันทึก: ${selected.createdByStaff?.name ?? "—"}`);
    lines.push(`ประเภท: ${batchTypeLabel(selected)}`);
    if (selected.note) lines.push(`รายละเอียด: ${selected.note}`);
    lines.push(
      `จำนวนรายการ: ${selected.itemCount.toLocaleString("th-TH")} · รวม ${selected.totalQty.toLocaleString("th-TH")}`,
    );
    lines.push("");
    lines.push("รายการ:");
    selected.lines.forEach((line, index) => {
      const unit =
        line.stockType !== "SALE_ITEM" && line.unit?.trim()
          ? ` (${line.unit.trim()})`
          : "";
      const typeLabel = STOCK_TYPE_LABEL[line.stockType];
      const cancelTag = line.isCancelled ? " [ยกเลิก]" : "";
      lines.push(
        `${index + 1}. [${typeLabel}] ${line.name}${unit}: ${line.quantity.toLocaleString("th-TH")}${cancelTag}`,
      );
    });
    return lines.join("\n");
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

  function handleCreate() {
    onCreateNew();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`ประวัติ${title}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-base font-bold text-gray-900">ประวัติ{title}</p>
            <p className="text-xs text-gray-500">
              เลือกวันเพื่อดูประวัติ หรือสร้าง{title}ใหม่
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
                if (e.target.value && isBangkokDateKey(e.target.value)) {
                  setDate(e.target.value);
                } else if (e.target.value) {
                  setDate(e.target.value);
                }
              }}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900"
            />
          </label>

          {loading ? (
            <p className="text-sm text-gray-500">กำลังโหลด…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : batches.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
              ยังไม่มี{title}ในวันที่ {formatOperatingDayLabel(date) || date}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {batches.map((b) => {
                  const active = b.id === selectedId;
                  const typeLabel = batchTypeLabel(b);
                  const cancelled = Boolean(b.isCancelled);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedId(b.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs ${
                        active
                          ? cancelled
                            ? "border-red-500 bg-red-50 font-bold text-red-800"
                            : kind === "stock_in"
                              ? "border-emerald-500 bg-emerald-50 font-bold text-emerald-800"
                              : "border-amber-500 bg-amber-50 font-bold text-amber-800"
                          : cancelled
                            ? "border-red-200 bg-red-50/70 text-red-700"
                            : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      <span className="block font-semibold">
                        {typeLabel}
                        {cancelled ? " · ยกเลิก" : ""}
                      </span>
                      <span className="mt-0.5 block">
                        {b.itemCount.toLocaleString("th-TH")} รายการ · รวม{" "}
                        {b.totalQty.toLocaleString("th-TH")}
                      </span>
                      <span className="mt-0.5 block opacity-80">
                        {formatHm(b.createdAt)} น.
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
                      {branchLabel ? (
                        <p className="mt-0.5 text-sm font-semibold text-gray-800">
                          สาขา {branchLabel}
                        </p>
                      ) : null}
                      <p
                        className={`text-xs font-medium ${
                          selected.isCancelled ? "text-red-600" : "text-gray-500"
                        } ${brandName || branchLabel ? "mt-1.5" : ""}`}
                      >
                        ประวัติ{title}
                        {selected.isCancelled ? " · ยกเลิก" : ""}
                      </p>
                    </div>

                    {selected.isCancelled ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-1">
                        <SummaryRow
                          label="สถานะ"
                          value="ยกเลิก"
                          labelClassName="font-medium text-red-800"
                          valueClassName="text-red-700"
                        />
                        {selected.cancelNote ? (
                          <SummaryRow
                            label="เหตุผล"
                            value={selected.cancelNote}
                            labelClassName="text-red-800"
                            valueClassName="text-red-800"
                          />
                        ) : null}
                        {selected.cancelledAt ? (
                          <SummaryRow
                            label="ยกเลิกเมื่อ"
                            value={formatDateTime(selected.cancelledAt)}
                            labelClassName="text-red-800"
                            valueClassName="text-red-800"
                            last
                          />
                        ) : (
                          <SummaryRow
                            label="หมายเหตุ"
                            value="ถูกยกเลิกจากแอดมิน — ยอดสต๊อกถูกคืนแล้ว"
                            labelClassName="text-red-800"
                            valueClassName="text-red-700"
                            last
                          />
                        )}
                      </div>
                    ) : null}

                    <div
                      className={`rounded-xl border bg-white px-3 py-1 ${
                        selected.isCancelled
                          ? "border-red-200 opacity-90"
                          : "border-gray-200"
                      }`}
                    >
                      <SummaryRow
                        label="บันทึกเมื่อ"
                        value={formatDateTime(selected.createdAt)}
                      />
                      <SummaryRow
                        label="ผู้บันทึก"
                        value={selected.createdByStaff?.name ?? "—"}
                      />
                      <SummaryRow
                        label="ประเภท"
                        value={batchTypeLabel(selected)}
                      />
                      {selected.note ? (
                        <SummaryRow label="รายละเอียด" value={selected.note} />
                      ) : null}
                      <SummaryRow
                        label="จำนวนรายการ"
                        value={`${selected.itemCount.toLocaleString("th-TH")} รายการ`}
                      />
                      <SummaryRow
                        label="จำนวนรวม"
                        value={selected.totalQty.toLocaleString("th-TH")}
                        last={!selected.imageUrl}
                        valueClassName={
                          selected.isCancelled
                            ? "text-slate-400 line-through"
                            : undefined
                        }
                      />
                      {selected.imageUrl ? (
                        <div className="px-1 py-2.5">
                          <p className="mb-1.5 text-sm text-gray-600">รูปประกอบ</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={selected.imageUrl}
                            alt="รูปประกอบ"
                            className="mx-auto max-h-48 rounded-xl object-contain ring-1 ring-gray-200"
                          />
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-gray-700">
                        รายการ{title}
                      </p>
                      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                        {selected.lines.map((line, index) => {
                          const lineCancelled = Boolean(
                            line.isCancelled || selected.isCancelled,
                          );
                          return (
                            <li
                              key={line.id}
                              className={`flex items-center justify-between gap-3 px-3 py-2.5 ${
                                lineCancelled ? "bg-red-50/50" : "bg-white"
                              }`}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-slate-500">
                                  {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-gray-900">
                                    {line.name}
                                    {lineCancelled ? (
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
                                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                                    {STOCK_TYPE_LABEL[line.stockType]}
                                  </p>
                                </div>
                              </div>
                              <p
                                className={`shrink-0 text-sm font-bold tabular-nums ${
                                  lineCancelled
                                    ? "text-slate-400 line-through"
                                    : "text-gray-900"
                                }`}
                              >
                                {line.quantity.toLocaleString("th-TH")}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
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
                disabled={!!exportBusy}
                onClick={() => void handleSaveImage()}
                className="rounded-xl border border-gray-300 bg-white px-2 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              >
                {exportBusy === "save" ? "กำลังบันทึก…" : "Save รูป"}
              </button>
              <button
                type="button"
                disabled={!!exportBusy}
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
            onClick={handleCreate}
            className={`w-full rounded-xl px-4 py-3 text-sm font-bold text-white ${
              kind === "stock_in"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-amber-500 hover:bg-amber-600"
            }`}
          >
            สร้าง{title}ใหม่
          </button>
        </div>
      </div>
    </div>
  );
}
