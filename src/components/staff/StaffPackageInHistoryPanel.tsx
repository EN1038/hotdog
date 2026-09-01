"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bangkokDateKey } from "@/lib/constants";
import {
  MobileDateRangeControl,
  mobileRangeForPreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import {
  PACKAGE_HISTORY_KIND_LABEL,
  PACKAGE_HISTORY_KINDS,
  type PackageHistoryBatch,
  type PackageHistoryKind,
} from "@/lib/stock-package-history-types";
import { openPackageLabelPrint } from "@/lib/stock-package-label-print";
import { StaffPrinterStatusChip } from "@/components/staff/StaffPrinterStatusChip";

const PAGE_SIZE = 40;

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

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function SummaryRow({
  label,
  value,
  last = false,
  mono = false,
}: {
  label: string;
  value: string;
  last?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2.5 ${
        last ? "" : "border-b border-slate-100"
      }`}
    >
      <span className="text-[13px] text-slate-500">{label}</span>
      <span
        className={`text-right text-[13px] font-semibold text-slate-900 ${
          mono ? "font-mono text-[12px]" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

type Props = {
  onBack?: () => void;
  hideBack?: boolean;
  title?: string;
  highlightBatchId?: string | null;
  autoOpenBatchId?: string | null;
};

export function StaffPackageInHistoryPanel({
  onBack,
  hideBack = false,
  title = "ประวัติรับเข้าแพ็ก",
  highlightBatchId = null,
  autoOpenBatchId = null,
}: Props) {
  const today = bangkokDateKey();
  const initial = mobileRangeForPreset("today", today);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preset, setPreset] = useState<MobileDatePresetId | null>("today");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<PackageHistoryKind>("all");
  const [batches, setBatches] = useState<PackageHistoryBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PackageHistoryBatch | null>(null);
  const [printing, setPrinting] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const autoOpenedRef = useRef(false);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const reqId = ++requestIdRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
      }
      try {
        const qs = new URLSearchParams({
          from,
          to,
          kind,
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        const query = q.trim();
        if (query) qs.set("q", query);
        const res = await fetch(
          `/api/staff/stock/package-in/history?${qs.toString()}`,
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "โหลดประวัติไม่สำเร็จ",
          );
        }
        if (reqId !== requestIdRef.current) return;
        const page = Array.isArray(body.batches)
          ? (body.batches as PackageHistoryBatch[])
          : [];
        setBatches((prev) => (append ? [...prev, ...page] : page));
        setTotal(typeof body.total === "number" ? body.total : page.length);
        setHasMore(Boolean(body.hasMore));
        setNextOffset(
          typeof body.nextOffset === "number"
            ? body.nextOffset
            : offset + page.length,
        );
      } catch (e) {
        if (reqId !== requestIdRef.current) return;
        if (!append) {
          setBatches([]);
          setTotal(0);
          setHasMore(false);
          setNextOffset(0);
        }
        setError(e instanceof Error ? e.message : "โหลดประวัติไม่สำเร็จ");
      } finally {
        if (reqId !== requestIdRef.current) return;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [from, to, kind, q],
  );

  useEffect(() => {
    const delay = q.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      void fetchPage(0, false);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [fetchPage]);

  useEffect(() => {
    if (!autoOpenBatchId || autoOpenedRef.current || loading) return;
    const match = batches.find(
      (b) => b.batchId === autoOpenBatchId || b.id === autoOpenBatchId,
    );
    if (match) {
      setSelected(match);
      autoOpenedRef.current = true;
    }
  }, [autoOpenBatchId, batches, loading]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void fetchPage(nextOffset, true);
        }
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, nextOffset, fetchPage]);

  async function reprintBatch(batch: PackageHistoryBatch, lineId?: string) {
    setPrinting(true);
    try {
      const res = await fetch(
        `/api/staff/stock/package-in/history?batchId=${encodeURIComponent(batch.batchId)}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "โหลดป้ายไม่สำเร็จ",
        );
      }
      let labels = Array.isArray(body.labels) ? body.labels : [];
      if (lineId) {
        const line = batch.lines.find((l) => l.id === lineId);
        if (line) {
          labels = labels.filter(
            (l: { labelCode?: string }) => l.labelCode === line.labelCode,
          );
        }
      }
      if (labels.length === 0) {
        window.alert("ไม่มีป้ายสำหรับพิมพ์");
        return;
      }
      await openPackageLabelPrint(labels);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "พิมพ์ไม่สำเร็จ");
    } finally {
      setPrinting(false);
    }
  }

  const selectedLines = useMemo(() => selected?.lines ?? [], [selected]);

  return (
    <>
      {!hideBack ? (
        <div className="mb-2 flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
            >
              ← กลับ
            </button>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
            <p className="text-xs font-semibold text-slate-600">
              รับเข้าแพ็ก · จ่ายแพ็ก — กดดูรายละเอียดแต่ละครั้ง
            </p>
          </div>
        </div>
      ) : null}

      {!hideBack ? <StaffPrinterStatusChip showBrowserHint className="mb-3" /> : null}

      <div className="space-y-3">
        <MobileDateRangeControl
          todayKey={today}
          from={from}
          to={to}
          preset={preset}
          onChange={({ from: nextFrom, to: nextTo, preset: nextPreset }) => {
            setFrom(nextFrom);
            setTo(nextTo);
            setPreset(nextPreset);
          }}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาเลขเอกสาร · LOT · ชื่อสินค้า · ผู้ทำ"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-semibold shadow-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {PACKAGE_HISTORY_KINDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-bold ring-1 ${
                kind === id
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-600 ring-slate-200"
              }`}
            >
              {PACKAGE_HISTORY_KIND_LABEL[id]}
            </button>
          ))}
        </div>
      </div>

      {!loading && !error && total > 0 ? (
        <p className="mt-3 text-[12px] font-semibold text-slate-500">
          แสดง {batches.length.toLocaleString("th-TH")} จาก{" "}
          {total.toLocaleString("th-TH")} ครั้ง
        </p>
      ) : null}

      <ul className="mt-2 space-y-2 pb-6">
        {loading ? (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            กำลังโหลดประวัติ…
          </p>
        ) : error ? (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-rose-600 shadow-sm">
            {error}
          </p>
        ) : batches.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            ไม่พบรายการในช่วงที่เลือก
          </p>
        ) : (
          <>
            {batches.map((batch) => {
              const lineTitle =
                batch.lines.length === 1
                  ? batch.lines[0]!.name
                  : batch.lines.length > 1
                    ? `${batch.lines[0]!.name} และอีก ${batch.lines.length - 1} แพ็ก`
                    : "—";
              const highlighted =
                highlightBatchId &&
                (batch.batchId === highlightBatchId ||
                  batch.id === highlightBatchId);
              return (
                <li key={batch.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(batch)}
                    className={`flex w-full items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50 ${
                      highlighted ? "ring-2 ring-emerald-400 bg-emerald-50/40" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-site-primary">
                        {batch.label}
                      </p>
                      <p className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                        {lineTitle}
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold text-slate-600">
                        {formatDateTime(batch.createdAt)} · โดย{" "}
                        {batch.createdByStaff?.name ?? "—"}
                      </p>
                      <p className="mt-0.5 text-[12px] text-slate-500">
                        {[
                          batch.producedAt
                            ? `วันผลิต ${formatDate(batch.producedAt)}`
                            : null,
                          batch.documentNo,
                          `${batch.packageCount} แพ็ก`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="text-[17px] font-black tabular-nums text-slate-900">
                        {batch.totalQty.toLocaleString("th-TH")}
                      </p>
                      <span className="text-lg text-slate-300" aria-hidden>
                        ›
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
            {hasMore ? (
              <li>
                <div
                  ref={loadMoreRef}
                  className="rounded-2xl bg-white px-4 py-4 text-center shadow-sm"
                >
                  {loadingMore ? (
                    <p className="text-sm font-semibold text-slate-500">
                      กำลังโหลดเพิ่ม…
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void fetchPage(nextOffset, true)}
                      className="text-sm font-bold text-site-primary"
                    >
                      โหลดเพิ่ม
                    </button>
                  )}
                </div>
              </li>
            ) : null}
          </>
        )}
      </ul>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="ปิด"
            onClick={() => setSelected(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] font-extrabold text-slate-900">
                  รายละเอียด{selected.label}
                </p>
                <p className="mt-0.5 text-[13px] font-medium text-slate-500">
                  {formatDateTime(selected.createdAt)} · โดย{" "}
                  {selected.createdByStaff?.name ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-500"
              >
                ปิด
              </button>
            </div>

            <div className="mt-3 rounded-2xl bg-slate-50 px-3">
              {selected.brandName ? (
                <SummaryRow label="แบรนด์" value={selected.brandName} />
              ) : null}
              {selected.sourceBranchName ? (
                <SummaryRow
                  label="สาขาต้นทาง"
                  value={selected.sourceBranchName}
                />
              ) : null}
              {selected.producedAt ? (
                <SummaryRow
                  label="วันที่ผลิต"
                  value={formatDate(selected.producedAt)}
                />
              ) : null}
              <SummaryRow
                label="เลขที่เอกสาร"
                value={selected.documentNo ?? "—"}
                mono
              />
              <SummaryRow
                label="จำนวนแพ็ก"
                value={`${selected.packageCount} แพ็ก`}
              />
              <SummaryRow
                label="จำนวนรวม"
                value={selected.totalQty.toLocaleString("th-TH")}
                last
              />
            </div>

            <div className="mt-4">
              <p className="mb-2 text-[13px] font-bold text-slate-700">
                รายการใน batch
              </p>
              <ul className="space-y-2">
                {selectedLines.map((line, idx) => (
                  <li
                    key={line.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3"
                  >
                    {line.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={line.imageUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
                        🏷️
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-extrabold text-slate-900">
                        {idx + 1}. {line.name}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500">
                        {line.productCode} · LOT {line.lotNumber} ·{" "}
                        {line.quantity} {line.unit}
                        {line.status === "CONSUMED" ? " · จ่ายแล้ว" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={printing}
                      onClick={() => void reprintBatch(selected, line.id)}
                      className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      🖨
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              disabled={printing}
              onClick={() => void reprintBatch(selected)}
              className="mt-4 w-full rounded-2xl bg-emerald-600 py-3.5 text-[15px] font-extrabold text-white disabled:opacity-60"
            >
              {printing ? "กำลังเตรียมพิมพ์…" : "พิมพ์ป้ายทั้ง batch"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
