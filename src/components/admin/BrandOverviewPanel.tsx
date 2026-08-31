"use client";

import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { toPng } from "html-to-image";
import { DateInput } from "@/components/DateInput";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import {
  bangkokDateKey,
  bangkokMonthRangeToToday,
  formatPrice,
} from "@/lib/constants";
import {
  brandHqHref,
  type BrandHqSection,
} from "@/lib/brand-hq-nav";
import { usePathname } from "next/navigation";

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

function formatBangkokDateTime(date = new Date()) {
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

type StockItem = {
  branchMenuItemId: string;
  name: string;
  sequence: number;
  quantity: number;
  wasteQty: number;
  restockQty: number;
  issueQty: number;
  soldQty: number;
  value: number;
  unitPrice?: number;
};

type BranchRow = {
  branchId: string;
  branchName: string;
  brandId?: string | null;
  brandName?: string | null;
  isTest?: boolean;
  saleStockQty: number;
  saleStockValue: number;
  wasteQty: number;
  wasteValue: number;
  restockQty: number;
  restockValue: number;
  issueQty: number;
  issueValue: number;
  expenseTotal: number;
  expenseCount: number;
  cashExpense?: number;
  transferExpense?: number;
  completedRevenue: number;
  cashRevenue?: number;
  transferRevenue?: number;
  soldQty: number;
  netRevenue: number;
  stockItems: StockItem[];
};

type BrandOverview = {
  from: string;
  to: string;
  includeTest?: boolean;
  hasTestBranch?: boolean;
  saleStockQty: number;
  saleStockValue: number;
  wasteQty: number;
  wasteValue: number;
  restockQty: number;
  restockValue: number;
  issueQty: number;
  issueValue: number;
  expenseTotal: number;
  expenseCount: number;
  cashExpense?: number;
  transferExpense?: number;
  completedRevenue: number;
  cashRevenue?: number;
  transferRevenue?: number;
  soldQty: number;
  netRevenue: number;
  branches: BranchRow[];
};

function money(n: number) {
  return formatPrice(n);
}

function formatDateKeyTh(key: string) {
  const [y, m, d] = key.split("-");
  if (!y || !m || !d) return key;
  return `${d}/${m}/${y}`;
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
  document.execCommand("copy");
  document.body.removeChild(ta);
}

const SECTION_COPY: Record<
  BrandHqSection,
  { title: string; description: string }
> = {
  home: {
    title: "สรุปภาพรวมแบรนด์",
    description:
      "ยอดขาย ค่าใช้จ่าย และสต๊อกขาย รวมทุกสาขา — ไม่รวมสาขาทดลอง (เปิดติ๊กได้)",
  },
  sales: {
    title: "สรุปยอดขาย",
    description:
      "รายได้แยกเงินสด/โอน และจำนวนขายตัดสต๊อกตามช่วงวันที่ — เทียบทุกสาขาหรือแยกสาขา",
  },
  stock_now: {
    title: "สต๊อกขายปัจจุบัน",
    description:
      "คงเหลือเมนูขายตอนนี้ — เทียบทุกสาขาหรือแยกสาขา กดดูรายการเมนูได้",
  },
  restock: {
    title: "สรุปการเติมสต๊อก",
    description:
      "ยอดรับเข้า (STOCK_IN) ตามช่วงวันที่ — เทียบทุกสาขาหรือแยกสาขา",
  },
  issue: {
    title: "สรุปการจ่ายออก",
    description:
      "ยอดจ่ายออกจากหน้าร้าน (ISSUE) ตามช่วงวันที่ — เทียบทุกสาขาหรือแยกสาขา",
  },
};

export function BrandOverviewPanel({
  brandId,
  section = "home",
}: {
  brandId?: string;
  section?: BrandHqSection;
}) {
  const pathname = usePathname() || "/admin";
  const initial = bangkokMonthRangeToToday();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<BrandOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  const [expandFocus, setExpandFocus] = useState<"all" | "waste">("all");
  const [copyMsgByBranch, setCopyMsgByBranch] = useState<
    Record<string, string>
  >({});
  const [copyBusyBranchId, setCopyBusyBranchId] = useState<string | null>(null);
  /** stock_now / restock / issue / sales: แยกสาขา vs เทียบเมนูทุกสาขา */
  const [stockViewMode, setStockViewMode] = useState<"by_branch" | "compare">(
    "compare",
  );
  const [compareBranchIds, setCompareBranchIds] = useState<string[]>([]);
  const [compareHideZero, setCompareHideZero] = useState(false);
  const [compareCopyMsg, setCompareCopyMsg] = useState<string | null>(null);
  const [compareExportBusy, setCompareExportBusy] = useState<
    "save" | "share" | "copy" | null
  >(null);
  const compareCaptureRef = useRef<HTMLDivElement | null>(null);
  const [compareCaptureStamp, setCompareCaptureStamp] = useState("");
  /** รวมยอดสาขาทดลองในสรุป — ค่าเริ่มต้นปิด (เปิดอัตโนมัติถ้าแบรนด์มีแต่สาขาทดลอง) */
  const [includeTest, setIncludeTest] = useState(false);
  const includeTestAutoRef = useRef(false);

  const isHome = section === "home";
  const isSales = section === "sales";
  const isStockNow = section === "stock_now";
  const isRestock = section === "restock";
  const isIssue = section === "issue";
  const canCompareView = isStockNow || isRestock || isIssue || isSales;
  const showDateFilter = !isStockNow;
  const showExpand = isHome || isStockNow || isRestock || isIssue || isSales;
  const copy = SECTION_COPY[section];
  const salesReportHref = brandHqHref(pathname, "sales");
  const cashTotal = data?.cashRevenue ?? 0;
  const transferTotal = data?.transferRevenue ?? 0;
  const cashExpenseTotal = data?.cashExpense ?? 0;
  const transferExpenseTotal = data?.transferExpense ?? 0;

  const showBrandCol = (() => {
    if (brandId) return false;
    const ids = new Set(
      (data?.branches ?? [])
        .map((b) => b.brandId)
        .filter((id): id is string => Boolean(id)),
    );
    return ids.size > 1;
  })();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const rangeFrom = from <= to ? from : to;
    const rangeTo = from <= to ? to : from;
    const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
    if (brandId) params.set("brandId", brandId);
    if (includeTest) params.set("includeTest", "1");
    const url = brandId
      ? `/api/admin/brands/${brandId}/overview?${params}`
      : `/api/admin/overview?${params}`;
    fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error ?? "โหลดสรุปไม่สำเร็จ");
        }
        return body as BrandOverview;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "โหลดสรุปไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, from, to, includeTest]);

  /** แบรนด์ที่มีแต่สาขาทดลอง (เช่น Demo) — เปิดรวมอัตโนมัติครั้งแรก */
  useEffect(() => {
    if (loading || includeTest || includeTestAutoRef.current) return;
    if (
      data?.hasTestBranch &&
      data.branches.length === 0 &&
      data.includeTest === false
    ) {
      includeTestAutoRef.current = true;
      setIncludeTest(true);
    }
  }, [loading, data, includeTest]);

  useEffect(() => {
    setExpandedBranchId(null);
    setCopyMsgByBranch({});
    setStockViewMode(
      section === "stock_now" ||
        section === "restock" ||
        section === "issue" ||
        section === "sales"
        ? "compare"
        : "by_branch",
    );
    setCompareCopyMsg(null);
    setCompareCaptureStamp("");
  }, [section]);

  useEffect(() => {
    if (!data?.branches?.length) {
      setCompareBranchIds([]);
      return;
    }
    setCompareBranchIds((prev) => {
      const ids = data.branches.map((b) => b.branchId);
      if (prev.length === 0) return ids;
      const kept = prev.filter((id) => ids.includes(id));
      return kept.length > 0 ? kept : ids;
    });
  }, [data]);

  const compareBranches = useMemo(() => {
    if (!data?.branches) return [];
    const selected = new Set(compareBranchIds);
    return data.branches.filter((b) => selected.has(b.branchId));
  }, [data, compareBranchIds]);

  const compareMeta = useMemo(() => {
    if (isRestock) {
      return {
        title: "เทียบการเติมทุกสาขา",
        fileSlug: "เทียบเติม",
        qtyHint: "เติม",
        hideZeroLabel: "ซ่อนเมนูที่รวมเป็น 0",
      };
    }
    if (isIssue) {
      return {
        title: "เทียบการจ่ายทุกสาขา",
        fileSlug: "เทียบจ่าย",
        qtyHint: "จ่ายออก",
        hideZeroLabel: "ซ่อนเมนูที่รวมเป็น 0",
      };
    }
    if (isSales) {
      return {
        title: "เทียบยอดขายทุกสาขา",
        fileSlug: "เทียบขาย",
        qtyHint: "ขาย",
        hideZeroLabel: "ซ่อนเมนูที่รวมเป็น 0",
      };
    }
    return {
      title: "เทียบสต๊อกทุกสาขา",
      fileSlug: "เทียบสต๊อก",
      qtyHint: "คงเหลือ",
      hideZeroLabel: "ซ่อนเมนูที่รวมเป็น 0",
    };
  }, [isRestock, isIssue, isSales]);

  function branchCompareBadgeQty(b: BranchRow) {
    if (isRestock) return b.restockQty ?? 0;
    if (isIssue) return b.issueQty ?? 0;
    if (isSales) return b.soldQty ?? 0;
    return b.saleStockQty ?? 0;
  }

  const stockCompareRows = useMemo(() => {
    if (!canCompareView || compareBranches.length === 0) return [];

    type Cell = { qty: number; value: number };
    const map = new Map<
      string,
      {
        name: string;
        sequence: number;
        byBranch: Record<string, Cell>;
      }
    >();

    for (const b of compareBranches) {
      for (const item of b.stockItems ?? []) {
        const key = item.name.trim();
        if (!key) continue;
        const cur = map.get(key) ?? {
          name: key,
          sequence: item.sequence || 9999,
          byBranch: {},
        };
        if (item.sequence > 0) {
          cur.sequence = Math.min(cur.sequence, item.sequence);
        }

        const qty = isRestock
          ? (item.restockQty ?? 0)
          : isIssue
            ? (item.issueQty ?? 0)
            : isSales
              ? (item.soldQty ?? 0)
              : (item.quantity ?? 0);
        const unitPrice =
          typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice)
            ? item.unitPrice
            : (item.quantity ?? 0) > 0
              ? (item.value ?? 0) / (item.quantity ?? 1)
              : 0;
        const value = isStockNow
          ? (item.value ?? 0)
          : Math.round(qty * unitPrice * 100) / 100;

        cur.byBranch[b.branchId] = { qty, value };
        map.set(key, cur);
      }
    }

    return [...map.values()]
      .map((row) => {
        let totalQty = 0;
        let totalValue = 0;
        for (const b of compareBranches) {
          const cell = row.byBranch[b.branchId];
          totalQty += cell?.qty ?? 0;
          totalValue += cell?.value ?? 0;
        }
        return {
          ...row,
          totalQty,
          totalValue: Math.round(totalValue * 100) / 100,
        };
      })
      .filter((row) => !compareHideZero || row.totalQty > 0)
      .sort(
        (a, b) =>
          a.sequence - b.sequence || a.name.localeCompare(b.name, "th"),
      );
  }, [
    canCompareView,
    isRestock,
    isIssue,
    isSales,
    isStockNow,
    compareBranches,
    compareHideZero,
  ]);

  function toggleCompareBranch(branchId: string) {
    setCompareBranchIds((prev) => {
      if (prev.includes(branchId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== branchId);
      }
      return [...prev, branchId];
    });
  }

  function selectAllCompareBranches() {
    if (!data?.branches) return;
    setCompareBranchIds(data.branches.map((b) => b.branchId));
  }

  function buildStockCompareCopyText() {
    const lines: string[] = [];
    lines.push(copy.title);
    lines.push(compareMeta.title);
    lines.push(
      `สาขา: ${compareBranches.map((b) => b.branchName).join(" · ")}`,
    );
    if (showDateFilter) {
      const rangeFrom = from <= to ? from : to;
      const rangeTo = from <= to ? to : from;
      lines.push(
        `ช่วง ${formatDateKeyTh(rangeFrom)} – ${formatDateKeyTh(rangeTo)}`,
      );
    }
    lines.push("");
    const header = [
      "ลำดับ",
      "เมนู",
      ...compareBranches.map((b) => b.branchName),
      "รวม",
      "มูลค่ารวม",
    ];
    lines.push(header.join("\t"));
    stockCompareRows.forEach((row, i) => {
      const cells = [
        String(row.sequence || i + 1),
        row.name,
        ...compareBranches.map((b) =>
          String(row.byBranch[b.branchId]?.qty ?? 0),
        ),
        String(row.totalQty),
        `${money(row.totalValue)}`,
      ];
      lines.push(cells.join("\t"));
    });
    lines.push("");
    lines.push(
      `รวมทั้งหมด ${money(stockCompareRows.reduce((s, r) => s + r.totalQty, 0))} ชิ้น · มูลค่า ${money(stockCompareRows.reduce((s, r) => s + r.totalValue, 0))} ฿`,
    );
    return lines.join("\n");
  }

  async function handleCopyStockCompare() {
    setCompareExportBusy("copy");
    try {
      await copyTextToClipboard(buildStockCompareCopyText());
      setCompareCopyMsg("คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย");
    } catch {
      setCompareCopyMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setCompareExportBusy(null);
      window.setTimeout(() => setCompareCopyMsg(null), 2500);
    }
  }

  async function captureStockComparePng(): Promise<string> {
    flushSync(() => {
      setCompareCaptureStamp(formatBangkokDateTime());
    });
    const node = compareCaptureRef.current;
    if (!node) throw new Error("ไม่พบตาราง");
    return toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
  }

  function stockCompareFilename() {
    const range =
      showDateFilter && from && to
        ? `_${from <= to ? from : to}_${from <= to ? to : from}`
        : `_${bangkokDateKey()}`;
    return `${compareMeta.fileSlug}_ทุกสาขา${range}.png`;
  }

  async function handleSaveStockCompareImage() {
    if (compareExportBusy || stockCompareRows.length === 0) return;
    setCompareExportBusy("save");
    setCompareCopyMsg("");
    try {
      const dataUrl = await captureStockComparePng();
      downloadDataUrl(dataUrl, stockCompareFilename());
      setCompareCopyMsg("บันทึกรูปแล้ว");
    } catch {
      setCompareCopyMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setCompareExportBusy(null);
      window.setTimeout(() => setCompareCopyMsg(null), 2500);
    }
  }

  async function handleShareStockCompareImage() {
    if (compareExportBusy || stockCompareRows.length === 0) return;
    setCompareExportBusy("share");
    setCompareCopyMsg("");
    try {
      const dataUrl = await captureStockComparePng();
      const blob = await dataUrlToBlob(dataUrl);
      const file = new File([blob], stockCompareFilename(), {
        type: "image/png",
      });
      const branchLabel = compareBranches.map((b) => b.branchName).join(" · ");
      const title = [compareMeta.title, branchLabel].filter(Boolean).join(" · ");

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          files: [file],
          title,
          text: title,
        });
        setCompareCopyMsg("แชร์รูปแล้ว");
        return;
      }

      downloadDataUrl(dataUrl, stockCompareFilename());
      setCompareCopyMsg(
        "อุปกรณ์นี้แชร์ไม่ได้ — บันทึกรูปแทนแล้ว ส่งในไลน์จากแกลเลอรี",
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setCompareCopyMsg(null);
        return;
      }
      setCompareCopyMsg("แชร์รูปไม่สำเร็จ");
    } finally {
      setCompareExportBusy(null);
      window.setTimeout(() => setCompareCopyMsg(null), 3000);
    }
  }

  function expandLabel(open: boolean) {
    if (open && expandFocus === "waste") return "ปิดของเสีย";
    if (isRestock) return open ? "ปิดรายการเติม" : "ดูรายการเติม";
    if (isIssue) return open ? "ปิดรายการจ่าย" : "ดูรายการจ่าย";
    if (isSales) return open ? "ปิดรายการขาย" : "ดูรายการขาย";
    return open ? "ปิดสต๊อกเมนู" : "ดูสต๊อกเมนู";
  }

  function openBranchExpand(branchId: string, focus: "all" | "waste" = "all") {
    if (expandedBranchId === branchId && expandFocus === focus) {
      setExpandedBranchId(null);
      return;
    }
    setExpandFocus(focus);
    setExpandedBranchId(branchId);
  }

  function branchWasteHref(branchId: string) {
    const rangeFrom = from <= to ? from : to;
    const rangeTo = from <= to ? to : from;
    const qs = new URLSearchParams({
      tab: "stock",
      view: "movements",
      type: "WASTE",
      from: rangeFrom,
      to: rangeTo,
    });
    return `/admin/branches/${branchId}?${qs.toString()}`;
  }

  function itemQty(item: StockItem) {
    if (expandFocus === "waste") return item.wasteQty ?? 0;
    if (isRestock) return item.restockQty ?? 0;
    if (isIssue) return item.issueQty ?? 0;
    if (isSales) return item.soldQty ?? 0;
    return item.quantity;
  }

  function itemSecondary(item: StockItem) {
    if (expandFocus === "waste") {
      const unit =
        typeof item.unitPrice === "number"
          ? item.unitPrice
          : item.quantity > 0
            ? item.value / item.quantity
            : 0;
      return Math.round((item.wasteQty ?? 0) * unit * 100) / 100;
    }
    if (isRestock || isSales) return null;
    if (isIssue) return item.soldQty ?? 0;
    return item.wasteQty ?? 0;
  }

  function detailItemsForBranch(b: BranchRow) {
    return (b.stockItems ?? []).filter((item) => {
      if (expandFocus === "waste") return (item.wasteQty ?? 0) > 0;
      if (isRestock) return (item.restockQty ?? 0) > 0;
      if (isSales) return (item.soldQty ?? 0) > 0;
      if (isIssue)
        return (
          (item.issueQty ?? 0) > 0 ||
          (item.soldQty ?? 0) > 0 ||
          (item.wasteQty ?? 0) > 0
        );
      return true;
    });
  }

  function buildBranchDetailCopyText(b: BranchRow) {
    const rangeFrom = from <= to ? from : to;
    const rangeTo = from <= to ? to : from;
    const items = detailItemsForBranch(b);
    const lines: string[] = [];
    if (b.brandName) lines.push(b.brandName);
    lines.push(`สาขา ${b.branchName}`);
    lines.push(copy.title);
    if (showDateFilter) {
      lines.push(
        `ช่วง ${formatDateKeyTh(rangeFrom)} – ${formatDateKeyTh(rangeTo)}`,
      );
    } else {
      lines.push("ยอดคงเหลือ ณ ตอนนี้");
    }
    lines.push("");

    if (expandFocus === "waste") {
      lines.push(`ของเสีย ${money(b.wasteQty)} ชิ้น`);
    } else if (isHome) {
      lines.push(
        `ขายได้ ${money(b.completedRevenue)} ฿ (เงินสด ${money(b.cashRevenue ?? 0)} · โอน ${money(b.transferRevenue ?? 0)}) · ค่าใช้จ่าย ${money(b.expenseTotal)} ฿ (เงินสด ${money(b.cashExpense ?? 0)} · โอน ${money(b.transferExpense ?? 0)}) · ขายไป ${money(b.soldQty)} · สต๊อก ${money(b.saleStockQty)} · ของเสีย ${money(b.wasteQty)}`,
      );
    } else if (isSales) {
      lines.push(
        `ขาย ${money(b.soldQty)} ชิ้น · รายได้ ${money(b.completedRevenue)} ฿ (เงินสด ${money(b.cashRevenue ?? 0)} · โอน ${money(b.transferRevenue ?? 0)})`,
      );
    } else if (isStockNow) {
      lines.push(
        `คงเหลือ ${money(b.saleStockQty)} · มูลค่า ${money(b.saleStockValue)} ฿ · ของเสีย ${money(b.wasteQty)}`,
      );
    } else if (isRestock) {
      lines.push(
        `เติมเข้า ${money(b.restockQty ?? 0)} · มูลค่า ${money(b.restockValue ?? 0)} ฿`,
      );
    } else if (isIssue) {
      lines.push(
        `จ่ายออก ${money(b.issueQty ?? 0)} · ขายตัดสต๊อก ${money(b.soldQty)} · ของเสีย ${money(b.wasteQty)}`,
      );
    }

    lines.push("");
    lines.push("รายการ:");
    if (items.length === 0) {
      lines.push("- ไม่มีรายการ");
    } else {
      for (const item of items) {
        const seq = item.sequence || "—";
        if (expandFocus === "waste") {
          lines.push(
            `${seq}. ${item.name}: ของเสีย ${money(item.wasteQty ?? 0)}`,
          );
        } else if (isRestock) {
          lines.push(
            `${seq}. ${item.name}: เติม ${money(item.restockQty ?? 0)}`,
          );
        } else if (isSales) {
          const unit =
            typeof item.unitPrice === "number"
              ? item.unitPrice
              : item.quantity > 0
                ? item.value / item.quantity
                : 0;
          const val =
            Math.round((item.soldQty ?? 0) * unit * 100) / 100;
          lines.push(
            `${seq}. ${item.name}: ขาย ${money(item.soldQty ?? 0)} · มูลค่า ~${money(val)} ฿`,
          );
        } else if (isIssue) {
          lines.push(
            `${seq}. ${item.name}: จ่ายออก ${money(item.issueQty ?? 0)} · ขายตัด ${money(item.soldQty ?? 0)} · ของเสีย ${money(item.wasteQty ?? 0)}`,
          );
        } else {
          lines.push(
            `${seq}. ${item.name}: คงเหลือ ${money(item.quantity)} · ของเสีย ${money(item.wasteQty ?? 0)} · มูลค่า ${money(item.value)} ฿`,
          );
        }
      }
    }
    return lines.join("\n");
  }

  async function handleCopyBranchDetail(b: BranchRow) {
    setCopyBusyBranchId(b.branchId);
    try {
      await copyTextToClipboard(buildBranchDetailCopyText(b));
      setCopyMsgByBranch((prev) => ({
        ...prev,
        [b.branchId]: "คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย",
      }));
    } catch {
      setCopyMsgByBranch((prev) => ({
        ...prev,
        [b.branchId]: "คัดลอกไม่สำเร็จ",
      }));
    } finally {
      setCopyBusyBranchId(null);
      window.setTimeout(() => {
        setCopyMsgByBranch((prev) => {
          const next = { ...prev };
          delete next[b.branchId];
          return next;
        });
      }, 2500);
    }
  }

  const tableCols =
    1 +
    (showBrandCol ? 1 : 0) +
    (isHome ? 9 : 0) +
    (isSales ? 2 : 0) +
    (isStockNow ? 2 : 0) +
    (isRestock ? 2 : 0) +
    (isIssue ? 3 : 0) +
    (showExpand ? 1 : 0);

  return (
    <section className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-slate-900">
            {copy.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{copy.description}</p>
          {brandId ? (
            <Link
              href={`/admin/brands/${brandId}/stock-flow?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
              className="mt-2 inline-flex text-xs font-bold text-violet-700 hover:text-violet-900"
            >
              เปิดหน้าวิเคราะห์สต๊อกเต็ม · เทียบสาขา →
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {showDateFilter ? (
            <>
              <div className="w-[10.5rem]">
                <label className={adminLabelClass}>วันที่เริ่ม</label>
                <DateInput
                  className={adminInputClass}
                  value={from}
                  max={to || bangkokDateKey()}
                  onChange={(v) => {
                    if (v) setFrom(v);
                  }}
                />
              </div>
              <div className="w-[10.5rem]">
                <label className={adminLabelClass}>วันที่สิ้นสุด</label>
                <DateInput
                  className={adminInputClass}
                  value={to}
                  min={from}
                  max={bangkokDateKey()}
                  onChange={(v) => {
                    if (v) setTo(v);
                  }}
                />
              </div>
            </>
          ) : (
            <p className="pb-2 text-xs text-slate-500">ยอดคงเหลือ ณ ตอนนี้</p>
          )}
          {data?.hasTestBranch ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
              <input
                type="checkbox"
                checked={includeTest}
                onChange={(e) => setIncludeTest(e.target.checked)}
              />
              รวมสาขาทดลอง
            </label>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div
        className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${
          loading ? "opacity-60" : ""
        }`}
      >
        {isHome || isStockNow ? (
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm">
            <p className="text-sm text-violet-700">สต๊อกขายปัจจุบัน</p>
            <p className="mt-1 text-2xl font-bold text-violet-800">
              {money(data?.saleStockQty ?? 0)}
            </p>
            <p className="mt-1 text-xs text-violet-600/80">
              มูลค่า {money(data?.saleStockValue ?? 0)} ฿
            </p>
          </div>
        ) : null}
        {isHome ? (
          <>
            <Link
              href={salesReportHref}
              className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm transition hover:border-emerald-400 hover:shadow-md"
            >
              <p className="text-sm text-emerald-700">ขายได้ (รายได้)</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">
                {money(data?.completedRevenue ?? 0)} ฿
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-emerald-800/90">
                <span>
                  เงินสด{" "}
                  <span className="font-semibold tabular-nums">
                    {money(cashTotal)} ฿
                  </span>
                </span>
                <span className="text-emerald-400">·</span>
                <span>
                  เงินโอน{" "}
                  <span className="font-semibold tabular-nums">
                    {money(transferTotal)} ฿
                  </span>
                </span>
              </div>
              <p className="mt-1.5 text-xs text-emerald-600/80">
                {money(data?.soldQty ?? 0)} ชิ้น · ช่วงที่เลือก · กดดูรายงานขาย
              </p>
            </Link>
            <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 shadow-sm">
              <p className="text-sm text-rose-700">ค่าใช้จ่าย</p>
              <p className="mt-1 text-2xl font-bold text-rose-800">
                {money(data?.expenseTotal ?? 0)} ฿
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-rose-800/90">
                <span>
                  เงินสด{" "}
                  <span className="font-semibold tabular-nums">
                    {money(cashExpenseTotal)} ฿
                  </span>
                </span>
                <span className="text-rose-300">·</span>
                <span>
                  เงินโอน{" "}
                  <span className="font-semibold tabular-nums">
                    {money(transferExpenseTotal)} ฿
                  </span>
                </span>
              </div>
              <p className="mt-1.5 text-xs text-rose-600/80">
                {data?.expenseCount ?? 0} รายการ · ช่วงที่เลือก
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
              <p className="text-sm text-indigo-700">รายได้ − ค่าใช้จ่าย</p>
              <p className="mt-1 text-2xl font-bold text-indigo-800">
                {money(data?.netRevenue ?? 0)} ฿
              </p>
              <div className="mt-2 space-y-0.5 text-xs text-indigo-800/85">
                <p>
                  เงินสด{" "}
                  <span className="font-semibold tabular-nums">
                    {money(cashTotal - cashExpenseTotal)} ฿
                  </span>
                  <span className="text-indigo-400">
                    {" "}
                    (รับ {money(cashTotal)} − จ่าย {money(cashExpenseTotal)})
                  </span>
                </p>
                <p>
                  เงินโอน{" "}
                  <span className="font-semibold tabular-nums">
                    {money(transferTotal - transferExpenseTotal)} ฿
                  </span>
                  <span className="text-indigo-400">
                    {" "}
                    (รับ {money(transferTotal)} − จ่าย{" "}
                    {money(transferExpenseTotal)})
                  </span>
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 shadow-sm">
              <p className="text-sm text-orange-700">ของเสีย</p>
              <p className="mt-1 text-2xl font-bold text-orange-800">
                {money(data?.wasteQty ?? 0)}
              </p>
              <p className="mt-1 text-xs text-orange-600/80">
                มูลค่า {money(data?.wasteValue ?? 0)} ฿ · ช่วงที่เลือก
              </p>
            </div>
          </>
        ) : null}
        {isSales ? (
          <>
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
              <p className="text-sm text-emerald-700">ขายได้ (รายได้)</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">
                {money(data?.completedRevenue ?? 0)} ฿
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-emerald-800/90">
                <span>
                  เงินสด{" "}
                  <span className="font-semibold tabular-nums">
                    {money(cashTotal)} ฿
                  </span>
                </span>
                <span className="text-emerald-400">·</span>
                <span>
                  เงินโอน{" "}
                  <span className="font-semibold tabular-nums">
                    {money(transferTotal)} ฿
                  </span>
                </span>
              </div>
              <p className="mt-1.5 text-xs text-emerald-600/80">
                จากออเดอร์สำเร็จ · ช่วงที่เลือก
              </p>
            </div>
            <div className="rounded-2xl border border-lime-200 bg-gradient-to-br from-lime-50 to-white p-4 shadow-sm">
              <p className="text-sm text-lime-800">เงินสด</p>
              <p className="mt-1 text-2xl font-bold text-lime-900">
                {money(cashTotal)} ฿
              </p>
              <p className="mt-1 text-xs text-lime-700/80">
                ชำระเงินสด · ช่วงที่เลือก
              </p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
              <p className="text-sm text-sky-700">เงินโอน</p>
              <p className="mt-1 text-2xl font-bold text-sky-800">
                {money(transferTotal)} ฿
              </p>
              <p className="mt-1 text-xs text-sky-600/80">
                ชำระโอน · ช่วงที่เลือก
              </p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
              <p className="text-sm text-sky-700">ขายตัดสต๊อก</p>
              <p className="mt-1 text-2xl font-bold text-sky-800">
                {money(data?.soldQty ?? 0)}
              </p>
              <p className="mt-1 text-xs text-sky-600/80">
                ชิ้นจากออเดอร์ · ช่วงที่เลือก
              </p>
            </div>
          </>
        ) : null}
        {isRestock ? (
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm sm:col-span-2 xl:col-span-1">
            <p className="text-sm text-emerald-700">เติมเข้าแล้ว</p>
            <p className="mt-1 text-2xl font-bold text-emerald-800">
              {money(data?.restockQty ?? 0)}
            </p>
            <p className="mt-1 text-xs text-emerald-600/80">
              มูลค่า {money(data?.restockValue ?? 0)} ฿ · ช่วงที่เลือก
            </p>
          </div>
        ) : null}
        {isIssue ? (
          <>
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
              <p className="text-sm text-amber-800">จ่ายออก (หน้าร้าน)</p>
              <p className="mt-1 text-2xl font-bold text-amber-900">
                {money(data?.issueQty ?? 0)}
              </p>
              <p className="mt-1 text-xs text-amber-700/80">
                มูลค่า {money(data?.issueValue ?? 0)} ฿ · ช่วงที่เลือก
              </p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
              <p className="text-sm text-sky-700">ขายตัดสต๊อก</p>
              <p className="mt-1 text-2xl font-bold text-sky-800">
                {money(data?.soldQty ?? 0)}
              </p>
              <p className="mt-1 text-xs text-sky-600/80">ชิ้นจากออเดอร์ · ช่วงที่เลือก</p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 shadow-sm">
              <p className="text-sm text-orange-700">ของเสีย</p>
              <p className="mt-1 text-2xl font-bold text-orange-800">
                {money(data?.wasteQty ?? 0)}
              </p>
              <p className="mt-1 text-xs text-orange-600/80">
                มูลค่า {money(data?.wasteValue ?? 0)} ฿ · ช่วงที่เลือก
              </p>
            </div>
          </>
        ) : null}
        {isStockNow ? (
          <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 shadow-sm">
            <p className="text-sm text-orange-700">ของเสีย (ช่วงเดือนนี้ถึงวันนี้)</p>
            <p className="mt-1 text-2xl font-bold text-orange-800">
              {money(data?.wasteQty ?? 0)}
            </p>
            <p className="mt-1 text-xs text-orange-600/80">
              มูลค่า {money(data?.wasteValue ?? 0)} ฿
            </p>
          </div>
        ) : null}
      </div>

      {canCompareView && (data?.branches?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex flex-wrap gap-1.5"
            role="tablist"
            aria-label="มุมมองตาราง"
          >
            <button
              type="button"
              role="tab"
              aria-selected={stockViewMode === "by_branch"}
              onClick={() => setStockViewMode("by_branch")}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                stockViewMode === "by_branch"
                  ? "bg-violet-700 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              แยกสาขา
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={stockViewMode === "compare"}
              onClick={() => setStockViewMode("compare")}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                stockViewMode === "compare"
                  ? "bg-violet-700 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              เทียบทุกสาขา
            </button>
          </div>
          {stockViewMode === "compare" ? (
            <p className="text-xs text-slate-500">
              เมนู × สาขา · ยอด{compareMeta.qtyHint}รวมทุกสาขาที่เลือก
              {showDateFilter ? " · ตามช่วงวันที่" : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {canCompareView &&
      stockViewMode === "compare" &&
      (data?.branches?.length ?? 0) > 0 ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">
                เลือกสาขาที่ต้องการเทียบ
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-sky-700 hover:underline"
                  onClick={selectAllCompareBranches}
                >
                  เลือกทั้งหมด
                </button>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={compareHideZero}
                    onChange={(e) => setCompareHideZero(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  {compareMeta.hideZeroLabel}
                </label>
                <button
                  type="button"
                  disabled={
                    !!compareExportBusy || stockCompareRows.length === 0
                  }
                  onClick={() => void handleSaveStockCompareImage()}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                >
                  {compareExportBusy === "save" ? "กำลังบันทึก…" : "Save รูป"}
                </button>
                <button
                  type="button"
                  disabled={
                    !!compareExportBusy || stockCompareRows.length === 0
                  }
                  onClick={() => void handleShareStockCompareImage()}
                  className="rounded-lg border border-emerald-600 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                >
                  {compareExportBusy === "share" ? "กำลังแชร์…" : "แชร์รูป"}
                </button>
                <button
                  type="button"
                  disabled={
                    !!compareExportBusy || stockCompareRows.length === 0
                  }
                  onClick={() => void handleCopyStockCompare()}
                  className="rounded-lg border border-blue-600 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60"
                >
                  {compareExportBusy === "copy"
                    ? "กำลังคัดลอก…"
                    : "คัดลอกข้อความ"}
                </button>
                {compareCopyMsg ? (
                  <span className="text-xs text-slate-600">{compareCopyMsg}</span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(data?.branches ?? []).map((b) => {
                const active = compareBranchIds.includes(b.branchId);
                return (
                  <label
                    key={b.branchId}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "border-violet-300 bg-violet-50 text-violet-900"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={active}
                      onChange={() => toggleCompareBranch(b.branchId)}
                    />
                    {b.branchName}
                    {b.isTest ? (
                      <span className="text-[10px] font-bold text-violet-700">
                        {" "}
                        ทดลอง
                      </span>
                    ) : null}
                    <span className="tabular-nums text-slate-400">
                      ({money(branchCompareBadgeQty(b))})
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {compareBranches.length === 0 ? (
            <p className="text-sm text-slate-500">เลือกอย่างน้อย 1 สาขา</p>
          ) : stockCompareRows.length === 0 ? (
            <p className="text-sm text-slate-500">
              {compareHideZero
                ? "ไม่มีรายการที่มียอดรวม (ลองปิดซ่อนเมนูที่รวมเป็น 0)"
                : "ไม่มีรายการเมนูให้เทียบ"}
            </p>
          ) : (
            <div
              ref={compareCaptureRef}
              className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="mb-3 border-b border-slate-100 pb-2">
                <p className="text-sm font-extrabold text-slate-900">
                  {compareMeta.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {compareBranches.map((b) => b.branchName).join(" · ")}
                </p>
                {showDateFilter ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    ช่วง {formatDateKeyTh(from <= to ? from : to)} –{" "}
                    {formatDateKeyTh(from <= to ? to : from)}
                  </p>
                ) : null}
                {compareCaptureStamp ? (
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {compareCaptureStamp}
                  </p>
                ) : null}
              </div>
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-right">
                      ลำดับ
                    </th>
                    <th className="sticky left-10 z-10 min-w-[8rem] bg-slate-50 px-3 py-2.5">
                      เมนู
                    </th>
                    {compareBranches.map((b) => (
                      <th
                        key={b.branchId}
                        className="whitespace-nowrap px-3 py-2.5 text-right"
                        title={b.branchName}
                      >
                        {b.branchName.length > 14
                          ? `${b.branchName.slice(0, 12)}…`
                          : b.branchName}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-violet-800">
                      รวม
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-violet-800">
                      มูลค่ารวม
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockCompareRows.map((row, idx) => (
                    <tr
                      key={row.name}
                      className="bg-white hover:bg-violet-50/40"
                    >
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-right tabular-nums text-slate-500">
                        {row.sequence || idx + 1}
                      </td>
                      <td className="sticky left-10 z-10 bg-white px-3 py-2 font-medium text-slate-800">
                        {row.name}
                      </td>
                      {compareBranches.map((b) => {
                        const qty = row.byBranch[b.branchId]?.qty ?? 0;
                        return (
                          <td
                            key={b.branchId}
                            className={`px-3 py-2 text-right tabular-nums ${
                              qty === 0
                                ? "text-slate-300"
                                : isStockNow && qty <= 3
                                  ? "font-semibold text-amber-700"
                                  : isRestock
                                    ? "font-semibold text-emerald-800"
                                    : isIssue
                                      ? "font-semibold text-amber-900"
                                      : isSales
                                        ? "font-semibold text-sky-800"
                                        : "text-slate-800"
                            }`}
                          >
                            {money(qty)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-violet-900">
                        {money(row.totalQty)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {money(row.totalValue)} ฿
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-violet-50/60 text-sm font-bold">
                    <td
                      colSpan={2}
                      className="sticky left-0 z-10 bg-violet-50 px-3 py-2.5 text-slate-800"
                    >
                      รวมทุกเมนู
                    </td>
                    {compareBranches.map((b) => {
                      const sum = stockCompareRows.reduce(
                        (s, r) => s + (r.byBranch[b.branchId]?.qty ?? 0),
                        0,
                      );
                      return (
                        <td
                          key={b.branchId}
                          className="px-3 py-2.5 text-right tabular-nums text-violet-900"
                        >
                          {money(sum)}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right tabular-nums text-violet-900">
                      {money(
                        stockCompareRows.reduce((s, r) => s + r.totalQty, 0),
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-violet-900">
                      {money(
                        stockCompareRows.reduce((s, r) => s + r.totalValue, 0),
                      )}{" "}
                      ฿
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {(data?.branches?.length ?? 0) > 0 &&
      !(canCompareView && stockViewMode === "compare") ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2.5">สาขา</th>
                {showBrandCol ? (
                  <th className="px-3 py-2.5">แบรนด์</th>
                ) : null}
                {isHome ? (
                  <>
                    <th className="px-3 py-2.5 text-right">ขายได้</th>
                    <th className="px-3 py-2.5 text-right">เงินสด(ขาย)</th>
                    <th className="px-3 py-2.5 text-right">โอน(ขาย)</th>
                    <th className="px-3 py-2.5 text-right">ค่าใช้จ่าย</th>
                    <th className="px-3 py-2.5 text-right">เงินสด(จ่าย)</th>
                    <th className="px-3 py-2.5 text-right">โอน(จ่าย)</th>
                    <th className="px-3 py-2.5 text-right">ขายไป</th>
                    <th className="px-3 py-2.5 text-right">สต๊อก</th>
                    <th className="px-3 py-2.5 text-right">ของเสีย</th>
                  </>
                ) : null}
                {isStockNow ? (
                  <>
                    <th className="px-3 py-2.5 text-right">คงเหลือ</th>
                    <th className="px-3 py-2.5 text-right">มูลค่า</th>
                  </>
                ) : null}
                {isSales ? (
                  <>
                    <th className="px-3 py-2.5 text-right">ขาย (ชิ้น)</th>
                    <th className="px-3 py-2.5 text-right">รายได้</th>
                    <th className="px-3 py-2.5 text-right">เงินสด</th>
                    <th className="px-3 py-2.5 text-right">เงินโอน</th>
                  </>
                ) : null}
                {isRestock ? (
                  <>
                    <th className="px-3 py-2.5 text-right">เติม (ชิ้น)</th>
                    <th className="px-3 py-2.5 text-right">มูลค่า</th>
                  </>
                ) : null}
                {isIssue ? (
                  <>
                    <th className="px-3 py-2.5 text-right">จ่ายออก</th>
                    <th className="px-3 py-2.5 text-right">ขายตัดสต๊อก</th>
                    <th className="px-3 py-2.5 text-right">ของเสีย</th>
                  </>
                ) : null}
                {showExpand ? <th className="px-3 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data!.branches.map((b) => {
                const open = expandedBranchId === b.branchId;
                const detailItems = detailItemsForBranch(b);
                return (
                  <Fragment key={b.branchId}>
                    <tr className="bg-white hover:bg-slate-50/80">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/admin/branches/${b.branchId}?tab=overview`}
                          className="font-semibold text-slate-900 hover:text-sky-700 hover:underline"
                        >
                          {b.branchName}
                          {b.isTest ? (
                            <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800">
                              ทดลอง
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      {showBrandCol ? (
                        <td className="px-3 py-2.5 text-slate-600">
                          {b.brandName ?? "—"}
                        </td>
                      ) : null}
                      {isHome ? (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-800">
                            {money(b.completedRevenue)} ฿
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-lime-800">
                            {money(b.cashRevenue ?? 0)} ฿
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-sky-800">
                            {money(b.transferRevenue ?? 0)} ฿
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">
                            {money(b.expenseTotal)} ฿
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-rose-800/90">
                            {money(b.cashExpense ?? 0)} ฿
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-rose-800/90">
                            {money(b.transferExpense ?? 0)} ฿
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {money(b.soldQty)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {money(b.saleStockQty)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <button
                              type="button"
                              onClick={() =>
                                openBranchExpand(b.branchId, "waste")
                              }
                              className="font-semibold text-orange-700 hover:underline"
                              title="ดูเมนูที่ตัดของเสีย"
                            >
                              {money(b.wasteQty)}
                            </button>
                          </td>
                        </>
                      ) : null}
                      {isStockNow ? (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                            {money(b.saleStockQty)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {money(b.saleStockValue)} ฿
                          </td>
                        </>
                      ) : null}
                      {isSales ? (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-sky-800">
                            {money(b.soldQty)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-800">
                            {money(b.completedRevenue)} ฿
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-lime-800">
                            {money(b.cashRevenue ?? 0)} ฿
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-sky-800">
                            {money(b.transferRevenue ?? 0)} ฿
                          </td>
                        </>
                      ) : null}
                      {isRestock ? (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-800">
                            {money(b.restockQty ?? 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {money(b.restockValue ?? 0)} ฿
                          </td>
                        </>
                      ) : null}
                      {isIssue ? (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-900">
                            {money(b.issueQty ?? 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {money(b.soldQty)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <button
                              type="button"
                              onClick={() =>
                                openBranchExpand(b.branchId, "waste")
                              }
                              className="font-semibold text-orange-700 hover:underline"
                              title="ดูเมนูที่ตัดของเสีย"
                            >
                              {money(b.wasteQty)}
                            </button>
                          </td>
                        </>
                      ) : null}
                      {showExpand ? (
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            className="text-xs font-semibold text-violet-700 hover:underline"
                            onClick={() =>
                              openBranchExpand(
                                b.branchId,
                                open ? expandFocus : "all",
                              )
                            }
                          >
                            {expandLabel(open)}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                    {open && showExpand ? (
                      <tr className="bg-violet-50/40">
                        <td colSpan={tableCols} className="px-3 py-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-700">
                              {expandFocus === "waste"
                                ? `ของเสีย ${money(b.wasteQty)} ชิ้น — เมนูที่ตัดในช่วงนี้`
                                : null}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                            {expandFocus === "waste" ? (
                              <Link
                                href={branchWasteHref(b.branchId)}
                                className="rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-xs font-bold text-orange-800 hover:bg-orange-100"
                              >
                                ดูรายการที่หน้าร้านบันทึก
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              disabled={copyBusyBranchId === b.branchId}
                              onClick={() => void handleCopyBranchDetail(b)}
                              className="rounded-lg border border-blue-600 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60"
                            >
                              {copyBusyBranchId === b.branchId
                                ? "กำลังคัดลอก…"
                                : "คัดลอกข้อความ"}
                            </button>
                            {copyMsgByBranch[b.branchId] ? (
                              <p className="text-xs text-slate-600">
                                {copyMsgByBranch[b.branchId]}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-400">
                                คัดลอกแล้วไปวางในไลน์ได้
                              </p>
                            )}
                            </div>
                          </div>
                          {detailItems.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              ไม่มีรายการในช่วงนี้
                            </p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-violet-100 bg-white">
                              <table className="min-w-full text-xs">
                                <thead className="bg-violet-50 text-violet-900">
                                  <tr>
                                    <th className="px-2.5 py-2 text-right">
                                      ลำดับ
                                    </th>
                                    <th className="px-2.5 py-2 text-left">
                                      เมนู
                                    </th>
                                    <th className="px-2.5 py-2 text-right">
                                      {expandFocus === "waste"
                                        ? "ของเสีย"
                                        : isRestock
                                          ? "เติม"
                                          : isIssue
                                            ? "จ่ายออก"
                                            : isSales
                                              ? "ขาย"
                                              : "คงเหลือ"}
                                    </th>
                                    {expandFocus === "waste" || isSales ? (
                                      <th className="px-2.5 py-2 text-right">
                                        มูลค่า ~
                                      </th>
                                    ) : isIssue ? (
                                      <th className="px-2.5 py-2 text-right">
                                        ขายตัด
                                      </th>
                                    ) : (
                                      <th className="px-2.5 py-2 text-right">
                                        {isRestock ? "—" : "ของเสีย"}
                                      </th>
                                    )}
                                    {!isRestock &&
                                    !isIssue &&
                                    !isSales &&
                                    expandFocus !== "waste" ? (
                                      <th className="px-2.5 py-2 text-right">
                                        มูลค่า
                                      </th>
                                    ) : null}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {detailItems.map((item) => {
                                    const unit =
                                      typeof item.unitPrice === "number"
                                        ? item.unitPrice
                                        : item.quantity > 0
                                          ? item.value / item.quantity
                                          : 0;
                                    const soldValue =
                                      Math.round(
                                        (item.soldQty ?? 0) * unit * 100,
                                      ) / 100;
                                    return (
                                    <tr key={item.branchMenuItemId}>
                                      <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-500">
                                        {item.sequence || "—"}
                                      </td>
                                      <td className="px-2.5 py-1.5 font-medium text-slate-800">
                                        {item.name}
                                      </td>
                                      <td className="px-2.5 py-1.5 text-right tabular-nums">
                                        {money(itemQty(item))}
                                      </td>
                                      <td
                                        className={`px-2.5 py-1.5 text-right tabular-nums ${
                                          expandFocus === "waste" || isSales
                                            ? "text-slate-700"
                                            : "text-rose-700"
                                        }`}
                                      >
                                        {expandFocus === "waste"
                                          ? `${money(itemSecondary(item) ?? 0)} ฿`
                                          : isRestock
                                            ? "—"
                                            : isSales
                                              ? `${money(soldValue)} ฿`
                                              : money(itemSecondary(item) ?? 0)}
                                      </td>
                                      {!isRestock &&
                                      !isIssue &&
                                      !isSales &&
                                      expandFocus !== "waste" ? (
                                        <td className="px-2.5 py-1.5 text-right tabular-nums">
                                          {money(item.value)} ฿
                                        </td>
                                      ) : null}
                                    </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
