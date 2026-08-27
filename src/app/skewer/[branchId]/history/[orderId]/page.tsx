"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  SkewerAppShell,
  useSkewerBranchMeta,
} from "@/components/skewer/SkewerAppShell";
import { LoadingState } from "@/components/LoadingState";
import { IconSkewerPlaceholder } from "@/components/icons";
import { ZoomableImage } from "@/components/ZoomableImage";
import { bangkokDateKey } from "@/lib/constants";
import { captureElementToPng } from "@/lib/share-media";
import {
  SKEWER_ORDER_STATUS_LABELS,
  SKEWER_CATEGORY_ROLE_LABELS,
  formatSkewerSplitSummary,
  formatSkewerQtyLabel,
  resolveSkewerCategoryRole,
  resolveSkewerMenuImageUrl,
  resolveSkewerQtyUnit,
  resolveSticksPerUnit,
  resolveCountsAsSticks,
  summarizeSkewerSplit,
} from "@/lib/skewer-order";
import { splitLinesBySkewerRole } from "@/components/skewer/SkewerSplitOrderSections";
import {
  assignStableMenuSequence,
  sortMenuItemData,
} from "@/lib/staff-menu-order";
import { compareThaiText } from "@/lib/thai-sort";
import type { SkewerOrderStatus } from "@prisma/client";

type OrderItem = {
  id: string;
  branchMenuItemId: string | null;
  itemName: string;
  requestedQuantity: number;
  confirmedQuantity: number | null;
  imageUrl: string | null;
  quantityUnit?: string | null;
  sticksPerUnit?: number | null;
  countsAsSticks?: boolean | null;
  skewerCategoryRole?: string | null;
};

type OrderDetail = {
  id: string;
  orderNumber: string;
  requestedDate: string;
  addressText: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  status: SkewerOrderStatus;
  adminNote: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
  items: OrderItem[];
};

type MenuItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  skewerImageUrl?: string | null;
  quantityUnit?: string | null;
  sticksPerUnit?: number | null;
  countsAsSticks?: boolean | null;
  isOutOfStock: boolean;
  sortOrder?: number | null;
  category: {
    id: string;
    name: string;
    sortOrder: number;
    skewerCategoryRole?: string | null;
  } | null;
};

type DisplayRow = {
  key: string;
  menuId: string | null;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  requestedQuantity: number;
  confirmedQuantity: number | null;
  quantityUnit: string;
  sticksPerUnit: number;
  countsAsSticks: boolean;
  skewerCategoryRole: "SKEWER_SALE" | "SKEWER_SUPPLY";
  ordered: boolean;
  seq: number;
};

type PageProps = {
  params: Promise<{ branchId: string; orderId: string }>;
};

