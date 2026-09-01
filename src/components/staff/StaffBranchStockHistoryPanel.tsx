"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { bangkokDateKey, isBangkokDateKey } from "@/lib/constants";
import {
  MobileDateRangeControl,
  mobileRangeForPreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { ZoomableImage } from "@/components/ZoomableImage";
import { parseMovementImages } from "@/lib/stock-movement-images";
import {
  BRANCH_HISTORY_KIND_LABEL,
  BRANCH_HISTORY_KINDS,
  type BranchHistoryKind,
  isBranchHistoryKind,
} from "@/lib/branch-stock-history";
import { StatusBadge } from "@/components/StatusBadge";
import type { StatusTone } from "@/lib/status-badge";
import { StaffOrderHistoryDetail } from "@/components/staff/StaffOrderHistoryDetail";
import {
  parseConvertSummaryNameFromNote,
  staffStockSummaryHref,
} from "@/lib/history-source-link";

function historyKindTone(
  kind: Exclude<BranchHistoryKind, "all">,
): StatusTone {
  switch (kind) {
    case "in":
      return "success";
    case "sale":
      return "info";
    case "adjust":
      return "info";
    case "waste":
      return "danger";
    case "out":
      return "neutral";
    default:
      return "neutral";
  }
}

type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

type HistoryLine = {
  id: string;
  name: string;
  quantity: number;
  signedQuantity: number;
  unit: string;
  stockType: StockType;
  isCancelled: boolean;
  imageUrl?: string | null;
};

type HistoryBatch = {
  id: string;
  branchId?: string;
  branchName?: string | null;
  kind: Exclude<BranchHistoryKind, "all">;
  historyType: string;
  label: string;
  createdAt: string;
  note: string | null;
  batchId?: string | null;
  orderId?: string | null;
  imageUrl: string | null;
  imageUrls?: string[];
  documentNo: string | null;
  receivedAt: string | null;
  orderNumber: string | null;
  createdByStaff: { id: string; name: string } | null;
  itemCount: number;
  totalQty: number;
  isCancelled: boolean;
  cancelledAt: string | null;
  cancelNote: string | null;
  lines: HistoryLine[];
};

const PAGE_SIZE = 40;

const STOCK_TYPE_LABEL: Record<StockType, string> = {
  SALE_ITEM: "เมนูขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

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
  value: ReactNode;
  last?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2.5 ${
        last ? "" : "border-b border-slate-100"
      }`}
    >
      <span className="shrink-0 text-[13px] text-slate-500">{label}</span>
      <div
        className={`min-w-0 text-right text-[13px] font-semibold text-slate-900 ${
          mono ? "font-mono text-[12px]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function SourceLinkButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-right text-[13px] font-bold text-site-primary underline decoration-site-primary/40 underline-offset-2"
    >
      {label}
    </button>
  );
}

function photosFor(batch: HistoryBatch) {
  if (Array.isArray(batch.imageUrls) && batch.imageUrls.length > 0) {
    return batch.imageUrls
      .filter((u): u is string => typeof u === "string" && Boolean(u.trim()))
      .map((u) => u.trim());
  }
  return parseMovementImages(batch.imageUrl);
}

type Props = {
  onBack?: () => void;
  apiPath?: string;
  branchId?: string | null;
  hideBack?: boolean;
  title?: string;
  initialKind?: BranchHistoryKind | null;
  initialFrom?: string | null;
  initialTo?: string | null;
  /** Open detail for ADJUST bill whose batchId matches (usually stockCount.id). */
  openBatchId?: string | null;
};

export function StaffBranchStockHistoryPanel({
  onBack,
  apiPath = "/api/staff/stock/history",
  branchId = null,
  hideBack = false,
  title = "ประวัติ",
  initialKind = null,
  initialFrom = null,
  initialTo = null,
  openBatchId = null,
}: Props) {
  const router = useRouter();
  const today = bangkokDateKey();
  const initial = mobileRangeForPreset("today", today);
  const [from, setFrom] = useState(() =>
    initialFrom && isBangkokDateKey(initialFrom) ? initialFrom : initial.from,
  );
  const [to, setTo] = useState(() =>
    initialTo && isBangkokDateKey(initialTo) ? initialTo : initial.to,
  );
  const [preset, setPreset] = useState<MobileDatePresetId | null>(
    initialFrom || initialTo ? null : "today",
  );
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<BranchHistoryKind>(() =>
    initialKind && isBranchHistoryKind(initialKind) ? initialKind : "all",
  );
  const [batches, setBatches] = useState<HistoryBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<HistoryBatch | null>(null);
  const [orderDetailId, setOrderDetailId] = useState<string | null>(null);
  const [openingSource, setOpeningSource] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const openedBatchRef = useRef<string | null>(null);

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
        if (branchId) qs.set("branchId", branchId);
        const res = await fetch(`${apiPath}?${qs.toString()}`);
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
          ? (body.batches as HistoryBatch[])
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
    [apiPath, branchId, from, to, kind, q],
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
    if (!openBatchId || loading) return;
    if (openedBatchRef.current === openBatchId) return;
    const match = batches.find((b) => b.batchId === openBatchId);
    if (match) {
      openedBatchRef.current = openBatchId;
      setSelected(match);
      return;
    }
    if (!hasMore || loadingMore) return;
    void fetchPage(nextOffset, true);
  }, [
    openBatchId,
    batches,
    loading,
    hasMore,
    loadingMore,
    nextOffset,
    fetchPage,
  ]);

  async function openSummarySource(batch: HistoryBatch) {
    if (openingSource) return;
    setOpeningSource(true);
    try {
      const summaryId = batch.batchId?.trim() || "";
      const summaryName = parseConvertSummaryNameFromNote(batch.note);
      if (!summaryId && !summaryName) return;

      let data: Record<string, unknown> = {};
      let ok = false;

      if (summaryId) {
        const res = await fetch(
          `/api/staff/stock/summaries?id=${encodeURIComponent(summaryId)}`,
        );
        data = await res.json().catch(() => ({}));
        ok = res.ok;
      }

      if (!ok && summaryName) {
        const res = await fetch(
          `/api/staff/stock/summaries?name=${encodeURIComponent(summaryName)}`,
        );
        data = await res.json().catch(() => ({}));
        ok = res.ok;
      }

      if (!ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "เปิดสรุปยอดไม่สำเร็จ",
        );
      }

      const resolvedId =
        (typeof data.resolvedSummaryId === "string" &&
          data.resolvedSummaryId) ||
        (ok && summaryId ? summaryId : "") ||
        (Array.isArray(data.summaries) &&
          typeof (data.summaries as { id?: string }[])[0]?.id === "string" &&
          (data.summaries as { id: string }[])[0].id) ||
        "";
      const date =
        typeof data.date === "string" && isBangkokDateKey(data.date)
          ? data.date
          : bangkokDateKey(new Date(batch.createdAt));
      router.push(
        staffStockSummaryHref({
          summaryId: resolvedId || null,
          date,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปิดสรุปยอดไม่สำเร็จ");
    } finally {
      setOpeningSource(false);
    }
  }

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

  const photos = useMemo(
    () => (selected ? photosFor(selected) : []),
    [selected],
  );

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
              รับ · ขาย · ปรับสต๊อก · ของเสีย · จ่ายออก — กดดูรายละเอียดแต่ละบิล
            </p>
          </div>
        </div>
      ) : null}

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
          placeholder="ค้นหาเลขเอกสาร · ออเดอร์ · ชื่อสินค้า · ผู้ทำ"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-semibold shadow-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {BRANCH_HISTORY_KINDS.map((id) => (
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
              {BRANCH_HISTORY_KIND_LABEL[id]}
            </button>
          ))}
        </div>
      </div>

      {!loading && !error && total > 0 ? (
        <p className="mt-3 text-[12px] font-semibold text-slate-500">
          แสดง {batches.length.toLocaleString("th-TH")} จาก{" "}
          {total.toLocaleString("th-TH")} บิล
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
              const title =
                batch.lines.length === 1
                  ? batch.lines[0]!.name
                  : batch.lines.length > 1
                    ? `${batch.lines[0]!.name} และอีก ${batch.lines.length - 1} รายการ`
                    : "—";
              const unit =
                batch.lines.length === 1
                  ? batch.lines[0]?.unit
                  : batch.lines.every((l) => l.unit === batch.lines[0]?.unit)
                    ? batch.lines[0]?.unit
                    : "รายการ";
              const batchPhotos = photosFor(batch);
              return (
                <li key={batch.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(batch)}
                    className={`flex w-full items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50 ${
                      batch.isCancelled ? "opacity-70" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge
                          label={`${batch.label}${batch.isCancelled ? " · ยกเลิก" : ""}`}
                          tone={
                            batch.isCancelled
                              ? "neutral"
                              : historyKindTone(batch.kind)
                          }
                          size="sm"
                        />
                      </div>
                      <p className="mt-1 truncate text-[15px] font-extrabold text-slate-900">
                        {title}
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold text-slate-600">
                        {formatDateTime(batch.createdAt)} · โดย{" "}
                        {batch.createdByStaff?.name ?? "—"}
                      </p>
                      {batch.branchName ? (
                        <p className="mt-0.5 text-[12px] font-semibold text-emerald-800">
                          สาขา · {batch.branchName}
                        </p>
                      ) : null}
                      {batch.documentNo ||
                      batch.receivedAt ||
                      batchPhotos.length > 0 ? (
                        <p className="mt-0.5 text-[12px] text-slate-500">
                          {[
                            batch.kind === "in" && batch.receivedAt
                              ? `วันที่ผลิต ${formatDate(batch.receivedAt)}`
                              : null,
                            batch.documentNo
                              ? batch.kind === "sale"
                                ? `ออเดอร์ ${batch.documentNo}`
                                : batch.documentNo
                              : null,
                            batchPhotos.length > 0
                              ? `รูป ${batchPhotos.length}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p
                        className={`text-[17px] font-black tabular-nums ${
                          batch.isCancelled
                            ? "text-slate-400 line-through"
                            : "text-slate-900"
                        }`}
                      >
                        {batch.totalQty.toLocaleString("th-TH")}
                        <span className="ml-1 text-[11px] font-bold text-slate-400">
                          {unit}
                        </span>
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
            ) : batches.length > 0 ? (
              <li>
                <p className="px-2 py-3 text-center text-[12px] font-medium text-slate-400">
                  ครบทุกรายการในช่วงนี้แล้ว
                </p>
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
                  {selected.branchName ? ` · ${selected.branchName}` : ""}
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
              {selected.branchName ? (
                <SummaryRow label="สาขา" value={selected.branchName} />
              ) : null}
              {selected.kind === "in" && selected.receivedAt ? (
                <SummaryRow
                  label="วันที่ผลิต"
                  value={formatDate(selected.receivedAt)}
                />
              ) : null}
              <SummaryRow
                label="วันที่เวลา"
                value={formatDateTime(selected.createdAt)}
              />
              <SummaryRow
                label="โดย"
                value={selected.createdByStaff?.name ?? "—"}
              />
              <SummaryRow
                label={
                  selected.kind === "sale"
                    ? "เลขออเดอร์"
                    : selected.orderNumber && !selected.documentNo
                      ? "เลขออเดอร์"
                      : "เลขที่เอกสาร"
                }
                value={
                  selected.kind === "sale" && selected.orderId ? (
                    <SourceLinkButton
                      label={
                        selected.documentNo ||
                        selected.orderNumber ||
                        "ดูออเดอร์"
                      }
                      onClick={() => setOrderDetailId(selected.orderId!)}
                    />
                  ) : (
                    selected.documentNo || selected.orderNumber || "—"
                  )
                }
                mono={!selected.orderId}
              />
              <SummaryRow
                label="ประเภท"
                value={selected.label}
              />
              {(() => {
                const canOpenSummary =
                  selected.kind === "adjust" &&
                  Boolean(
                    selected.batchId?.trim() ||
                      parseConvertSummaryNameFromNote(selected.note),
                  );
                const canOpenOrder =
                  selected.kind === "sale" && Boolean(selected.orderId);
                if (selected.note && canOpenSummary) {
                  return (
                    <SummaryRow
                      label="รายละเอียด"
                      value={
                        <SourceLinkButton
                          label={
                            openingSource ? "กำลังเปิด…" : selected.note
                          }
                          onClick={() => void openSummarySource(selected)}
                        />
                      }
                    />
                  );
                }
                if (selected.note && canOpenOrder) {
                  return (
                    <SummaryRow
                      label="รายละเอียด"
                      value={
                        <SourceLinkButton
                          label={selected.note}
                          onClick={() => setOrderDetailId(selected.orderId!)}
                        />
                      }
                    />
                  );
                }
                return (
                  <SummaryRow
                    label="รายละเอียด"
                    value={selected.note || "—"}
                  />
                );
              })()}
              {selected.isCancelled ? (
                <SummaryRow
                  label="สถานะ"
                  value={`ยกเลิก${
                    selected.cancelNote ? ` · ${selected.cancelNote}` : ""
                  }${
                    selected.cancelledAt
                      ? ` · ${formatDateTime(selected.cancelledAt)}`
                      : ""
                  }`}
                />
              ) : null}
              <SummaryRow
                label="จำนวนรายการ"
                value={`${selected.itemCount.toLocaleString("th-TH")} รายการ`}
              />
              <SummaryRow
                label="จำนวนรวม"
                value={selected.totalQty.toLocaleString("th-TH")}
                last
              />
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold text-slate-700">
                รูปประกอบ
                {photos.length > 0
                  ? ` · ${photos.length} รูป`
                  : ""}
              </p>
              {photos.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((src) => (
                    <div
                      key={src}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                    >
                      <ZoomableImage
                        src={src}
                        alt="รูปประกอบ"
                        className="max-h-56 w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[13px] font-medium text-slate-400">
                  ไม่มีรูปแนบ
                </p>
              )}
              {photos.length > 0 ? (
                <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                  กดรูปเพื่อดูเต็ม
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold text-slate-700">
                รายการในบิล
              </p>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {selected.lines.map((line, index) => (
                  <li
                    key={line.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 ${
                      line.isCancelled ? "bg-red-50/50" : "bg-white"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-slate-500">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {line.name}
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
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                          {STOCK_TYPE_LABEL[line.stockType]}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`shrink-0 text-sm font-black tabular-nums ${
                        line.isCancelled
                          ? "text-slate-400 line-through"
                          : "text-slate-900"
                      }`}
                    >
                      {line.quantity.toLocaleString("th-TH")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <StaffOrderHistoryDetail
        open={Boolean(orderDetailId)}
        orderId={orderDetailId}
        onClose={() => setOrderDetailId(null)}
      />
    </>
  );
}
