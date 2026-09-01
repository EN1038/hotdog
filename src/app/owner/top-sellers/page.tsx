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
import {
  captureElementToPng,
  copyTextToClipboard,
  downloadPngDataUrl,
  sharePngDataUrl,
} from "@/lib/share-media";
import {
  buildOwnerViewQuery,
  ownerSummaryHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";

type SortMode = "quantity" | "revenue";

type TopSellersPayload = {
  items: ShopTopSellerDetail[];
  summary: {
    itemCount: number;
    totalQty: number;
    totalRevenue: number;
  };
  branches: OwnerBranchRow[];
  hasTestBranch?: boolean;
};

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
  }, [from, to, filterBranchId, includeTest, sort, q]);

  const items = payload?.items ?? [];
  const summary = payload?.summary ?? {
    itemCount: 0,
    totalQty: 0,
    totalRevenue: 0,
  };
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
  const summaryHref = ownerSummaryHref({
    branchId: filterBranchId,
    from,
    to,
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
  }, [items, sort, from, to]);

  function buildListCopyText() {
    const lines: string[] = [];
    lines.push("รายการเมนูขายดี");
    if (brandName) lines.push(brandName);
    if (filterBranchName) lines.push(`สาขา ${filterBranchName}`);
    lines.push(`ช่วง ${rangeLabel}`);
    lines.push(sortLabel);
    lines.push(
      `${formatPrice(summary.itemCount)} เมนู · ${formatPrice(summary.totalQty)} ชิ้น · ฿${formatPrice(summary.totalRevenue)}`,
    );
    if (q) lines.push(`ค้นหา: ${q}`);
    lines.push("");
    items.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${item.name} — ${formatPrice(item.quantity)} ชิ้น · ฿${formatPrice(item.revenueBaht)}`,
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
        <p className="text-[12px] font-bold uppercase tracking-wide text-emerald-700/80">
          Owner · เมนูขายดี
        </p>
        <h1 className="mt-1 text-[22px] font-black text-slate-900">
          วิเคราะห์เมนูขายดี
        </h1>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          ค้นหา · เรียงลำดับ · เทียบสาขา
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
        <p className="mb-3 text-[13px] font-semibold text-emerald-800">
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
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-semibold text-slate-900 outline-none ring-emerald-500/30 placeholder:font-medium placeholder:text-slate-400 focus:ring-2"
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
                    ? "bg-emerald-700 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <section
        className={`mb-3 grid grid-cols-3 gap-2 ${loading ? "opacity-70" : ""}`}
      >
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
          <p className="text-[11px] font-bold text-emerald-800">เมนู</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-emerald-950">
            {formatPrice(summary.itemCount)}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
          <p className="text-[11px] font-bold text-emerald-800">ชิ้นขาย</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-emerald-950">
            {formatPrice(summary.totalQty)}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
          <p className="text-[11px] font-bold text-emerald-800">มูลค่า</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-emerald-950">
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
                <p className="mt-1 text-[12px] font-semibold text-emerald-700">
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
                  compareOpen ? "bg-emerald-600" : "bg-slate-300"
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
                          <td className="sticky left-0 max-w-[7rem] truncate bg-white px-3 py-2 font-semibold text-slate-900">
                            {item.name}
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
                                    ? "font-black text-emerald-700"
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
        className={`overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-sm ${
          loading ? "opacity-70" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-emerald-100 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold text-slate-900">
              รายการเมนู
            </h2>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              กดแถวเพื่อดูยอดแยกสาขา
            </p>
            {shareMsg ? (
              <p className="mt-1 text-[12px] font-semibold text-emerald-700">
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
          <div className="border-b border-emerald-50 px-4 py-2.5">
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
            <ul className="divide-y divide-emerald-50">
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
                      className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-emerald-50/50"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[12px] font-black tabular-nums text-emerald-800">
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
                      </div>
                      <span className="shrink-0 text-[13px] font-black tabular-nums text-emerald-800">
                        ฿{formatPrice(item.revenueBaht)}
                      </span>
                    </button>
                    {open ? (
                      <div className="space-y-2 bg-slate-50/80 px-4 pb-3 pt-1">
                        {item.byBranch.map((b) => {
                          const pct = Math.round(
                            (b.quantity / maxBranchQty) * 100,
                          );
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
                              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full bg-emerald-500"
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
        <Link href={summaryHref} className="font-bold text-slate-600">
          ← กลับภาพรวมร้าน
        </Link>
      </p>
    </div>
  );
}

export default function OwnerTopSellersPage() {
  return (
    <OwnerAppShell active="summary">
      <OwnerTopSellersInner />
    </OwnerAppShell>
  );
}