function formatDateLabel(ymd: string) {
  try {
    return new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString("th-TH", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

function formatDateTimeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatBranchLabel(name: string | undefined) {
  if (!name?.trim()) return "";
  return name.trim().replace(/^สาขา\s*/i, "");
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
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("copy failed");
}

function rowDisplayQty(
  order: OrderDetail,
  item: DisplayRow,
): number {
  if (order.status === "CONFIRMED") {
    return item.ordered ? (item.confirmedQuantity ?? 0) : 0;
  }
  return item.requestedQuantity;
}

export default function SkewerHistoryDetailPage({ params }: PageProps) {
  const { branchId, orderId } = use(params);
  const meta = useSkewerBranchMeta(branchId);
  const captureRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [exportBusy, setExportBusy] = useState<"save" | "share" | "copy" | null>(
    null,
  );
  const [exportMsg, setExportMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      fetch(`/api/skewer/orders/${encodeURIComponent(orderId)}`).then(
        async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "โหลดออเดอร์ไม่สำเร็จ");
          return data as OrderDetail;
        },
      ),
      fetch(
        `/api/skewer/branch?branchId=${encodeURIComponent(branchId)}`,
      ).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "โหลดเมนูไม่สำเร็จ");
        return Array.isArray(data.menuItems) ? (data.menuItems as MenuItem[]) : [];
      }),
    ])
      .then(([orderData, menus]) => {
        if (cancelled) return;
        setOrder(orderData);
        setMenuItems(menus);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [branchId, orderId]);

  const orderByMenuId = useMemo(() => {
    const map = new Map<string, OrderItem>();
    if (!order) return map;
    for (const item of order.items) {
      if (item.branchMenuItemId) map.set(item.branchMenuItemId, item);
    }
    return map;
  }, [order]);

  const catalogSorted = useMemo(
    () => sortMenuItemData(menuItems),
    [menuItems],
  );

  const seqById = useMemo(
    () => assignStableMenuSequence(catalogSorted),
    [catalogSorted],
  );

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sortOrder: number }>();
    for (const item of menuItems) {
      if (!item.category) continue;
      if (!map.has(item.category.id)) {
        map.set(item.category.id, item.category);
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || compareThaiText(a.name, b.name),
    );
  }, [menuItems]);

  const displayRows = useMemo(() => {
    if (!order) return [] as DisplayRow[];

    const rows: DisplayRow[] = catalogSorted.map((menu) => {
      const ordered = orderByMenuId.get(menu.id);
      return {
        key: menu.id,
        menuId: menu.id,
        name: menu.name,
        imageUrl:
          ordered?.imageUrl ||
          resolveSkewerMenuImageUrl(menu) ||
          menu.imageUrl,
        categoryId: menu.category?.id ?? null,
        categoryName: menu.category?.name ?? null,
        requestedQuantity: ordered?.requestedQuantity ?? 0,
        confirmedQuantity: ordered?.confirmedQuantity ?? null,
        quantityUnit: resolveSkewerQtyUnit({
          quantityUnit: ordered?.quantityUnit ?? menu.quantityUnit,
        }),
        sticksPerUnit: resolveSticksPerUnit({
          sticksPerUnit: ordered?.sticksPerUnit ?? menu.sticksPerUnit,
        }),
        countsAsSticks: resolveCountsAsSticks({
          countsAsSticks: ordered?.countsAsSticks ?? menu.countsAsSticks,
        }),
        skewerCategoryRole: resolveSkewerCategoryRole({
          skewerCategoryRole: ordered?.skewerCategoryRole,
          category: menu.category,
        }),
        ordered: Boolean(ordered),
        seq: seqById.get(menu.id) ?? 9999,
      };
    });

    for (const item of order.items) {
      if (
        item.branchMenuItemId &&
        menuItems.some((m) => m.id === item.branchMenuItemId)
      ) {
        continue;
      }
      rows.push({
        key: `order-${item.id}`,
        menuId: item.branchMenuItemId,
        name: item.itemName,
        imageUrl: item.imageUrl,
        categoryId: null,
        categoryName: null,
        requestedQuantity: item.requestedQuantity,
        confirmedQuantity: item.confirmedQuantity,
        quantityUnit: resolveSkewerQtyUnit({
          quantityUnit: item.quantityUnit,
        }),
        sticksPerUnit: resolveSticksPerUnit({
          sticksPerUnit: item.sticksPerUnit,
        }),
        countsAsSticks: resolveCountsAsSticks({
          countsAsSticks: item.countsAsSticks,
        }),
        skewerCategoryRole: resolveSkewerCategoryRole({
          skewerCategoryRole: item.skewerCategoryRole,
        }),
        ordered: true,
        seq: 9999,
      });
    }

    return rows.sort((a, b) => a.seq - b.seq || compareThaiText(a.name, b.name));
  }, [order, catalogSorted, menuItems, orderByMenuId, seqById]);

  const visibleRows = useMemo(() => {
    if (categoryFilter === "ALL") return displayRows;
    return displayRows.filter((row) => row.categoryId === categoryFilter);
  }, [displayRows, categoryFilter]);

  const summary = useMemo(() => {
    if (!order) return null;
    const requestedSplit = summarizeSkewerSplit(
      order.items.map((i) => ({
        quantity: i.requestedQuantity,
        sticksPerUnit: i.sticksPerUnit,
        countsAsSticks: i.countsAsSticks,
        skewerCategoryRole: i.skewerCategoryRole,
      })),
    );
    const confirmedSplit = summarizeSkewerSplit(
      order.items.map((i) => ({
        quantity: i.confirmedQuantity ?? 0,
        sticksPerUnit: i.sticksPerUnit,
        countsAsSticks: i.countsAsSticks,
        skewerCategoryRole: i.skewerCategoryRole,
        ordered: i.confirmedQuantity != null && i.confirmedQuantity > 0,
      })),
    );
    return {
      requestedSplit,
      confirmedSplit,
      splitRequested: formatSkewerSplitSummary({
        sale: requestedSplit.sale,
        supplyItemCount: requestedSplit.supplyItemCount,
      }),
      splitConfirmed: formatSkewerSplitSummary({
        sale: confirmedSplit.sale,
        supplyItemCount: confirmedSplit.supplyItemCount,
      }),
      requestedStickTotal: requestedSplit.sale.stickTotal,
      confirmedStickTotal: confirmedSplit.sale.stickTotal,
      saleItemCount: requestedSplit.sale.itemCount,
      supplyItemCount: requestedSplit.supplyItemCount,
    };
  }, [order]);

  const { saleLines: visibleSaleRows, supplyLines: visibleSupplyRows } =
    useMemo(() => splitLinesBySkewerRole(visibleRows), [visibleRows]);

  const brandName = meta.brandName || "";
  const branchLabel = formatBranchLabel(meta.name);

  function exportFilename() {
    const num = order?.orderNumber || orderId;
    return `ออเดอร์ไม้_${num}_${bangkokDateKey()}.png`;
  }

  async function capturePng(): Promise<string> {
    const node = captureRef.current;
    if (!node) throw new Error("ไม่พบเนื้อหาออเดอร์");
    return captureElementToPng(node);
  }

  async function handleSaveImage() {
    if (exportBusy || !order) return;
    setExportBusy("save");
    setExportMsg("");
    try {
      const dataUrl = await capturePng();
      downloadDataUrl(dataUrl, exportFilename());
      setExportMsg("บันทึกรูปแล้ว");
    } catch {
      setExportMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareImage() {
    if (exportBusy || !order) return;
    setExportBusy("share");
    setExportMsg("");
    try {
      const dataUrl = await capturePng();
      const blob = await dataUrlToBlob(dataUrl);
      const file = new File([blob], exportFilename(), { type: "image/png" });
      const title = [
        brandName,
        branchLabel ? `สาขา ${branchLabel}` : "",
        `#${order.orderNumber}`,
      ]
        .filter(Boolean)
        .join(" · ");

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          files: [file],
          title,
          text: `ออเดอร์เสียบไม้ #${order.orderNumber}`,
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

  function buildCopyText() {
    if (!order || !summary) return "";
    const lines: string[] = [];
    if (brandName) lines.push(brandName);
    if (branchLabel) lines.push(`สาขา ${branchLabel}`);
    lines.push(
      `#${order.orderNumber} · ${SKEWER_ORDER_STATUS_LABELS[order.status]}`,
    );
    lines.push(
      formatDateTimeLabel(order.confirmedAt || order.createdAt),
    );
    lines.push(`ต้องการ ${formatDateLabel(order.requestedDate)}`);
    lines.push("");
    lines.push(`จำนวนที่สั่ง: ${summary.splitRequested}`);
    if (order.status === "CONFIRMED") {
      lines.push(`จำนวนที่ได้: ${summary.splitConfirmed}`);
    }
    lines.push(`ที่อยู่: ${order.addressText}`);
    if (order.note) lines.push(`โน้ต: ${order.note}`);
    if (categoryFilter !== "ALL") {
      const cat = categories.find((c) => c.id === categoryFilter);
      if (cat) lines.push(`หมวด ${cat.name}`);
    }
    lines.push("");
    const appendRows = (title: string, rows: DisplayRow[]) => {
      if (rows.length === 0) return;
      lines.push(title);
      rows.forEach((item) => {
        const qty = rowDisplayQty(order, item);
        const mark = item.ordered ? "" : " (ไม่ได้สั่ง)";
        lines.push(
          `${item.seq}. ${item.name}: ${formatSkewerQtyLabel(qty, item)}${mark}`,
        );
      });
      lines.push("");
    };
    const { saleLines, supplyLines } = splitLinesBySkewerRole(visibleRows);
    appendRows(SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SALE + ":", saleLines);
    appendRows(SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SUPPLY + ":", supplyLines);
    if (saleLines.length === 0 && supplyLines.length === 0) {
      lines.push("- ไม่มีรายการ");
    }
    return lines.join("\n").replace(/\n\n$/, "");
  }

  async function handleCopyText() {
    if (exportBusy || !order) return;
    setExportBusy("copy");
    setExportMsg("");
    try {
      await copyTextToClipboard(buildCopyText());
      setExportMsg("คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย");
    } catch {
      setExportMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  function renderHistoryRow(item: DisplayRow) {
    if (!order) return null;
    const confirmed = item.confirmedQuantity;
    const displayQty = rowDisplayQty(order, item);
    const less =
      order.status === "CONFIRMED" &&
      item.ordered &&
      confirmed != null &&
      confirmed < item.requestedQuantity;
    const same =
      order.status === "CONFIRMED" &&
      item.ordered &&
      confirmed != null &&
      confirmed === item.requestedQuantity;
    return (
      <li
        key={item.key}
        className={`grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0 ${
          item.ordered ? "" : "opacity-40"
        }`}
      >
        <span
          className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${
            item.ordered ? "text-gray-500" : "text-gray-300"
          }`}
        >
          {item.seq}
        </span>
        <div
          className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-site-primary-soft ${
            item.ordered ? "" : "grayscale"
          }`}
        >
          {item.imageUrl ? (
            <ZoomableImage
              src={item.imageUrl}
              alt={item.name}
              className="h-14 w-14 object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <IconSkewerPlaceholder size={28} />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p
            className={`truncate text-sm leading-tight ${
              item.ordered
                ? "font-bold text-gray-900"
                : "font-medium text-gray-400"
            }`}
          >
            {item.name}
          </p>
          <p
            className={`mt-0.5 text-xs ${
              item.ordered ? "text-gray-500" : "text-gray-300"
            }`}
          >
            {item.ordered
              ? order.status === "CONFIRMED"
                ? `สั่ง ${formatSkewerQtyLabel(item.requestedQuantity, item)}${
                    same
                      ? " · ได้เท่าที่สั่ง"
                      : less
                        ? " · น้อยกว่าที่สั่ง"
                        : ""
                  }`
                : formatSkewerQtyLabel(item.requestedQuantity, item)
              : "ไม่ได้สั่ง"}
          </p>
        </div>
        <div
          className={`min-w-[4.5rem] rounded-xl px-3 py-2 text-center ${
            !item.ordered
              ? "bg-gray-50 text-gray-300"
              : less
                ? "bg-amber-50 text-amber-700"
                : order.status === "CONFIRMED"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-slate-100 text-slate-900"
          }`}
        >
          <p className="text-lg font-black tabular-nums leading-none">
            {displayQty}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold opacity-70">
            {order.status === "CONFIRMED" && item.ordered ? "ได้" : "สั่ง"}
          </p>
        </div>
      </li>
    );
  }

  return (
    <SkewerAppShell branchId={branchId} active="history" meta={meta}>
      <div className="space-y-4 px-4 pb-6 pt-4">
        {loading ? (
          <LoadingState className="border-0 bg-transparent shadow-none" />
        ) : error || !order || !summary ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            {error || "ไม่พบออเดอร์"}
          </p>
        ) : (
          <div className="space-y-4">
            {categories.length > 1 ? (
              <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max min-w-full gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("ALL")}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                      categoryFilter === "ALL"
                        ? "bg-site-primary text-white"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                        categoryFilter === cat.id
                          ? "bg-site-primary text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              ref={captureRef}
              className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3"
            >
              <div className="border-b border-gray-100 pb-2.5">
                {brandName ? (
                  <p className="text-sm font-extrabold text-gray-900">
                    {brandName}
                  </p>
                ) : null}
                {branchLabel ? (
                  <p className="text-xs font-semibold text-gray-600">
                    สาขา {branchLabel}
                  </p>
                ) : null}
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <p className="min-w-0 text-xs font-bold text-gray-800">
                    #{order.orderNumber} ·{" "}
                    {SKEWER_ORDER_STATUS_LABELS[order.status]}
                  </p>
                  <p className="shrink-0 text-right text-[11px] text-gray-500">
                    {formatDateTimeLabel(
                      order.confirmedAt || order.createdAt,
                    )}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  ต้องการ {formatDateLabel(order.requestedDate)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-3.5 py-3 shadow-sm">
                  <p className="text-[11px] font-bold tracking-wide text-emerald-700/80">
                    จำนวนที่สั่ง
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-emerald-800/70">
                    {summary.splitRequested}
                  </p>
                  <div className="mt-2.5 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-500">
                        รวมไม้
                      </span>
                      <span className="text-lg font-black tabular-nums leading-none text-slate-900">
                        {summary.requestedStickTotal}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-500">
                        รายการขาย
                      </span>
                      <span className="text-sm font-extrabold tabular-nums text-emerald-700">
                        {summary.saleItemCount}{" "}
                        <span className="text-[10px] font-bold">ชนิด</span>
                      </span>
                    </div>
                    {summary.supplyItemCount > 0 ? (
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          ของสิ้นเปลือง
                        </span>
                        <span className="text-sm font-extrabold tabular-nums text-emerald-700">
                          {summary.supplyItemCount}{" "}
                          <span className="text-[10px] font-bold">รายการ</span>
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {order.status === "CONFIRMED" ? (
                  <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white px-3.5 py-3 shadow-sm">
                    <p className="text-[11px] font-bold tracking-wide text-sky-700/80">
                      จำนวนที่ได้
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-sky-800/70">
                      หลังยืนยัน
                    </p>
                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          รวม
                        </span>
                        <span className="text-lg font-black tabular-nums leading-none text-slate-900">
                          {summary.confirmedStickTotal}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          ต่างจากสั่ง
                        </span>
                        <span
                          className={`text-sm font-extrabold tabular-nums ${
                            summary.confirmedStickTotal <
                            summary.requestedStickTotal
                              ? "text-amber-700"
                              : "text-sky-700"
                          }`}
                        >
                          {summary.confirmedStickTotal -
                            summary.requestedStickTotal ===
                          0
                            ? "เท่ากัน"
                            : summary.confirmedStickTotal -
                              summary.requestedStickTotal}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : order.status === "CANCELLED" ? (
                  <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white px-3.5 py-3 shadow-sm">
                    <p className="text-[11px] font-bold tracking-wide text-rose-700/80">
                      สถานะ
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-rose-800/70">
                      ยกเลิกแล้ว
                    </p>
                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          รวม
                        </span>
                        <span className="text-lg font-black tabular-nums leading-none text-slate-900">
                          0
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          รายการ
                        </span>
                        <span className="text-sm font-extrabold tabular-nums text-rose-700">
                          {summary.saleItemCount}{" "}
                          <span className="text-[10px] font-bold">ชนิด</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white px-3.5 py-3 shadow-sm">
                    <p className="text-[11px] font-bold tracking-wide text-amber-700/80">
                      สถานะ
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-amber-800/70">
                      รอยืนยัน
                    </p>
                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          สั่งไว้
                        </span>
                        <span className="text-lg font-black tabular-nums leading-none text-slate-900">
                          {summary.requestedStickTotal}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          รายการ
                        </span>
                        <span className="text-sm font-extrabold tabular-nums text-amber-700">
                          {summary.saleItemCount}{" "}
                          <span className="text-[10px] font-bold">ชนิด</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 px-0.5 pt-1">
                <p className="whitespace-pre-wrap text-sm text-gray-700">
                  ที่อยู่: {order.addressText}
                </p>
                {order.note ? (
                  <p className="text-sm text-gray-600">โน้ต: {order.note}</p>
                ) : null}
                {order.status === "PENDING_CONFIRM" ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    รอแอดมินโทรยืนยัน — ไม่ต้องกดยืนยันเพิ่ม
                  </p>
                ) : null}
                {order.status === "CANCELLED" && order.cancelReason ? (
                  <p className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
                    เหตุผลยกเลิก: {order.cancelReason}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-3">
                <div className="mb-1 flex items-baseline justify-between gap-2 px-0.5">
                  <h2 className="text-sm font-semibold text-gray-900">
                    สรุปรายการ
                  </h2>
                  <p className="text-xs text-gray-500">
                    {summary.splitRequested}
                  </p>
                </div>
                {visibleRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                    ไม่พบเมนูในหมวดนี้
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-2 px-0.5 text-xs font-semibold text-gray-700">
                        {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SALE}
                      </p>
                      <ul className="divide-y divide-gray-100">
                        {visibleSaleRows.map((item) => renderHistoryRow(item))}
                      </ul>
                    </div>
                    {visibleSupplyRows.length > 0 ? (
                      <div>
                        <p className="mb-2 px-0.5 text-xs font-semibold text-gray-700">
                          {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SUPPLY}
                        </p>
                        <ul className="divide-y divide-gray-100">
                          {visibleSupplyRows.map((item) =>
                            renderHistoryRow(item),
                          )}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={!!exportBusy}
                  onClick={() => void handleSaveImage()}
                  className="rounded-xl border border-gray-300 bg-white px-2 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                >
                  {exportBusy === "save" ? "กำลังบันทึก…" : "Save รูป"}
                </button>
                <button
                  type="button"
                  disabled={!!exportBusy}
                  onClick={() => void handleShareImage()}
                  className="rounded-xl border border-green-600 bg-green-50 px-2 py-2.5 text-sm font-bold text-green-800 hover:bg-green-100 disabled:opacity-60"
                >
                  {exportBusy === "share" ? "กำลังแชร์…" : "แชร์รูป"}
                </button>
                <button
                  type="button"
                  disabled={!!exportBusy}
                  onClick={() => void handleCopyText()}
                  className="rounded-xl border border-blue-600 bg-blue-50 px-2 py-2.5 text-sm font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60"
                >
                  {exportBusy === "copy" ? "กำลังคัดลอก…" : "Copy"}
                </button>
              </div>
              {exportMsg ? (
                <p className="text-center text-xs text-gray-600">{exportMsg}</p>
              ) : null}
            </div>

            {order.status === "CONFIRMED" ? (
              <Link
                href={`/skewer/${branchId}/order?reorder=${order.id}`}
                className="flex w-full items-center justify-center rounded-xl bg-site-primary px-4 py-3.5 text-base font-bold text-white"
              >
                สั่งซ้ำออเดอร์นี้
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </SkewerAppShell>
  );
}
