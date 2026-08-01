"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
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
  menus: Array<{ name: string; quantity: number; revenueBaht: number }>;
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
  open,
  onClose,
  initialDate,
  brandName: brandNameProp,
  branchName: branchNameProp,
}: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
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
  const [exportBusy, setExportBusy] = useState<"save" | "share" | null>(null);
  const [exportMsg, setExportMsg] = useState("");
  const [brandName, setBrandName] = useState(brandNameProp?.trim() || "");
  const [branchName, setBranchName] = useState(branchNameProp?.trim() || "");

  useEffect(() => {
    if (!open) return;
    const next =
      initialDate && isBangkokDateKey(initialDate)
        ? initialDate
        : bangkokDateKey();
    setDate(next);
    setSelectedId(null);
    setSummary(null);
    setExportMsg("");
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
      setLoadingList(true);
      setError("");
      try {
        const res = await fetch(
          `/api/staff/shifts?date=${encodeURIComponent(date)}`,
        );
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
  }, [open, date]);

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

  if (!open) return null;

  const branchLabel = formatBranchLabel(branchName);

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
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-base font-bold text-gray-900">สรุปยอดขายตามรอบ</p>
            <p className="text-xs text-gray-500">
              เลือกวันและรอบเพื่อดูยอดขาย
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

          {loadingList ? (
            <p className="text-sm text-gray-500">กำลังโหลดรอบ…</p>
          ) : shifts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
              ไม่มีรอบในวันที่ {formatOperatingDayLabel(date)}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shifts.map((s) => {
                const selected = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs ${
                      selected
                        ? "border-site-primary bg-site-primary-soft font-bold text-site-primary"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    <span className="block">รอบที่ {s.roundNumber}</span>
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
                    className={`text-xs font-medium text-gray-500 ${
                      brandName || branchLabel ? "mt-1.5" : ""
                    }`}
                  >
                    สรุปยอดขายตามรอบ
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white px-3 py-1">
                  <SummaryRow label="เลขที่รอบ" value={summary.shift.code} />
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
                    label="จำนวนออเดอร์"
                    value={`${summary.orderCount.toLocaleString("th-TH")} ออเดอร์`}
                  />
                  {summary.cancelledOrders > 0 ? (
                    <SummaryRow
                      label="ยกเลิก"
                      value={`${summary.cancelledOrders.toLocaleString("th-TH")} ออเดอร์`}
                    />
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
                    {exportBusy === "share" ? "กำลังแชร์…" : "LINE"}
                  </button>
                </div>
                {exportMsg ? (
                  <p className="text-center text-xs text-gray-600">{exportMsg}</p>
                ) : (
                  <p className="text-center text-xs text-gray-400">
                    กด LINE แล้วเลือกแอปไลน์จากเมนูแชร์ของเครื่อง
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
