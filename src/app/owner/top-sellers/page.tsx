"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import {
  ShareExportMenu,
  type ShareExportAction,
} from "@/components/staff/ShareExportMenu";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import type { OwnerBranchRow } from "@/lib/owner-dashboard";
import type { ShopTopSellerDetail } from "@/lib/shop-overview-metrics";
import { type CookBreakdown } from "@/lib/cook-method";
import {
  OPTION_FILTER_NONE,
  optionFilterLabel,
  type OptionQtySlice,
} from "@/lib/order-option-tokens";
import { CookProportionBar } from "@/components/admin/GrillFryCompareChart";
import {
  captureElementToPng,
  copyTextToClipboard,
  downloadPngDataUrl,
  sharePngDataUrl,
} from "@/lib/share-media";
import {
  buildOwnerViewQuery,
  ownerHomeHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";
import { IconBack } from "@/components/icons";

type SortMode = "quantity" | "revenue";

type TopSellersPayload = {
  items: ShopTopSellerDetail[];
  summary: {
    itemCount: number;
    totalQty: number;
    totalRevenue: number;
  };
  optionSummary?: OptionQtySlice[];
  cookSummary?: CookBreakdown;
  branches: OwnerBranchRow[];
  hasTestBranch?: boolean;
};

function formatCookBreakdownLine(byCook: CookBreakdown | undefined): string {
  if (!byCook) return "";
  const parts: string[] = [];
  if (byCook.grill.quantity > 0) {
    parts.push(`ย่าง ${formatPrice(byCook.grill.quantity)}`);
  }
  if (byCook.fry.quantity > 0) {
    parts.push(`ทอด ${formatPrice(byCook.fry.quantity)}`);
  }
  if (byCook.unknown.quantity > 0) {
    parts.push(`ไม่ระบุ ${formatPrice(byCook.unknown.quantity)}`);
  }
  return parts.join(" · ");
}

function OwnerTopSellersInner() {
  const { data } = useOwnerDashboard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey();
  const initial = readOwnerViewRangeParams(searchParams, today);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [datePreset, setDatePreset] = useState<MobileDatePresetId | null>(
    initial.hasRange
      ? (matchMobileDatePreset(initial.from, initial.to, today) ?? "custom")
      : "today",
  );
  const [filterBranchId, setFilterBranchId] = useState<string | null>(
    initial.branchId,
  );
  const [payload, setPayload] = useState<TopSellersPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [includeTest, setIncludeTest] = useState(false);
  const [sort, setSort] = useState<SortMode>("quantity");
  const [optionFilter, setOptionFilter] = useState<string | null>(null);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(true);
  const [shareBusy, setShareBusy] = useState<ShareExportAction | null>(null);
  const [shareMsg, setShareMsg] = useState("");
  const [compareShareBusy, setCompareShareBusy] =
    useState<ShareExportAction | null>(null);
  const [compareShareMsg, setCompareShareMsg] = useState("");
  const listCaptureRef = useRef<HTMLDivElement>(null);
  const compareCaptureRef = useRef<HTMLDivElement>(null);
  const urlReady = useRef(false);

  const writeViewQuery = useCallback(
    (next: {
      branchId?: string | null;
      from?: string;
      to?: string;
    }) => {
      const query = buildOwnerViewQuery({
        branchId:
          next.branchId !== undefined ? next.branchId : filterBranchId,
        from: next.from ?? from,
        to: next.to ?? to,
      });
      router.replace(`/owner/top-sellers${query}`, { scroll: false });
    },
    [filterBranchId, from, router, to],
  );

  useEffect(() => {
    const parsed = readOwnerViewRangeParams(searchParams, today);
    if (!urlReady.current) {
      urlReady.current = true;
      return;
    }
    setFilterBranchId(parsed.branchId);
    if (parsed.hasRange) {
      setFrom(parsed.from);
      setTo(parsed.to);
      setDatePreset(
        matchMobileDatePreset(parsed.from, parsed.to, today) ?? "custom",
      );
    }
  }, [searchParams, today]);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          from,
          to,
          sort,
          limit: "50",
        });
        if (includeTest) params.set("includeTest", "1");
        if (filterBranchId) params.set("branchId", filterBranchId);
        if (q) params.set("q", q);
        if (optionFilter) params.set("option", optionFilter);
        const res = await fetch(`/api/owner/top-sellers?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok || ac.signal.aborted) return;
        const json = (await res.json()) as TopSellersPayload;
        if (ac.signal.aborted) return;
        setPayload(json);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [from, to, filterBranchId, includeTest, sort, q, optionFilter]);

  const items = payload?.items ?? [];
  const summary = payload?.summary ?? {
    itemCount: 0,
    totalQty: 0,
    totalRevenue: 0,
  };
  const optionSummary = payload?.optionSummary ?? [];
  const optionLabel = optionFilter
    ? optionFilterLabel(optionFilter)
    : "ทุกตัวเลือก";
  const showCookCompare = optionFilter == null;
  const optionTotalQty = optionSummary.reduce((s, o) => s + o.quantity, 0);
  const hasTestBranch =
    payload?.hasTestBranch ??
    data?.hasTestBranch ??
    (data?.branches ?? []).some((b) => b.isTest);
  const filterBranches = (payload?.branches ?? data?.branches ?? []).filter(
    (b) =>
      !b.isHidden &&
      b.kind !== "WAREHOUSE" &&
      (includeTest || !b.isTest),
  );
  const filterBranchName = filterBranchId
    ? filterBranches.find((b) => b.id === filterBranchId)?.name
    : null;
  const multiBranch = filterBranches.length > 1 && !filterBranchId;
  const homeHref = ownerHomeHref({
    branchId: filterBranchId,
    from,
    to,
    tab: "overview",
  });

  const compareRows = useMemo(() => items.slice(0, 12), [items]);
  const compareBranches = useMemo(() => {
    if (!multiBranch) return [];
    return filterBranches.slice(0, 8);
  }, [filterBranches, multiBranch]);

  function qtyForBranch(item: ShopTopSellerDetail, branchId: string) {
    return item.byBranch.find((b) => b.branchId === branchId)?.quantity ?? 0;
  }

  function revForBranch(item: ShopTopSellerDetail, branchId: string) {
    return (
      item.byBranch.find((b) => b.branchId === branchId)?.revenueBaht ?? 0
    );
  }

  const brandName =
    data?.brand?.nameTh || data?.brand?.name || "";
  const rangeLabel = useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      if (from === to) return fmt.format(new Date(`${from}T12:00:00+07:00`));
      return `${fmt.format(new Date(`${from}T12:00:00+07:00`))} – ${fmt.format(new Date(`${to}T12:00:00+07:00`))}`;
    } catch {
      return from === to ? from : `${from} – ${to}`;
    }
  }, [from, to]);
  const sortLabel = sort === "quantity" ? "เรียงตามชิ้น" : "เรียงตามยอด";
  const listStamp = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());
    } catch {
      return "";
    }
  }, [items, sort, from, to, optionFilter]);

  function buildListCopyText() {
    const lines: string[] = [];
    lines.push("รายการเมนูขายดี");
    if (brandName) lines.push(brandName);
    if (filterBranchName) lines.push(`สาขา ${filterBranchName}`);
    lines.push(`ช่วง ${rangeLabel}`);
    lines.push(sortLabel);
    lines.push(`ตัวเลือก · ${optionLabel}`);
    lines.push(
      `${formatPrice(summary.itemCount)} เมนู · ${formatPrice(summary.totalQty)} ชิ้น · ฿${formatPrice(summary.totalRevenue)}`,
    );
    if (q) lines.push(`ค้นหา: ${q}`);
    lines.push("");
    items.forEach((item, index) => {
      const cookLine =
        showCookCompare && item.byCook
          ? formatCookBreakdownLine(item.byCook)
          : "";
      lines.push(
        `${index + 1}. ${item.name} — ${formatPrice(item.quantity)} ชิ้น · ฿${formatPrice(item.revenueBaht)}${cookLine ? ` (${cookLine})` : ""}`,
      );
    });
    return lines.join("\n");
  }

  async function captureListPng() {
    setExpandedKey(null);
    await new Promise((r) => setTimeout(r, 40));
    const node = listCaptureRef.current;
    if (!node) throw new Error("ไม่พบรายการเมนู");
    return captureElementToPng(node);
  }

  function listFilename() {
    return `top-sellers-${from}_${to}.png`;
  }

  async function handleShareImage() {
    if (shareBusy || items.length === 0) return;
    setShareBusy("share");
    setShareMsg("");
    try {
      const dataUrl = await captureListPng();
      const title = ["เมนูขายดี", brandName, rangeLabel]
        .filter(Boolean)
        .join(" · ");
      const r = await sharePngDataUrl(dataUrl, listFilename(), title);
      if (r.error === "cancelled") {
        setShareMsg("");
        return;
      }
      setShareMsg(
        r.mode === "share"
          ? "แชร์รูปแล้ว"
          : r.ok
            ? "อุปกรณ์นี้แชร์ไม่ได้ — บันทึกรูปแทนแล้ว"
            : r.error ?? "แชร์รูปไม่สำเร็จ",
      );
    } catch {
      setShareMsg("แชร์รูปไม่สำเร็จ");
    } finally {
      setShareBusy(null);
    }
  }

  async function handleSaveImage() {
    if (shareBusy || items.length === 0) return;
    setShareBusy("save");
    setShareMsg("");
    try {
      const dataUrl = await captureListPng();
      const r = await downloadPngDataUrl(dataUrl, listFilename());
      setShareMsg(r.ok ? "บันทึกรูปแล้ว" : r.error ?? "บันทึกรูปไม่สำเร็จ");
    } catch {
      setShareMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setShareBusy(null);
    }
  }

  async function handleCopyText() {
    if (shareBusy || items.length === 0) return;
    setShareBusy("copy");
    setShareMsg("");
    try {
      const ok = await copyTextToClipboard(buildListCopyText());
      setShareMsg(
        ok ? "คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย" : "คัดลอกไม่สำเร็จ",
      );
    } catch {
      setShareMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setShareBusy(null);
    }
  }

  function buildCompareCopyText() {
    const lines: string[] = [];
    lines.push("เมนูขายดีเทียบสาขา");
    if (brandName) lines.push(brandName);
    if (rangeLabel) lines.push(`ช่วง ${rangeLabel}`);
    lines.push(sortLabel);
    lines.push(`ตัวเลือก · ${optionLabel}`);
    lines.push(
      `${formatPrice(summary.itemCount)} เมนู · ${formatPrice(summary.totalQty)} ชิ้น · ฿${formatPrice(summary.totalRevenue)}`,
    );
    lines.push(compareBranches.map((b) => b.name).join(" · "));
    lines.push("");
    const header = ["เมนู", ...compareBranches.map((b) => b.name), "รวม"].join(
      "\t",
    );
    lines.push(header);
    for (const item of compareRows) {
      const cols = [
        item.name,
        ...compareBranches.map((b) => {
          const qty = qtyForBranch(item, b.id);
          return qty > 0 ? String(qty) : "—";
        }),
        String(item.quantity),
      ];
      lines.push(cols.join("\t"));
      if (showCookCompare && item.byCook) {
        const cookLine = formatCookBreakdownLine(item.byCook);
        if (cookLine) lines.push(`  ${cookLine}`);
      }
    }
    return lines.join("\n");
  }

  async function ensureCompareVisible() {
    if (compareOpen) return;
    flushSync(() => setCompareOpen(true));
    await new Promise((r) => setTimeout(r, 80));
  }

  async function captureComparePng() {
    await ensureCompareVisible();
    const node = compareCaptureRef.current;
    if (!node) throw new Error("ไม่พบตารางเทียบสาขา");
    return captureElementToPng(node);
  }

  function compareFilename() {
    return `top-sellers-compare-${from}_${to}.png`;
  }

  async function handleCompareShareImage() {
    if (compareShareBusy || compareRows.length === 0) return;
    setCompareShareBusy("share");
    setCompareShareMsg("");
    try {
      const dataUrl = await captureComparePng();
      const title = ["เมนูขายดีเทียบสาขา", brandName, rangeLabel]
        .filter(Boolean)
        .join(" · ");
      const r = await sharePngDataUrl(dataUrl, compareFilename(), title);
      if (r.error === "cancelled") {
        setCompareShareMsg("");
        return;
      }
      setCompareShareMsg(
        r.mode === "share"
          ? "แชร์รูปแล้ว"
          : r.ok
            ? "อุปกรณ์นี้แชร์ไม่ได้ — บันทึกรูปแทนแล้ว"
            : r.error ?? "แชร์รูปไม่สำเร็จ",
      );
    } catch {
      setCompareShareMsg("แชร์รูปไม่สำเร็จ");
    } finally {
      setCompareShareBusy(null);
    }
  }

  async function handleCompareSaveImage() {
    if (compareShareBusy || compareRows.length === 0) return;
    setCompareShareBusy("save");
    setCompareShareMsg("");
    try {
      const dataUrl = await captureComparePng();
      const r = await downloadPngDataUrl(dataUrl, compareFilename());
      setCompareShareMsg(
        r.ok ? "บันทึกรูปแล้ว" : r.error ?? "บันทึกรูปไม่สำเร็จ",
      );
    } catch {
      setCompareShareMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setCompareShareBusy(null);
    }
  }

  async function handleCompareCopyText() {
    if (compareShareBusy || compareRows.length === 0) return;
    setCompareShareBusy("copy");
    setCompareShareMsg("");
    try {
      const ok = await copyTextToClipboard(buildCompareCopyText());
      setCompareShareMsg(
        ok ? "คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย" : "คัดลอกไม่สำเร็จ",
      );
    } catch {
      setCompareShareMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setCompareShareBusy(null);
    }
  }

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-site-primary/80">
          Owner · เมนูขายดี
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">
          วิเคราะห์เมนูขายดี
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          ค้นหา · กรองตัวเลือก · เทียบสาขา
          {hasTestBranch && !includeTest ? " · ไม่รวมสาขาทดลอง" : ""}
        </p>
      </header>

      {hasTestBranch ? (
        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-950">
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(e) => setIncludeTest(e.target.checked)}
          />
          รวมข้อมูลสาขาทดลอง
        </label>
      ) : null}

      <MobileDateRangeControl
        todayKey={today}
        from={from}
        to={to}
        preset={datePreset}
        maxDate={today}
        onChange={({ from: nextFrom, to: nextTo, preset }) => {
          setDatePreset(preset);
          setFrom(nextFrom);
          setTo(nextTo);
          writeViewQuery({ from: nextFrom, to: nextTo });
        }}
        trailing={
          <OwnerBranchFilterBar
            branches={filterBranches}
            value={filterBranchId}
            onChange={(id) => {
              setFilterBranchId(id);
              writeViewQuery({ branchId: id });
            }}
          />
        }
      />

      {filterBranchName ? (
        <p className="mb-3 text-[13px] font-semibold text-site-primary-medium">
          กำลังดูสาขา · {filterBranchName}
        </p>
      ) : null}

      <div className="mb-3 space-y-2">
        <label className="block">
          <span className="sr-only">ค้นหาเมนู</span>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="ค้นหาชื่อเมนู…"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-semibold text-slate-900 outline-none ring-site-primary/30 placeholder:font-medium placeholder:text-slate-400 focus:ring-2"
          />
        </label>
        <div className="flex gap-2">
          {(
            [
              ["quantity", "เรียงตามชิ้น"],
              ["revenue", "เรียงตามยอด"],
            ] as const
          ).map(([id, label]) => {
            const active = sort === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className={`flex-1 rounded-full py-2.5 text-[13px] font-extrabold ${
                  active
                    ? "bg-site-primary text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
          {(
            [
              {
                id: null as string | null,
                label: "รวมทั้งหมด",
                count: optionTotalQty,
              },
              ...optionSummary
                .filter((o) => o.quantity > 0)
                .map((o) => ({
                  id: o.name as string | null,
                  label:
                    o.name === OPTION_FILTER_NONE
                      ? "ไม่มีตัวเลือก"
                      : `อันดับ${o.name}`,
                  count: o.quantity,
                })),
            ] as const
          ).map((opt) => {
            const active = optionFilter === opt.id;
            return (
              <button
                key={opt.id ?? "all"}
                type="button"
                onClick={() => setOptionFilter(opt.id)}
                className={`rounded-full px-3.5 py-2 text-[13px] font-extrabold tabular-nums ${
                  active
                    ? "bg-amber-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {opt.label}
                {opt.count > 0 ? (
                  <span
                    className={`ml-1 ${active ? "opacity-90" : "text-slate-400"}`}
                  >
                    {formatPrice(opt.count)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {optionFilter != null ? (
          <p className="text-[12px] font-semibold text-amber-800">
            จัดอันดับเฉพาะ · {optionLabel} — ยอดและลำดับนับเฉพาะตัวเลือกนี้
          </p>
        ) : optionSummary.length > 0 ? (
          <p className="text-[12px] font-medium text-slate-500">
            กดชิปตัวเลือกเพื่อจัดอันดับเฉพาะ (ย่าง ทอด ชาบู ฯลฯ) — แต่ละรายการมีแถบสัดส่วนย่าง/ทอดถ้ามี
          </p>
        ) : null}
      </div>

      <section
        className={`mb-3 grid grid-cols-3 gap-2 ${loading ? "opacity-70" : ""}`}
      >
        <div className="rounded-2xl border border-site-primary-soft bg-site-primary-soft px-3 py-3">
          <p className="text-[11px] font-bold text-site-primary-medium">เมนู</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-site-primary-strong">
            {formatPrice(summary.itemCount)}
          </p>
        </div>
        <div className="rounded-2xl border border-site-primary-soft bg-site-primary-soft px-3 py-3">
          <p className="text-[11px] font-bold text-site-primary-medium">ชิ้นขาย</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-site-primary-strong">
            {formatPrice(summary.totalQty)}
          </p>
        </div>
        <div className="rounded-2xl border border-site-primary-soft bg-site-primary-soft px-3 py-3">
          <p className="text-[11px] font-bold text-site-primary-medium">มูลค่า</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-site-primary-strong">
            ฿{formatPrice(summary.totalRevenue)}
          </p>
        </div>
      </section>

      {multiBranch && compareBranches.length > 1 ? (
        <section className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold text-slate-900">
                เทียบสาขา
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                {compareOpen
                  ? `Top ${compareRows.length} · ชิ้นต่อสาขา`
                  : "เปิดเพื่อเทียบยอดขายแต่ละสาขา"}
              </p>
              {compareShareMsg ? (
                <p className="mt-1 text-[12px] font-semibold text-site-primary">
                  {compareShareMsg}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ShareExportMenu
                busy={compareShareBusy}
                message={compareShareMsg}
                disabled={loading || compareRows.length === 0}
                sheetTitle="แชร์เทียบสาขา"
                sheetHint="แชร์รูป บันทึกรูป หรือคัดลอกข้อความส่งทีม"
                onShareImage={handleCompareShareImage}
                onSaveImage={handleCompareSaveImage}
                onCopyText={handleCompareCopyText}
              />
              <button
                type="button"
                role="switch"
                aria-checked={compareOpen}
                aria-label="แสดงเทียบสาขา"
                onClick={() => setCompareOpen((v) => !v)}
                className={`relative h-8 w-14 shrink-0 rounded-full transition ${
                  compareOpen ? "bg-site-primary" : "bg-slate-300"
                }`}
              >
                <span
                  className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition"
                  style={{ left: compareOpen ? "1.65rem" : "0.2rem" }}
                />
              </button>
            </div>
          </div>
          {compareOpen ? (
            <div className="overflow-x-auto border-t border-slate-100">
              <div
                ref={compareCaptureRef}
                className="w-max min-w-full bg-white px-3 py-3"
              >
                <div className="mb-2 border-b border-slate-100 pb-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <p className="text-[13px] font-extrabold text-slate-900">
                      เมนูขายดีเทียบสาขา
                    </p>
                    <p className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                      {listStamp}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {[
                      brandName || null,
                      `ช่วง ${rangeLabel}`,
                      sortLabel,
                      `ตัวเลือก · ${optionLabel}`,
                      `${formatPrice(summary.itemCount)} เมนู · ${formatPrice(summary.totalQty)} ชิ้น · ฿${formatPrice(summary.totalRevenue)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {compareBranches.map((b) => b.name).join(" · ")}
                  </p>
                </div>
                <table className="min-w-full text-left text-[12px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="sticky left-0 bg-slate-50 px-3 py-2 font-bold">
                        เมนู
                      </th>
                      {compareBranches.map((b) => (
                        <th
                          key={b.id}
                          className="max-w-[5.5rem] truncate px-2 py-2 font-bold"
                          title={b.name}
                        >
                          {b.name}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-bold">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={compareBranches.length + 2}
                          className="px-3 py-8 text-center text-slate-400"
                        >
                          {loading ? "กำลังโหลด…" : "ยังไม่มีข้อมูล"}
                        </td>
                      </tr>
                    ) : (
                      compareRows.map((item) => (
                        <tr
                          key={item.key}
                          className="border-t border-slate-50"
                        >
                          <td className="sticky left-0 max-w-[8.5rem] bg-white px-3 py-2 text-slate-900">
                            <p className="truncate font-semibold">{item.name}</p>
                            {showCookCompare && item.byCook ? (
                              <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                                {formatCookBreakdownLine(item.byCook)}
                              </p>
                            ) : null}
                          </td>
                          {compareBranches.map((b) => {
                            const qty = qtyForBranch(item, b.id);
                            const max = Math.max(
                              1,
                              ...compareBranches.map((x) =>
                                qtyForBranch(item, x.id),
                              ),
                            );
                            const hot = qty === max && qty > 0;
                            return (
                              <td
                                key={b.id}
                                className={`px-2 py-2 tabular-nums ${
                                  hot
                                    ? "font-black text-site-primary"
                                    : "font-semibold text-slate-600"
                                }`}
                                title={`฿${formatPrice(revForBranch(item, b.id))}`}
                              >
                                {qty > 0 ? formatPrice(qty) : "—"}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 font-black tabular-nums text-slate-900">
                            {formatPrice(item.quantity)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section
        className={`overflow-hidden rounded-2xl border border-site-primary-soft/80 bg-white shadow-sm ${
          loading ? "opacity-70" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-site-primary-soft px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold text-slate-900">
              รายการเมนู
            </h2>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              กดแถวเพื่อดูยอดแยกสาขา
            </p>
            {shareMsg ? (
              <p className="mt-1 text-[12px] font-semibold text-site-primary">
                {shareMsg}
              </p>
            ) : null}
          </div>
          <ShareExportMenu
            busy={shareBusy}
            message={shareMsg}
            disabled={loading || items.length === 0}
            onShareImage={handleShareImage}
            onSaveImage={handleSaveImage}
            onCopyText={handleCopyText}
          />
        </div>
        <div ref={listCaptureRef} className="bg-white">
          <div className="border-b border-site-primary-soft px-4 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <p className="text-[13px] font-extrabold text-slate-900">
                รายการเมนูขายดี
              </p>
              <p className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                {listStamp}
              </p>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              {[
                brandName || null,
                filterBranchName ? `สาขา ${filterBranchName}` : null,
                `ช่วง ${rangeLabel}`,
                sortLabel,
                `ตัวเลือก · ${optionLabel}`,
                `${formatPrice(summary.itemCount)} เมนู · ${formatPrice(summary.totalQty)} ชิ้น · ฿${formatPrice(summary.totalRevenue)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              {loading
                ? "กำลังโหลด…"
                : q
                  ? "ไม่พบเมนูที่ตรงคำค้น"
                  : "ยังไม่มียอดขายในช่วงนี้"}
            </p>
          ) : (
            <ul className="divide-y divide-site-primary-soft">
              {items.map((item, index) => {
                const open = expandedKey === item.key;
                const maxBranchQty = Math.max(
                  1,
                  ...item.byBranch.map((b) => b.quantity),
                );
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedKey((k) =>
                          k === item.key ? null : item.key,
                        )
                      }
                      className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-site-primary-soft/50"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-site-primary-soft text-[12px] font-black tabular-nums text-site-primary-medium">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold text-slate-900">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                          {formatPrice(item.quantity)} ชิ้น · ฿
                          {formatPrice(item.revenueBaht)}
                          {multiBranch
                            ? ` · ${item.branchCount} สาขา`
                            : ""}
                          {open ? " · ซ่อน" : " · กดเทียบ"}
                        </p>
                        {showCookCompare && item.byCook ? (
                          <p className="mt-1 text-[12px] font-bold text-amber-800">
                            {formatCookBreakdownLine(item.byCook) ||
                              "ยังไม่มีแยกย่าง/ทอด"}
                          </p>
                        ) : optionFilter != null ? (
                          <p className="mt-1 text-[12px] font-semibold text-amber-700">
                            เฉพาะ{optionLabel}
                          </p>
                        ) : null}
                        {showCookCompare &&
                        ((item.byCook?.grill.quantity ?? 0) > 0 ||
                          (item.byCook?.fry.quantity ?? 0) > 0) ? (
                          <CookProportionBar
                            byCook={item.byCook}
                            className="mt-1.5 max-w-[12rem]"
                          />
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[13px] font-black tabular-nums text-site-primary-medium">
                        ฿{formatPrice(item.revenueBaht)}
                      </span>
                    </button>
                    {open ? (
                      <div className="space-y-2 bg-slate-50/80 px-4 pb-3 pt-1">
                        {item.byBranch.map((b) => {
                          const pct = Math.round(
                            (b.quantity / maxBranchQty) * 100,
                          );
                          const branchCook =
                            showCookCompare && b.byCook
                              ? formatCookBreakdownLine(b.byCook)
                              : "";
                          return (
                            <div key={b.branchId}>
                              <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                                <span className="min-w-0 truncate font-semibold text-slate-700">
                                  {b.branchName}
                                </span>
                                <span className="shrink-0 font-bold tabular-nums text-slate-800">
                                  {formatPrice(b.quantity)} ชิ้น · ฿
                                  {formatPrice(b.revenueBaht)}
                                </span>
                              </div>
                              {branchCook ? (
                                <p className="mb-1 text-[11px] font-semibold text-amber-800">
                                  {branchCook}
                                </p>
                              ) : null}
                              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full bg-site-primary"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <p className="mt-4 text-center text-[12px] font-medium text-slate-400">
        <Link
          href={homeHref}
          aria-label="กลับภาพรวมร้าน"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm"
        >
          <IconBack size={22} />
        </Link>
      </p>
    </div>
  );
}

export default function OwnerTopSellersPage() {
  return (
    <OwnerAppShell active="home">
      <OwnerTopSellersInner />
    </OwnerAppShell>
  );
}
