"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  IconBack,
  IconChevronDown,
  IconChevronUp,
  IconFilter,
} from "@/components/icons";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState<ShareExportAction | null>(null);
  const [shareMsg, setShareMsg] = useState("");
  const listCaptureRef = useRef<HTMLDivElement>(null);
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

  const brandName = data?.brand?.nameTh || data?.brand?.name || "";
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
  const filtersActive = Boolean(q) || sort !== "quantity";
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

  const optionChips = useMemo(
    () => [
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
    ],
    [optionSummary, optionTotalQty],
  );

  function buildListCopyText() {
    const lines: string[] = [];
    lines.push("รายการเมนูขายดี");
    if (brandName) lines.push(brandName);
    if (filterBranchName) lines.push(`สาขา ${filterBranchName}`);
    else if (multiBranch) lines.push("ทุกสาขา");
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
      if (multiBranch && item.byBranch.length > 0) {
        const branchBits = [...item.byBranch]
          .sort((a, b) => b.quantity - a.quantity)
          .map(
            (b) =>
              `${b.branchName} ${formatPrice(b.quantity)} ชิ้น · ฿${formatPrice(b.revenueBaht)}`,
          );
        lines.push(`   ${branchBits.join(" · ")}`);
      }
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
            : (r.error ?? "แชร์รูปไม่สำเร็จ"),
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
      setShareMsg(r.ok ? "บันทึกรูปแล้ว" : (r.error ?? "บันทึกรูปไม่สำเร็จ"));
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

  return (
    <div className="pb-6">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <Link
            href={homeHref}
            aria-label="กลับภาพรวมร้าน"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 active:bg-slate-200"
          >
            <IconBack size={22} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-black text-slate-900">
              เมนูขายดี
            </h1>
            <p className="truncate text-[12px] font-medium text-slate-500">
              {rangeLabel}
              {filterBranchName ? ` · ${filterBranchName}` : " · ทุกสาขา"}
            </p>
          </div>
          <ShareExportMenu
            busy={shareBusy}
            message={shareMsg}
            disabled={loading || items.length === 0}
            sheetTitle="แชร์เมนูขายดี"
            sheetHint={
              multiBranch
                ? "แชร์รูป บันทึกรูป หรือคัดลอกข้อความ (รวมยอดแยกสาขา)"
                : "แชร์รูป บันทึกรูป หรือคัดลอกข้อความ"
            }
            onShareImage={handleShareImage}
            onSaveImage={handleSaveImage}
            onCopyText={handleCopyText}
          />
        </div>

        <div className="space-y-2 px-4 pb-3">
          <MobileDateRangeControl
            todayKey={today}
            from={from}
            to={to}
            preset={datePreset}
            maxDate={today}
            className="[&>div:first-child]:mb-0"
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

          {optionChips.length > 1 ? (
            <div className="-mx-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex flex-nowrap gap-2 px-4">
                {optionChips.map((opt) => {
                  const active = optionFilter === opt.id;
                  return (
                    <button
                      key={opt.id ?? "all"}
                      type="button"
                      onClick={() => setOptionFilter(opt.id)}
                      className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-extrabold tabular-nums ${
                        active
                          ? "bg-amber-600 text-white"
                          : "bg-white text-slate-600 ring-1 ring-slate-200"
                      }`}
                    >
                      {opt.label}
                      {opt.count > 0 ? (
                        <span
                          className={`ml-1 ${
                            active ? "opacity-90" : "text-slate-400"
                          }`}
                        >
                          {formatPrice(opt.count)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-extrabold ${
                filtersOpen || filtersActive
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              <IconFilter size={15} />
              ตัวกรอง
              {filtersActive ? (
                <span className="rounded-full bg-white/20 px-1.5 text-[11px]">
                  เปิดอยู่
                </span>
              ) : null}
              {filtersOpen ? (
                <IconChevronUp size={15} />
              ) : (
                <IconChevronDown size={15} />
              )}
            </button>
          </div>

          {filtersOpen ? (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <label className="block">
                <span className="sr-only">ค้นหาเมนู</span>
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="ค้นหาชื่อเมนู…"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-slate-900 outline-none ring-site-primary/30 placeholder:font-medium placeholder:text-slate-400 focus:ring-2"
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
              {hasTestBranch ? (
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-[13px] font-semibold text-violet-950">
                  <input
                    type="checkbox"
                    checked={includeTest}
                    onChange={(e) => setIncludeTest(e.target.checked)}
                  />
                  รวมสาขาทดลอง
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="px-4 pt-3">
        {optionFilter != null ? (
          <p className="mb-2 text-[12px] font-semibold text-amber-800">
            จัดอันดับเฉพาะ · {optionLabel}
          </p>
        ) : null}

        <p
          className={`mb-2 text-[13px] font-semibold tabular-nums text-slate-600 ${
            loading ? "opacity-60" : ""
          }`}
        >
          {formatPrice(summary.itemCount)} เมนู ·{" "}
          {formatPrice(summary.totalQty)} ชิ้น · ฿
          {formatPrice(summary.totalRevenue)}
        </p>

        {multiBranch ? (
          <p className="mb-3 text-[12px] font-medium text-slate-500">
            กดเมนูเพื่อเทียบยอดแต่ละสาขา
          </p>
        ) : (
          <p className="mb-3 text-[12px] font-medium text-slate-500">
            อันดับเมนูในช่วงที่เลือก
          </p>
        )}

        {shareMsg ? (
          <p className="mb-2 text-[12px] font-semibold text-site-primary">
            {shareMsg}
          </p>
        ) : null}

        <section
          className={`overflow-hidden rounded-[1.25rem] bg-white shadow-[0_2px_16px_rgba(6,43,75,0.06)] ring-1 ring-slate-100 ${
            loading ? "opacity-70" : ""
          }`}
        >
          <div ref={listCaptureRef} className="bg-white">
            <div className="border-b border-slate-100 px-4 py-2.5">
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
                  filterBranchName ? `สาขา ${filterBranchName}` : "ทุกสาขา",
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
              <ul className="divide-y divide-slate-100">
                {items.map((item, index) => {
                  const open = expandedKey === item.key;
                  const maxBranchQty = Math.max(
                    1,
                    ...item.byBranch.map((b) => b.quantity),
                  );
                  const canExpand = multiBranch && item.byBranch.length > 0;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        disabled={!canExpand}
                        onClick={() => {
                          if (!canExpand) return;
                          setExpandedKey((k) =>
                            k === item.key ? null : item.key,
                          );
                        }}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left ${
                          canExpand
                            ? "active:bg-site-primary-soft/50"
                            : "cursor-default"
                        }`}
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-site-primary-badge text-[12px] font-black tabular-nums text-site-primary-badge">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-bold text-[#0b2a4a]">
                            {item.name}
                          </p>
                          <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                            {formatPrice(item.quantity)} ชิ้น
                            {canExpand
                              ? ` · ${item.branchCount} สาขา${open ? " · ซ่อน" : " · กดเทียบ"}`
                              : null}
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
                        <p className="shrink-0 text-[14px] font-extrabold tabular-nums text-site-primary">
                          {formatPrice(item.revenueBaht)} ฿
                        </p>
                      </button>
                      {open && canExpand ? (
                        <div className="space-y-2.5 bg-slate-50/90 px-4 pb-3.5 pt-1">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            เทียบสาขา
                          </p>
                          {[...item.byBranch]
                            .sort((a, b) => b.quantity - a.quantity)
                            .map((b) => {
                              const pct = Math.round(
                                (b.quantity / maxBranchQty) * 100,
                              );
                              const hot = b.quantity === maxBranchQty;
                              const branchCook =
                                showCookCompare && b.byCook
                                  ? formatCookBreakdownLine(b.byCook)
                                  : "";
                              return (
                                <div key={b.branchId}>
                                  <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                                    <span
                                      className={`min-w-0 truncate font-semibold ${
                                        hot
                                          ? "text-site-primary"
                                          : "text-slate-700"
                                      }`}
                                    >
                                      {hot ? "▲ " : ""}
                                      {b.branchName}
                                    </span>
                                    <span
                                      className={`shrink-0 font-bold tabular-nums ${
                                        hot
                                          ? "text-site-primary"
                                          : "text-slate-800"
                                      }`}
                                    >
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
                                      className={`h-full rounded-full ${
                                        hot
                                          ? "bg-site-primary"
                                          : "bg-slate-400"
                                      }`}
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
      </div>
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
