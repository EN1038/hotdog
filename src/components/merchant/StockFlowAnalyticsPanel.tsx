"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { formatPrice } from "@/lib/constants";
import {
  captureElementToPng,
  copyTextToClipboard,
  downloadPngDataUrl,
  sharePngDataUrl,
} from "@/lib/share-media";
import { IconClose, IconStore } from "@/components/icons";
import { ShareExportMenu } from "@/components/staff/ShareExportMenu";
import type {
  HqBranchRow,
  HqDailyPoint,
  HqMenuCompareRow,
} from "@/lib/admin-hq-overview";
import type { WarehouseStockFlow } from "@/lib/warehouse-stock-flow";
import { WarehouseStockFlowCard } from "@/components/merchant/WarehouseStockFlowCard";
import { WAREHOUSE_UI_ENABLED } from "@/lib/warehouse-ui";

export type StockFlowBranchMeta = {
  id: string;
  name: string;
  isTest?: boolean;
};

export type StockFlowAnalyticsData = {
  from: string;
  to: string;
  saleStockQty: number;
  saleStockValue: number;
  wasteQty: number;
  wasteValue: number;
  restockQty: number;
  restockValue: number;
  issueQty: number;
  issueValue: number;
  soldQty: number;
  completedRevenue: number;
  branches: HqBranchRow[];
  daily?: HqDailyPoint[];
  menuCompare?: HqMenuCompareRow[];
  warehouseFlow?: WarehouseStockFlow | null;
};

type SortKey =
  | "sold"
  | "waste"
  | "restock"
  | "issue"
  | "stock"
  | "value"
  | "name";

type MetricKey =
  | "restock"
  | "issue"
  | "sold"
  | "waste"
  | "stock"
  | "value";

const METRIC_TABS: { id: MetricKey; label: string; hint: string }[] = [
  { id: "restock", label: "รับเข้า", hint: "เติมสต๊อกในช่วง" },
  { id: "issue", label: "จ่ายออก", hint: "จ่ายออกจากสต๊อก (เบิกใช้)" },
  { id: "sold", label: "ขาย", hint: "ชิ้นจากบิลสำเร็จ" },
  { id: "waste", label: "เสีย", hint: "ชำรุด + สูญหาย" },
  { id: "stock", label: "คงเหลือ", hint: "สต๊อกปัจจุบัน" },
  { id: "value", label: "มูลค่า", hint: "คงเหลือ × ราคา" },
];

function branchMetric(b: HqBranchRow, key: MetricKey): number {
  switch (key) {
    case "restock":
      return b.restockQty;
    case "issue":
      return b.issueQty;
    case "sold":
      return b.soldQty;
    case "waste":
      return b.wasteQty;
    case "stock":
      return b.saleStockQty;
    case "value":
      return b.saleStockValue;
  }
}

function sliceMetric(
  slice: HqMenuCompareRow["byBranch"][number],
  key: MetricKey,
): number {
  switch (key) {
    case "restock":
      return slice.restockQty;
    case "issue":
      return slice.issueQty;
    case "sold":
      return slice.soldQty;
    case "waste":
      return slice.wasteQty;
    case "stock":
      return slice.quantity;
    case "value":
      return slice.value;
  }
}

function SectionShowSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${
        checked ? "bg-site-primary" : "bg-slate-300"
      }`}
    >
      <span
        className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition"
        style={{ left: checked ? "1.65rem" : "0.2rem" }}
      />
    </button>
  );
}

function TrendBars({
  daily,
  field,
  colorClass,
}: {
  daily: HqDailyPoint[];
  field: keyof Pick<
    HqDailyPoint,
    "soldQty" | "wasteQty" | "restockQty" | "revenueBaht"
  >;
  colorClass: string;
}) {
  const max = Math.max(1, ...daily.map((d) => Number(d[field]) || 0));
  const show = daily.length > 14 ? daily.slice(-14) : daily;
  return (
    <div className="flex h-24 items-end gap-1">
      {show.map((d) => {
        const v = Number(d[field]) || 0;
        const h = Math.max(v > 0 ? 8 : 2, Math.round((v / max) * 96));
        return (
          <div
            key={d.date}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${d.label}: ${formatPrice(v)}`}
          >
            <div
              className={`w-full max-w-[18px] rounded-t-md ${colorClass}`}
              style={{ height: h }}
            />
            <span className="truncate text-[9px] font-semibold text-slate-400">
              {d.label.replace(/\s.*/, "")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function rangeLabel(from?: string, to?: string) {
  if (!from || !to) return "";
  return from === to ? from : `${from} – ${to}`;
}

function formatCaptureStamp(date = new Date()) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function BranchComparePickButton({
  branches,
  selectedIds,
  onChange,
}: {
  branches: { branchId: string; branchName: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = new Set(selectedIds);
  const allOn = branches.length > 0 && selectedIds.length === branches.length;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(id: string) {
    if (selected.has(id)) {
      if (selectedIds.length <= 1) return;
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    onChange([...selectedIds, id]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm active:bg-slate-50"
        aria-label="เลือกสาขาที่ต้องการเทียบ"
        title="เลือกสาขาเทียบ"
      >
        <IconStore size={20} />
        {!allOn ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-700 px-1 text-[9px] font-black text-white">
            {selectedIds.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="เลือกสาขาเทียบ"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-[15px] font-extrabold text-slate-900">
                  เลือกสาขาเทียบ
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  เลือกอย่างน้อย 1 สาขา · เลือกแล้ว {selectedIds.length}/
                  {branches.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
                aria-label="ปิด"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="flex gap-2 px-4 pt-3">
              <button
                type="button"
                onClick={() => onChange(branches.map((b) => b.branchId))}
                className="rounded-full bg-violet-700 px-3 py-1.5 text-[12px] font-extrabold text-white"
              >
                เลือกทั้งหมด
              </button>
              <button
                type="button"
                disabled={selectedIds.length <= 1}
                onClick={() =>
                  onChange(selectedIds.slice(0, 1))
                }
                className="rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-extrabold text-slate-600 disabled:opacity-40"
              >
                เหลือสาขาเดียว
              </button>
            </div>
            <ul className="max-h-[55vh] space-y-1.5 overflow-y-auto px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {branches.map((b) => {
                const on = selected.has(b.branchId);
                return (
                  <li key={b.branchId}>
                    <button
                      type="button"
                      onClick={() => toggle(b.branchId)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left ${
                        on
                          ? "border-violet-300 bg-violet-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[12px] font-black ${
                          on
                            ? "border-violet-700 bg-violet-700 text-white"
                            : "border-slate-300 bg-white text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span
                        className={`min-w-0 truncate text-[14px] font-bold ${
                          on ? "text-violet-950" : "text-slate-600"
                        }`}
                      >
                        {b.branchName}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function StockFlowAnalyticsPanel({
  data,
  loading,
  filterBranches,
  compareMetric,
  onCompareMetricChange,
  links,
  filterBranchName,
}: {
  data: StockFlowAnalyticsData | null;
  loading?: boolean;
  filterBranches: StockFlowBranchMeta[];
  compareMetric: MetricKey;
  onCompareMetricChange: (m: MetricKey) => void;
  filterBranchName?: string | null;
  links?: {
    waste?: string;
    topSellers?: string;
    aging?: string;
    manageStock?: string;
  };
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("sold");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [branchCompareOpen, setBranchCompareOpen] = useState(true);
  const [trendOpen, setTrendOpen] = useState(false);
  const [menuCompareOpen, setMenuCompareOpen] = useState(true);
  const [menuDetailOpen, setMenuDetailOpen] = useState(false);
  const [menuCompareBusy, setMenuCompareBusy] = useState<
    "share" | "save" | "copy" | null
  >(null);
  const [menuCompareMsg, setMenuCompareMsg] = useState("");
  const [menuCompareStamp, setMenuCompareStamp] = useState(() =>
    formatCaptureStamp(),
  );
  const [pickedBranchIds, setPickedBranchIds] = useState<string[] | null>(
    null,
  );
  const menuCompareCaptureRef = useRef<HTMLDivElement>(null);

  const branches = data?.branches ?? [];
  const daily = data?.daily ?? [];
  const menuCompare = data?.menuCompare ?? [];
  const multiBranch = branches.length > 1;

  useEffect(() => {
    const tick = () => setMenuCompareStamp(formatCaptureStamp());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pickedBranchIds) return;
    const ids = new Set(branches.map((b) => b.branchId));
    const next = pickedBranchIds.filter((id) => ids.has(id));
    if (next.length === 0) setPickedBranchIds(null);
    else if (next.length !== pickedBranchIds.length) setPickedBranchIds(next);
  }, [branches, pickedBranchIds]);

  const filteredMenus = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = menuCompare;
    if (needle) {
      rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name, "th");
        case "waste":
          return b.wasteQty - a.wasteQty || b.soldQty - a.soldQty;
        case "restock":
          return b.restockQty - a.restockQty || b.soldQty - a.soldQty;
        case "issue":
          return b.issueQty - a.issueQty || b.soldQty - a.soldQty;
        case "stock":
          return b.quantity - a.quantity || b.soldQty - a.soldQty;
        case "value":
          return b.value - a.value || b.soldQty - a.soldQty;
        case "sold":
        default:
          return b.soldQty - a.soldQty || b.wasteQty - a.wasteQty;
      }
    });
    return sorted;
  }, [menuCompare, q, sort]);

  const compareBranches = useMemo(() => {
    if (!pickedBranchIds) return branches;
    const allow = new Set(pickedBranchIds);
    const picked = branches.filter((b) => allow.has(b.branchId));
    return picked.length > 0 ? picked : branches;
  }, [branches, pickedBranchIds]);

  const maxBranchMetric = Math.max(
    1,
    ...branches.map((b) => branchMetric(b, compareMetric)),
  );

  const metricLabel =
    METRIC_TABS.find((t) => t.id === compareMetric)?.label ?? "";
  const compareRange = rangeLabel(data?.from, data?.to);

  async function captureMenuComparePng() {
    flushSync(() => {
      setMenuCompareOpen(true);
      setMenuCompareStamp(formatCaptureStamp());
    });
    const node = menuCompareCaptureRef.current;
    if (!node) throw new Error("ไม่พบตาราง");
    return await captureElementToPng(node);
  }

  function menuCompareFilename() {
    const from = data?.from ?? "";
    const to = data?.to ?? from;
    const range = from && to ? `_${from}_${to}` : "";
    return `เมนูเทียบสาขา${range}.png`;
  }

  function buildMenuCompareCopyText() {
    const header = [
      "เมนู",
      ...compareBranches.map((b) => b.branchName),
      "รวม",
    ];
    const lines = [
      `เมนูเทียบสาขา · ${metricLabel} · ${formatCaptureStamp()}`,
      ...(compareRange ? [`ช่วง ${compareRange}`] : []),
      compareBranches.map((b) => b.branchName).join(" · "),
      "",
      header.join("\t"),
    ];
    for (const item of filteredMenus) {
      const cells = [
        item.name,
        ...compareBranches.map((b) => {
          const slice = item.byBranch.find((x) => x.branchId === b.branchId);
          const v = slice ? sliceMetric(slice, compareMetric) : 0;
          return v > 0 ? formatPrice(v) : "—";
        }),
        formatPrice(
          compareBranches.reduce((sum, b) => {
            const slice = item.byBranch.find((x) => x.branchId === b.branchId);
            return sum + (slice ? sliceMetric(slice, compareMetric) : 0);
          }, 0),
        ),
      ];
      lines.push(cells.join("\t"));
    }
    return lines.join("\n");
  }

  async function handleMenuCompareSaveImage() {
    if (menuCompareBusy || filteredMenus.length === 0) return;
    setMenuCompareBusy("save");
    setMenuCompareMsg("");
    try {
      const dataUrl = await captureMenuComparePng();
      const r = await downloadPngDataUrl(dataUrl, menuCompareFilename());
      setMenuCompareMsg(r.ok ? "บันทึกรูปแล้ว" : r.error ?? "บันทึกรูปไม่สำเร็จ");
    } catch {
      setMenuCompareMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setMenuCompareBusy(null);
    }
  }

  async function handleMenuCompareShareImage() {
    if (menuCompareBusy || filteredMenus.length === 0) return;
    setMenuCompareBusy("share");
    setMenuCompareMsg("");
    try {
      const dataUrl = await captureMenuComparePng();
      const title = ["เมนูเทียบสาขา", metricLabel, compareRange]
        .filter(Boolean)
        .join(" · ");
      const r = await sharePngDataUrl(dataUrl, menuCompareFilename(), title);
      if (r.error === "cancelled") {
        setMenuCompareMsg("");
        return;
      }
      setMenuCompareMsg(
        r.mode === "share"
          ? "แชร์รูปแล้ว"
          : r.ok
            ? "อุปกรณ์นี้แชร์ไม่ได้ — บันทึกรูปแทนแล้ว"
            : r.error ?? "แชร์รูปไม่สำเร็จ",
      );
    } catch {
      setMenuCompareMsg("แชร์รูปไม่สำเร็จ");
    } finally {
      setMenuCompareBusy(null);
    }
  }

  async function handleMenuCompareCopyText() {
    if (menuCompareBusy || filteredMenus.length === 0) return;
    setMenuCompareBusy("copy");
    setMenuCompareMsg("");
    try {
      const ok = await copyTextToClipboard(buildMenuCompareCopyText());
      setMenuCompareMsg(
        ok ? "คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย" : "คัดลอกไม่สำเร็จ",
      );
    } catch {
      setMenuCompareMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setMenuCompareBusy(null);
    }
  }

  return (
    <div className={`space-y-3 ${loading ? "opacity-70" : ""}`}>
      {WAREHOUSE_UI_ENABLED && data?.warehouseFlow?.enabled ? (
        <>
          <WarehouseStockFlowCard
            data={data.warehouseFlow}
            branchName={filterBranchName}
          />
          <p className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            สาขาขาย · ไม่รวมสต๊อกกลาง
          </p>
        </>
      ) : null}
      <section className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:thin]">
        <div className="flex w-max min-w-full gap-2">
          {(
            [
              {
                metric: "restock" as MetricKey,
                label: "รับเข้า",
                qty: data?.restockQty ?? 0,
                value: data?.restockValue ?? 0,
                tone: "bg-sky-50 border-sky-200 text-sky-950",
                sub: "text-sky-700",
                note: "เติมสต๊อก",
              },
              {
                metric: "issue" as MetricKey,
                label: "จ่ายออก",
                qty: data?.issueQty ?? 0,
                value: data?.issueValue ?? 0,
                tone: "bg-amber-50 border-amber-200 text-amber-950",
                sub: "text-amber-700",
              note: "เบิกใช้ / ส่งออก",
            },
            {
              metric: "sold" as MetricKey,
              label: "ขาย",
              qty: data?.soldQty ?? 0,
              value: data?.completedRevenue ?? 0,
              tone: "bg-emerald-50 border-emerald-200 text-emerald-950",
              sub: "text-emerald-700",
              valueIsMoney: true,
              note: "จากบิลสำเร็จ",
            },
            {
              metric: "waste" as MetricKey,
              label: "เสีย",
              qty: data?.wasteQty ?? 0,
              value: data?.wasteValue ?? 0,
              tone: "bg-orange-50 border-orange-200 text-orange-950",
              sub: "text-orange-700",
              note: "ชำรุด/สูญหาย",
            },
              {
                metric: "stock" as MetricKey,
                label: "คงเหลือ",
                qty: data?.saleStockQty ?? 0,
                value: null as number | null,
                tone: "bg-violet-50 border-violet-200 text-violet-950",
                sub: "text-violet-700",
                note: "ปัจจุบัน",
              },
              {
                metric: "value" as MetricKey,
                label: "มูลค่า",
                qty: data?.saleStockValue ?? 0,
                value: null as number | null,
                tone: "bg-slate-50 border-slate-200 text-slate-950",
                sub: "text-slate-600",
                qtyIsMoney: true,
                note: "คงเหลือ",
              },
            ] as const
          ).map((card) => {
            const active = compareMetric === card.metric;
            const isMoney = "qtyIsMoney" in card && card.qtyIsMoney;
            const mainText = isMoney
              ? `฿${formatPrice(card.qty)}`
              : formatPrice(card.qty);
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => onCompareMetricChange(card.metric)}
                className={`shrink-0 rounded-2xl border px-3.5 py-3 text-left transition ${card.tone} ${
                  active
                    ? "ring-2 ring-violet-500 ring-offset-1"
                    : "active:scale-[0.98]"
                }`}
                aria-pressed={active}
                title={`เทียบสาขาตาม${card.label}`}
              >
                <p className={`whitespace-nowrap text-[11px] font-bold ${card.sub}`}>
                  {card.label}
                </p>
                <p className="mt-1 flex items-baseline gap-1 whitespace-nowrap">
                  <span className="text-[20px] font-black tabular-nums leading-none">
                    {mainText}
                  </span>
                  {!isMoney ? (
                    <span className={`text-[12px] font-bold ${card.sub}`}>
                      ชิ้น
                    </span>
                  ) : null}
                </p>
                {"note" in card && card.note ? (
                  <p
                    className={`mt-1.5 whitespace-nowrap text-[10px] font-semibold ${card.sub}`}
                  >
                    {card.note}
                    {card.value != null
                      ? ` · ฿${formatPrice(card.value)}`
                      : ""}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {links && (links.waste || links.topSellers || links.aging || links.manageStock) ? (
        <nav className="flex flex-wrap gap-2" aria-label="ลิงก์วิเคราะห์ที่เกี่ยวข้อง">
          {links.topSellers ? (
            <Link
              href={links.topSellers}
              className="rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-800 ring-1 ring-emerald-200"
            >
              เมนูขายดี
            </Link>
          ) : null}
          {links.waste ? (
            <Link
              href={links.waste}
              className="rounded-full bg-orange-50 px-3 py-1.5 text-[12px] font-bold text-orange-800 ring-1 ring-orange-200"
            >
              ของเสีย
            </Link>
          ) : null}
          {links.aging ? (
            <Link
              href={links.aging}
              className="rounded-full bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-800 ring-1 ring-rose-200"
            >
              ค้างอายุ
            </Link>
          ) : null}
          {links.manageStock ? (
            <Link
              href={links.manageStock}
              className="rounded-full bg-violet-50 px-3 py-1.5 text-[12px] font-bold text-violet-800 ring-1 ring-violet-200"
            >
              จัดการสต๊อก
            </Link>
          ) : null}
        </nav>
      ) : null}

      {daily.length > 1 ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold text-slate-900">
                แนวโน้มรายวัน
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                ขาย · ของเสีย · รับเข้า · ยอดเงิน
              </p>
            </div>
            <SectionShowSwitch
              checked={trendOpen}
              onChange={setTrendOpen}
              label="แสดงแนวโน้มรายวัน"
            />
          </div>
          {trendOpen ? (
            <div className="space-y-4 border-t border-slate-100 px-4 py-4">
              <div>
                <p className="mb-2 text-[12px] font-bold text-emerald-800">
                  ชิ้นขาย
                </p>
                <TrendBars
                  daily={daily}
                  field="soldQty"
                  colorClass="bg-emerald-500"
                />
              </div>
              <div>
                <p className="mb-2 text-[12px] font-bold text-orange-800">
                  ของเสีย
                </p>
                <TrendBars
                  daily={daily}
                  field="wasteQty"
                  colorClass="bg-orange-500"
                />
              </div>
              <div>
                <p className="mb-2 text-[12px] font-bold text-sky-800">รับเข้า</p>
                <TrendBars
                  daily={daily}
                  field="restockQty"
                  colorClass="bg-sky-500"
                />
              </div>
              <div>
                <p className="mb-2 text-[12px] font-bold text-slate-700">
                  ยอดขาย (฿)
                </p>
                <TrendBars
                  daily={daily}
                  field="revenueBaht"
                  colorClass="bg-slate-600"
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {multiBranch ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold text-slate-900">
                เทียบสาขา
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                เลือกตัวชี้วัดด้านล่าง
              </p>
            </div>
            <SectionShowSwitch
              checked={branchCompareOpen}
              onChange={setBranchCompareOpen}
              label="แสดงเทียบสาขา"
            />
          </div>
          {branchCompareOpen ? (
            <div className="border-t border-slate-100 px-4 py-3">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {METRIC_TABS.map((tab) => {
                  const active = compareMetric === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onCompareMetricChange(tab.id)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-extrabold ${
                        active
                          ? "bg-violet-700 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                      title={tab.hint}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <ul className="space-y-2.5">
                {[...branches]
                  .sort(
                    (a, b) =>
                      branchMetric(b, compareMetric) -
                      branchMetric(a, compareMetric),
                  )
                  .map((b) => {
                    const v = branchMetric(b, compareMetric);
                    const pct = Math.round((v / maxBranchMetric) * 100);
                    return (
                      <li key={b.branchId}>
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <p className="truncate text-[13px] font-bold text-slate-800">
                            {b.branchName}
                          </p>
                          <p className="shrink-0 text-[13px] font-black tabular-nums text-slate-900">
                            {compareMetric === "value"
                              ? `฿${formatPrice(v)}`
                              : formatPrice(v)}
                          </p>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] font-semibold text-slate-400">
                          รับ {formatPrice(b.restockQty)} · จ่าย{" "}
                          {formatPrice(b.issueQty)} · ขาย{" "}
                          {formatPrice(b.soldQty)} · เสีย{" "}
                          {formatPrice(b.wasteQty)} · เหลือ{" "}
                          {formatPrice(b.saleStockQty)}
                        </p>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {multiBranch ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-[15px] font-extrabold text-slate-900">
                  เมนูเทียบสาขา
                </p>
                <p className="text-[11px] font-medium tabular-nums text-slate-400">
                  {menuCompareStamp}
                </p>
              </div>
              <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                {filteredMenus.length} รายการ · {metricLabel}
                {compareBranches.length !== branches.length
                  ? ` · ${compareBranches.length} สาขา`
                  : ""}
              </p>
              {menuCompareMsg ? (
                <p className="mt-1 text-[12px] font-semibold text-emerald-700">
                  {menuCompareMsg}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <BranchComparePickButton
                branches={branches}
                selectedIds={compareBranches.map((b) => b.branchId)}
                onChange={setPickedBranchIds}
              />
              <ShareExportMenu
                busy={menuCompareBusy}
                message={menuCompareMsg}
                disabled={loading || filteredMenus.length === 0}
                onShareImage={handleMenuCompareShareImage}
                onSaveImage={handleMenuCompareSaveImage}
                onCopyText={handleMenuCompareCopyText}
              />
              <SectionShowSwitch
                checked={menuCompareOpen}
                onChange={setMenuCompareOpen}
                label="แสดงเมนูเทียบสาขา"
              />
            </div>
          </div>
          {menuCompareOpen ? (
            <div className="overflow-x-auto border-t border-slate-100">
              <div
                ref={menuCompareCaptureRef}
                className="w-max min-w-full bg-white px-3 py-3"
              >
                <div className="mb-2 border-b border-slate-100 pb-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <p className="text-[13px] font-extrabold text-slate-900">
                      เมนูเทียบสาขา · {metricLabel}
                    </p>
                    <p className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                      {menuCompareStamp}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {compareRange ? `ช่วง ${compareRange}` : null}
                    {compareRange ? " · " : ""}
                    {compareBranches.map((b) => b.branchName).join(" · ")}
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
                        key={b.branchId}
                        className="max-w-[5.5rem] truncate px-2 py-2 font-bold"
                        title={b.branchName}
                      >
                        {b.branchName}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-bold">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMenus.length === 0 ? (
                    <tr>
                      <td
                        colSpan={compareBranches.length + 2}
                        className="px-3 py-8 text-center text-slate-400"
                      >
                        {loading ? "กำลังโหลด…" : "ยังไม่มีข้อมูล"}
                      </td>
                    </tr>
                  ) : (
                    filteredMenus.map((item) => {
                      const vals = compareBranches.map((b) => {
                        const slice = item.byBranch.find(
                          (x) => x.branchId === b.branchId,
                        );
                        return slice ? sliceMetric(slice, compareMetric) : 0;
                      });
                      const max = Math.max(1, ...vals);
                      const rowTotal = vals.reduce((s, v) => s + v, 0);
                      return (
                        <tr
                          key={item.key}
                          className="border-t border-slate-50"
                        >
                          <td className="sticky left-0 max-w-[7rem] truncate bg-white px-3 py-2 font-semibold text-slate-900">
                            {item.name}
                          </td>
                          {compareBranches.map((b, idx) => {
                            const v = vals[idx] ?? 0;
                            const hot = v === max && v > 0;
                            return (
                              <td
                                key={b.branchId}
                                className={`px-2 py-2 tabular-nums ${
                                  hot
                                    ? "font-black text-violet-700"
                                    : "font-semibold text-slate-600"
                                }`}
                              >
                                {v > 0
                                  ? compareMetric === "value"
                                    ? formatPrice(v)
                                    : formatPrice(v)
                                  : "—"}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 font-black tabular-nums text-slate-900">
                            {rowTotal > 0 ? formatPrice(rowTotal) : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-slate-900">
              รายละเอียดเมนู
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              ค้นหา · เรียง · กดแถวเพื่อดูแยกสาขา
              {filterBranches.length > 1 ? " · รวมชื่อเมนูข้ามสาขา" : ""}
            </p>
          </div>
          <SectionShowSwitch
            checked={menuDetailOpen}
            onChange={setMenuDetailOpen}
            label="แสดงรายละเอียดเมนู"
          />
        </div>
        {menuDetailOpen ? (
          <>
        <div className="space-y-2 border-t border-b border-slate-100 px-4 py-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อเมนู…"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-900 outline-none ring-violet-500/30 placeholder:font-medium placeholder:text-slate-400 focus:ring-2"
          />
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["sold", "ขาย"],
                ["waste", "เสีย"],
                ["restock", "รับเข้า"],
                ["issue", "จ่าย"],
                ["stock", "เหลือ"],
                ["value", "มูลค่า"],
                ["name", "ชื่อ"],
              ] as const
            ).map(([id, label]) => {
              const active = sort === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSort(id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                    active
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        {filteredMenus.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            {loading ? "กำลังโหลด…" : "ไม่พบเมนูในช่วงนี้"}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredMenus.slice(0, 80).map((item, index) => {
              const open = expandedKey === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedKey(open ? null : item.key)
                    }
                    className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-slate-50"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-black tabular-nums text-slate-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-slate-900">
                        {item.name}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        รับ {formatPrice(item.restockQty)} · จ่าย{" "}
                        {formatPrice(item.issueQty)} · ขาย{" "}
                        {formatPrice(item.soldQty)} · เสีย{" "}
                        {formatPrice(item.wasteQty)}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-violet-700">
                        เหลือ {formatPrice(item.quantity)} · ฿
                        {formatPrice(item.value)}
                        {item.branchCount > 1
                          ? ` · ${item.branchCount} สาขา`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-slate-300" aria-hidden>
                      {open ? "▾" : "›"}
                    </span>
                  </button>
                  {open && item.byBranch.length > 0 ? (
                    <div className="border-t border-slate-50 bg-slate-50/80 px-4 py-2.5">
                      <ul className="space-y-2">
                        {item.byBranch.map((b) => {
                          const maxSold = Math.max(
                            1,
                            ...item.byBranch.map((x) => x.soldQty),
                          );
                          const hot = b.soldQty === maxSold && b.soldQty > 0;
                          return (
                            <li
                              key={b.branchId}
                              className="flex items-center justify-between gap-3 text-[12px]"
                            >
                              <span
                                className={`min-w-0 truncate font-bold ${
                                  hot ? "text-violet-800" : "text-slate-700"
                                }`}
                              >
                                {b.branchName}
                              </span>
                              <span className="shrink-0 text-right font-semibold tabular-nums text-slate-600">
                                ขาย {formatPrice(b.soldQty)} · เสีย{" "}
                                {formatPrice(b.wasteQty)} · เหลือ{" "}
                                {formatPrice(b.quantity)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {filteredMenus.length > 80 ? (
          <p className="border-t border-slate-100 px-4 py-3 text-center text-[12px] font-medium text-slate-400">
            แสดง 80 จาก {formatPrice(filteredMenus.length)} เมนู — ใช้ค้นหาเพื่อเจาะจง
          </p>
        ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}

export type { MetricKey as StockFlowMetricKey };
