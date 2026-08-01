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
};

type StockTotals = {
  systemQty: number;
  countedQty: number;
  systemValueBaht: number;
  countedValueBaht: number;
};

type DailySummary = {
  id: string;
  name: string;
  completedAt: string;
  shiftId: string | null;
  shift: {
    id: string;
    roundNumber: number;
    openedAt: string;
    closedAt: string | null;
  } | null;
  createdByStaff: { id: string; name: string } | null;
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
}: {
  label: string;
  qty: number;
  valueBaht: number;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 px-1 py-2.5 text-sm ${
        last ? "" : "border-b border-gray-200"
      }`}
    >
      <span className="min-w-0 shrink text-gray-700">{label}</span>
      <div className="flex shrink-0 items-baseline gap-3 text-right">
        <span className="tabular-nums font-bold text-gray-900">
          {qty.toLocaleString("th-TH")}
        </span>
        <span className="min-w-[7.5rem] tabular-nums font-semibold text-gray-900">
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
  const [exportBusy, setExportBusy] = useState<"save" | "share" | null>(null);
  const [exportMsg, setExportMsg] = useState("");

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
  const stockTotals =
    selected?.stockTotals ??
    (selected ? computeStockTotals(selected.lines) : null);

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
          title: "สรุปนับสต็อก",
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="สรุปยอดสต๊อกและขายราย"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-base font-bold text-gray-900">
              สรุปยอดสต๊อกและขายราย
            </p>
            <p className="text-xs text-gray-500">
              เลือกวันเพื่อดูสรุป หรือสร้างสรุปใหม่
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
              ยังไม่มีสรุปยอดสต๊อกและขายรายในวันที่{" "}
              {formatOperatingDayLabel(date) || date}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {summaries.map((s) => {
                  const active = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs ${
                        active
                          ? "border-blue-500 bg-blue-50 font-bold text-blue-700"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      <span className="block">
                        {s.shift
                          ? `สรุปรอบที่ ${s.shift.roundNumber}`
                          : "สรุปยอด"}
                      </span>
                      <span className="mt-0.5 block opacity-80">
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
                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-1">
                      <SummaryRow label="ชื่อสรุป" value={selected.name} />
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
                      />
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
                    </div>

                    {selected.lines.length > 0 && stockTotals ? (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-gray-700">
                          สรุปสต็อก
                        </p>
                        <div className="rounded-xl border border-gray-200 bg-white px-3 py-1">
                          <StockTotalRow
                            label="จำนวนสต็อกในระบบ"
                            qty={stockTotals.systemQty}
                            valueBaht={stockTotals.systemValueBaht}
                          />
                          <StockTotalRow
                            label="จำนวนสต็อกที่นับได้"
                            qty={stockTotals.countedQty}
                            valueBaht={stockTotals.countedValueBaht}
                            last
                          />
                        </div>
                      </div>
                    ) : null}

                    {selected.lines.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-gray-700">
                          สต็อกที่นับ
                        </p>
                        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                          {selected.lines.map((line) => (
                            <li
                              key={`${line.name}-${line.systemQty}-${line.countedQty}`}
                              className="flex items-center justify-between gap-3 px-3 py-2.5"
                            >
                              <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                                {line.name}
                              </p>
                              <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-gray-900">
                                ระบบ {line.systemQty.toLocaleString("th-TH")} →
                                นับได้{" "}
                                {line.countedQty.toLocaleString("th-TH")}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : selected.rawNote ? (
                      <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        {selected.rawNote}
                      </p>
                    ) : null}
                  </div>

                  {selected.lines.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!!exportBusy}
                          onClick={() => void handleSaveImage()}
                          className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {exportBusy === "save" ? "กำลังบันทึก…" : "Save รูป"}
                        </button>
                        <button
                          type="button"
                          disabled={!!exportBusy}
                          onClick={() => void handleShareImage()}
                          className="rounded-xl border border-green-600 bg-green-50 px-3 py-2.5 text-sm font-bold text-green-800 hover:bg-green-100 disabled:opacity-60"
                        >
                          {exportBusy === "share" ? "กำลังแชร์…" : "แชร์รูป (ไลน์)"}
                        </button>
                      </div>
                      {exportMsg ? (
                        <p className="text-center text-xs text-gray-600">
                          {exportMsg}
                        </p>
                      ) : (
                        <p className="text-center text-xs text-gray-400">
                          แชร์รูปแล้วเลือกไลน์ได้จากเมนูแชร์ของเครื่อง
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={goCreate}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"
          >
            สร้างสรุปยอดสต๊อกและขายราย
          </button>
        </div>
      </div>
    </div>
  );
}
