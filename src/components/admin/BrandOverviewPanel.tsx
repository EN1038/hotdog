"use client";

import { useEffect, useState, Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
};

type BranchRow = {
  branchId: string;
  branchName: string;
  brandId?: string | null;
  brandName?: string | null;
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
  completedRevenue: number;
  soldQty: number;
  netRevenue: number;
  stockItems: StockItem[];
};

type BrandOverview = {
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
  expenseTotal: number;
  expenseCount: number;
  completedRevenue: number;
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

const SECTION_TABS: { id: BrandHqSection; label: string }[] = [
  { id: "home", label: "ภาพรวม" },
  { id: "stock_now", label: "สต๊อกปัจจุบัน" },
  { id: "restock", label: "เติม" },
  { id: "issue", label: "จ่าย" },
];

const SECTION_COPY: Record<
  BrandHqSection,
  { title: string; description: string }
> = {
  home: {
    title: "สรุปภาพรวมแบรนด์",
    description:
      "ยอดขาย ค่าใช้จ่าย และสต๊อกขาย รวมทุกสาขาของแบรนด์นี้",
  },
  stock_now: {
    title: "สต๊อกขายปัจจุบัน",
    description: "คงเหลือเมนูขายตอนนี้ แยกตามสาขา — กดดูรายการเมนูได้",
  },
  restock: {
    title: "สรุปการเติมสต๊อก",
    description: "ยอดรับเข้า (STOCK_IN) ตามช่วงวันที่ แยกตามสาขา",
  },
  issue: {
    title: "สรุปการจ่ายออก",
    description:
      "ยอดจ่ายออกจากหน้าร้าน (ISSUE) ตามช่วงวันที่ — พร้อมยอดขายตัดสต๊อก",
  },
};

export function BrandOverviewPanel({
  brandId,
  section = "home",
}: {
  brandId?: string;
  section?: BrandHqSection;
}) {
  const pathname = usePathname();
  const initial = bangkokMonthRangeToToday();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<BrandOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  const [copyMsgByBranch, setCopyMsgByBranch] = useState<
    Record<string, string>
  >({});
  const [copyBusyBranchId, setCopyBusyBranchId] = useState<string | null>(null);

  const isHome = section === "home";
  const isStockNow = section === "stock_now";
  const isRestock = section === "restock";
  const isIssue = section === "issue";
  const showDateFilter = !isStockNow;
  const showExpand = isHome || isStockNow || isRestock || isIssue;
  const copy = SECTION_COPY[section];
  const tabBasePath =
    pathname && /^\/admin\/brands\/[^/]+$/.test(pathname)
      ? pathname
      : pathname === "/admin"
        ? "/admin"
        : brandId
          ? `/admin/brands/${brandId}`
          : "/admin";

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
  }, [brandId, from, to]);

  useEffect(() => {
    setExpandedBranchId(null);
    setCopyMsgByBranch({});
  }, [section]);

  function expandLabel(open: boolean) {
    if (isRestock) return open ? "ซ่อน" : "ดูรายการเติม";
    if (isIssue) return open ? "ซ่อน" : "ดูรายการจ่าย";
    return open ? "ซ่อน" : "ดูสต๊อกเมนู";
  }

  function itemQty(item: StockItem) {
    if (isRestock) return item.restockQty ?? 0;
    if (isIssue) return item.issueQty ?? 0;
    return item.quantity;
  }

  function itemSecondary(item: StockItem) {
    if (isRestock) return null;
    if (isIssue) return item.soldQty ?? 0;
    return item.wasteQty ?? 0;
  }

  function detailItemsForBranch(b: BranchRow) {
    return (b.stockItems ?? []).filter((item) => {
      if (isRestock) return (item.restockQty ?? 0) > 0;
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

    if (isHome) {
      lines.push(
        `ขายได้ ${money(b.completedRevenue)} ฿ · ค่าใช้จ่าย ${money(b.expenseTotal)} ฿ · ขายไป ${money(b.soldQty)} · สต๊อก ${money(b.saleStockQty)} · ของเสีย ${money(b.wasteQty)}`,
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
        if (isRestock) {
          lines.push(
            `${seq}. ${item.name}: เติม ${money(item.restockQty ?? 0)}`,
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
    (isHome ? 5 : 0) +
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
        </div>
        {showDateFilter ? (
          <div className="flex flex-wrap items-end gap-3">
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
          </div>
        ) : (
          <p className="text-xs text-slate-500">ยอดคงเหลือ ณ ตอนนี้</p>
        )}
      </div>

      <div
        className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-3"
        role="tablist"
        aria-label="เมนูสรุปแบรนด์"
      >
        {SECTION_TABS.map((tab) => {
          const active = section === tab.id;
          return (
            <Link
              key={tab.id}
              href={brandHqHref(tabBasePath, tab.id)}
              role="tab"
              aria-selected={active}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
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
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
              <p className="text-sm text-emerald-700">ขายได้ (รายได้)</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">
                {money(data?.completedRevenue ?? 0)} ฿
              </p>
              <p className="mt-1 text-xs text-emerald-600/80">
                {money(data?.soldQty ?? 0)} ชิ้น · ช่วงที่เลือก
              </p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 shadow-sm">
              <p className="text-sm text-rose-700">ค่าใช้จ่าย</p>
              <p className="mt-1 text-2xl font-bold text-rose-800">
                {money(data?.expenseTotal ?? 0)} ฿
              </p>
              <p className="mt-1 text-xs text-rose-600/80">
                {data?.expenseCount ?? 0} รายการ · ช่วงที่เลือก
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
              <p className="text-sm text-indigo-700">รายได้ − ค่าใช้จ่าย</p>
              <p className="mt-1 text-2xl font-bold text-indigo-800">
                {money(data?.netRevenue ?? 0)} ฿
              </p>
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

      {(data?.branches?.length ?? 0) > 0 ? (
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
                    <th className="px-3 py-2.5 text-right">ค่าใช้จ่าย</th>
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
                          <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">
                            {money(b.expenseTotal)} ฿
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {money(b.soldQty)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {money(b.saleStockQty)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {money(b.wasteQty)}
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
                            {money(b.wasteQty)}
                          </td>
                        </>
                      ) : null}
                      {showExpand ? (
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            className="text-xs font-semibold text-violet-700 hover:underline"
                            onClick={() =>
                              setExpandedBranchId(open ? null : b.branchId)
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
                                      {isRestock
                                        ? "เติม"
                                        : isIssue
                                          ? "จ่ายออก"
                                          : "คงเหลือ"}
                                    </th>
                                    {isIssue ? (
                                      <th className="px-2.5 py-2 text-right">
                                        ขายตัด
                                      </th>
                                    ) : (
                                      <th className="px-2.5 py-2 text-right">
                                        {isRestock ? "—" : "ของเสีย"}
                                      </th>
                                    )}
                                    {!isRestock && !isIssue ? (
                                      <th className="px-2.5 py-2 text-right">
                                        มูลค่า
                                      </th>
                                    ) : null}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {detailItems.map((item) => (
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
                                      <td className="px-2.5 py-1.5 text-right tabular-nums text-rose-700">
                                        {isRestock
                                          ? "—"
                                          : money(itemSecondary(item) ?? 0)}
                                      </td>
                                      {!isRestock && !isIssue ? (
                                        <td className="px-2.5 py-1.5 text-right tabular-nums">
                                          {money(item.value)} ฿
                                        </td>
                                      ) : null}
                                    </tr>
                                  ))}
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
