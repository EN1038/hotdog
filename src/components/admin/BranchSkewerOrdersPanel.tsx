"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SkewerOrderStatus } from "@prisma/client";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { ZoomableImage } from "@/components/ZoomableImage";
import { IconChevronRight, IconSkewerPlaceholder } from "@/components/icons";
import { useAdminMobileLayout } from "@/hooks/useAdminMobileLayout";
import {
  SKEWER_ORDER_STATUS_LABELS,
  SKEWER_ORDER_STATUS_TONE,
  SKEWER_CATEGORY_ROLE_LABELS,
  formatSkewerSplitSummary,
  formatSkewerQtyLabel,
  parseSkewerUnitPriceInput,
  resolveSkewerQtyUnit,
  resolveSticksPerUnit,
  skewerLineSubtotalBaht,
  summarizeSkewerSplit,
} from "@/lib/skewer-order";
import { StatusBadge } from "@/components/StatusBadge";
import { formatPrice } from "@/lib/constants";
import { splitLinesBySkewerRole } from "@/components/skewer/SkewerSplitOrderSections";
import { SkewerOrderShareExtras } from "@/components/skewer/SkewerOrderShareExtras";
import { bangkokDateKey } from "@/lib/constants";
import {
  absoluteUrlFromPath,
  captureElementToPng,
  downloadPngDataUrl,
  sharePngDataUrl,
  sharePublicLink,
} from "@/lib/share-media";

type SkewerItem = {
  id: string;
  itemName: string;
  requestedQuantity: number;
  confirmedQuantity: number | null;
  unitPriceBaht?: number | null;
  menuDefaultUnitPriceBaht?: number | null;
  repeatCustomerUnitPriceBaht?: number | null;
  quantityUnit?: string | null;
  sticksPerUnit?: number | null;
  countsAsSticks?: boolean | null;
  skewerCategoryRole?: string | null;
  imageUrl?: string | null;
};

type SkewerOrderRow = {
  id: string;
  orderNumber: string;
  customerPhone: string;
  customerName: string;
  requestedDate: string;
  addressText: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  status: SkewerOrderStatus;
  adminNote: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  deliveredAt: string | null;
  deliveredOn: string | null;
  deliveryInfo: string | null;
  shippingCostBaht: number | null;
  createdAt: string;
  publicSharePath?: string | null;
  items: SkewerItem[];
};

type Props = { branchId: string };

function itemDefaultUnitPrice(item: SkewerItem) {
  if (item.unitPriceBaht != null && Number.isFinite(item.unitPriceBaht)) {
    return item.unitPriceBaht;
  }
  if (
    item.repeatCustomerUnitPriceBaht != null &&
    Number.isFinite(item.repeatCustomerUnitPriceBaht)
  ) {
    return item.repeatCustomerUnitPriceBaht;
  }
  if (
    item.menuDefaultUnitPriceBaht != null &&
    Number.isFinite(item.menuDefaultUnitPriceBaht)
  ) {
    return item.menuDefaultUnitPriceBaht;
  }
  return 0;
}

function itemUnit(item: SkewerItem) {
  return resolveSkewerQtyUnit({ quantityUnit: item.quantityUnit });
}

function itemSticksPer(item: SkewerItem) {
  return resolveSticksPerUnit({ sticksPerUnit: item.sticksPerUnit });
}

function itemQtyLabel(qty: number, item: SkewerItem) {
  return formatSkewerQtyLabel(qty, {
    quantityUnit: item.quantityUnit,
    sticksPerUnit: item.sticksPerUnit,
    countsAsSticks: item.countsAsSticks,
  });
}

function formatDateLabel(ymd: string) {
  try {
    return new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString("th-TH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

function itemEffectiveQty(order: SkewerOrderRow, item: SkewerItem) {
  if (order.status === "CONFIRMED" || order.status === "DELIVERED") {
    return item.confirmedQuantity ?? 0;
  }
  return item.requestedQuantity;
}

function orderListQuantityLabel(order: SkewerOrderRow): string {
  const split = summarizeSkewerSplit(
    order.items.map((item) => {
      const qty = itemEffectiveQty(order, item);
      return {
        quantity: qty,
        sticksPerUnit: item.sticksPerUnit,
        countsAsSticks: item.countsAsSticks,
        skewerCategoryRole: item.skewerCategoryRole,
        ordered: qty > 0,
      };
    }),
  );
  return formatSkewerSplitSummary(split);
}

function orderListBilling(order: SkewerOrderRow) {
  let itemsSubtotal = 0;
  let hasSavedItemPrice = false;
  for (const item of order.items) {
    const qty = itemEffectiveQty(order, item);
    if (qty <= 0) continue;
    if (item.unitPriceBaht != null && Number.isFinite(item.unitPriceBaht)) {
      hasSavedItemPrice = true;
    }
    itemsSubtotal += skewerLineSubtotalBaht(qty, itemDefaultUnitPrice(item));
  }
  const shipping = order.shippingCostBaht ?? 0;
  const itemsRounded = Math.round(itemsSubtotal * 100) / 100;
  const grandTotal = Math.round((itemsRounded + shipping) * 100) / 100;
  const hasSavedPricing =
    hasSavedItemPrice ||
    (order.shippingCostBaht != null && Number.isFinite(order.shippingCostBaht));
  return {
    grandTotal,
    hasSavedPricing,
    hasPriceHint: grandTotal > 0,
    shipping,
  };
}

export function BranchSkewerOrdersPanel({ branchId }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const { isMobileLayout } = useAdminMobileLayout();
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING_CONFIRM");
  const [dateFilter, setDateFilter] = useState("");
  const [orders, setOrders] = useState<SkewerOrderRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [unitPriceDraft, setUnitPriceDraft] = useState<Record<string, string>>({});
  const [adminNote, setAdminNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [deliveryInfo, setDeliveryInfo] = useState("");
  const [deliveredOn, setDeliveredOn] = useState(() => bangkokDateKey());
  const [shippingCostBaht, setShippingCostBaht] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportBusy, setExportBusy] = useState<
    "save" | "share" | "link" | "view" | null
  >(null);
  const [exportMsg, setExportMsg] = useState("");
  const [publicShareUrl, setPublicShareUrl] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (opts?: { status?: string; date?: string; keepSelectedId?: string }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        const status = opts?.status ?? statusFilter;
        const date = opts?.date ?? dateFilter;
        if (status && status !== "ALL") {
          params.set("status", status);
        }
        if (date) params.set("date", date);
        const res = await fetch(
          `/api/admin/branches/${branchId}/skewer-orders?${params}`,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("โหลดออเดอร์ไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
          return;
        }
        const nextOrders = Array.isArray(data.orders)
          ? (data.orders as SkewerOrderRow[])
          : [];
        setOrders(nextOrders);
        setPendingCount(Number(data.pendingCount) || 0);
        const keepId = opts?.keepSelectedId;
        if (keepId && nextOrders.some((o) => o.id === keepId)) {
          setSelectedId(keepId);
        }
      } finally {
        setLoading(false);
      }
    },
    [branchId, statusFilter, dateFilter, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId],
  );
  const showMobileDetail = isMobileLayout && selected != null;

  async function handleSaveImage() {
    if (!selected || exportBusy) return;
    const node = captureRef.current;
    if (!node) return;
    setExportBusy("save");
    setExportMsg("");
    try {
      const dataUrl = await captureElementToPng(node);
      const result = await downloadPngDataUrl(
        dataUrl,
        `ออเดอร์ไม้_${selected.orderNumber}_${bangkokDateKey()}.png`,
      );
      setExportMsg(result.ok ? "บันทึกรูปแล้ว" : "บันทึกรูปไม่สำเร็จ");
      if (result.ok) toast.success("บันทึกรูปแล้ว");
      else toast.error("บันทึกรูปไม่สำเร็จ");
    } catch {
      setExportMsg("บันทึกรูปไม่สำเร็จ");
      toast.error("บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function ensurePublicShareUrl(): Promise<string> {
    if (publicShareUrl) return publicShareUrl;
    if (!selected) throw new Error("ไม่พบออเดอร์");
    const res = await fetch(
      `/api/admin/branches/${branchId}/skewer-orders/${selected.id}/share`,
      { method: "POST" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error ?? "สร้างลิงก์สาธารณะไม่สำเร็จ");
    }
    const url = absoluteUrlFromPath(String(body.path ?? ""));
    setPublicShareUrl(url);
    return url;
  }

  async function handleSharePublicLink() {
    if (!selected || exportBusy) return;
    setExportBusy("link");
    setExportMsg("");
    try {
      const url = await ensurePublicShareUrl();
      const r = await sharePublicLink({
        url,
        title: `ออเดอร์เสียบไม้ #${selected.orderNumber}`,
        text: `ดูรายการออเดอร์ #${selected.orderNumber}`,
      });
      if (r.error === "cancelled") return;
      setExportMsg(
        r.mode === "share"
          ? "แชร์ลิงก์แล้ว"
          : r.mode === "copy"
            ? "คัดลอกลิงก์แล้ว"
            : r.error ?? "แชร์ไม่สำเร็จ",
      );
      if (r.mode === "share" || r.mode === "copy") {
        toast.success(r.mode === "share" ? "แชร์ลิงก์แล้ว" : "คัดลอกลิงก์แล้ว");
      } else if (r.error) {
        toast.error("แชร์ลิงก์ไม่สำเร็จ", r.error);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "สร้างลิงก์ไม่สำเร็จ";
      setExportMsg(msg);
      toast.error("แชร์ลิงก์ไม่สำเร็จ", msg);
    } finally {
      setExportBusy(null);
    }
  }

  async function handleOpenPublicView() {
    if (!selected || exportBusy) return;
    setExportBusy("view");
    setExportMsg("");
    try {
      const url = await ensurePublicShareUrl();
      window.open(url, "_blank", "noopener,noreferrer");
      setExportMsg("เปิดหน้าสาธารณะแล้ว");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "เปิดหน้าสาธารณะไม่สำเร็จ";
      setExportMsg(msg);
      toast.error("เปิดหน้าสาธารณะไม่สำเร็จ", msg);
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareImage() {
    if (!selected || exportBusy) return;
    const node = captureRef.current;
    if (!node) return;
    setExportBusy("share");
    setExportMsg("");
    try {
      const dataUrl = await captureElementToPng(node);
      const filename = `ออเดอร์ไม้_${selected.orderNumber}_${bangkokDateKey()}.png`;
      const title = `ออเดอร์เสียบไม้ #${selected.orderNumber}`;
      const result = await sharePngDataUrl(dataUrl, filename, title);
      if (result.error === "cancelled") {
        setExportMsg("");
        return;
      }
      if (result.mode === "share") {
        setExportMsg("แชร์รูปแล้ว");
        toast.success("แชร์รูปแล้ว");
      } else if (result.ok) {
        setExportMsg("บันทึกรูปแล้ว — แชร์จากแกลเลอรีได้");
        toast.success("บันทึกรูปแล้ว", "เครื่องนี้แชร์ตรงไม่ได้ — บันทึกไว้ให้แล้ว");
      } else {
        setExportMsg(result.error || "แชร์รูปไม่สำเร็จ");
        toast.error("แชร์รูปไม่สำเร็จ", result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "แชร์รูปไม่สำเร็จ";
      setExportMsg(msg);
      toast.error("แชร์รูปไม่สำเร็จ", msg);
    } finally {
      setExportBusy(null);
    }
  }

  useEffect(() => {
    if (!selected) {
      setQtyDraft({});
      setUnitPriceDraft({});
      setAdminNote("");
      setCancelReason("");
      setDeliveryInfo("");
      setDeliveredOn(bangkokDateKey());
      setShippingCostBaht("");
      setExportMsg("");
      setPublicShareUrl(null);
      return;
    }
    if (selected.publicSharePath) {
      setPublicShareUrl(absoluteUrlFromPath(selected.publicSharePath));
    } else {
      setPublicShareUrl(null);
    }
    const next: Record<string, string> = {};
    const nextPrices: Record<string, string> = {};
    for (const item of selected.items) {
      next[item.id] = String(
        item.confirmedQuantity ?? item.requestedQuantity,
      );
      const saved = item.unitPriceBaht;
      const fallback = itemDefaultUnitPrice({
        ...item,
        unitPriceBaht: null,
      });
      nextPrices[item.id] =
        saved != null && Number.isFinite(saved)
          ? String(saved)
          : fallback > 0
            ? String(fallback)
            : "";
    }
    setQtyDraft(next);
    setUnitPriceDraft(nextPrices);
    setAdminNote(selected.adminNote ?? "");
    setCancelReason("");
    setDeliveryInfo(selected.deliveryInfo ?? "");
    setDeliveredOn(selected.deliveredOn ?? bangkokDateKey());
    setShippingCostBaht(
      selected.shippingCostBaht != null
        ? String(selected.shippingCostBaht)
        : "",
    );
  }, [selected]);

  async function cancelOrder(opts?: { requireReason?: boolean }) {
    if (!selected) return;
    if (selected.status === "DELIVERED") return;
    if (
      selected.status !== "PENDING_CONFIRM" &&
      selected.status !== "CONFIRMED"
    ) {
      return;
    }
    const requireReason =
      opts?.requireReason ?? selected.status === "CONFIRMED";
    if (requireReason && !cancelReason.trim()) {
      toast.error("กรุณาระบุเหตุผล", "ใส่เหตุผลการยกเลิกก่อนยืนยัน");
      return;
    }

    const ok = await confirm({
      title: "ยกเลิกออเดอร์นี้?",
      message: `#${selected.orderNumber} · ${selected.customerPhone} — ระบบจะส่ง SMS แจ้งลูกค้าด้วย (ดูผลส่งได้ที่ ประวัติ SMS)`,
      confirmLabel: "ยกเลิกออเดอร์",
      tone: "danger",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/skewer-orders`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancel",
            orderId: selected.id,
            cancelReason: cancelReason.trim() || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ยกเลิกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("ยกเลิกออเดอร์แล้ว");
      setSelectedId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deliverOrder() {
    if (!selected || selected.status !== "CONFIRMED") return;
    for (const item of selected.items) {
      const unitPrice = parseSkewerUnitPriceInput(unitPriceDraft[item.id] ?? "");
      if (unitPrice == null) {
        toast.error("ราคาไม่ถูกต้อง", `กรอกราคาต่อหน่วยสำหรับ ${item.itemName}`);
        return;
      }
    }
    const shippingRaw = shippingCostBaht.trim();
    let shippingCost: number | null = null;
    if (shippingRaw) {
      const n = parseSkewerUnitPriceInput(shippingRaw);
      if (n == null) {
        toast.error("ราคาส่งไม่ถูกต้อง", "กรอกตัวเลข 0 หรือมากกว่า");
        return;
      }
      shippingCost = n;
    }

    if (!deliveredOn.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(deliveredOn.trim())) {
      toast.error("กรุณาเลือกวันที่ส่งสำเร็จ");
      return;
    }

    const ok = await confirm({
      title: "บันทึกส่งสำเร็จ?",
      message: `#${selected.orderNumber} · ${selected.customerPhone} · วันที่ ${formatDateLabel(deliveredOn.trim())}`,
      confirmLabel: "บันทึกส่งสำเร็จ",
      tone: "primary",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/skewer-orders`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deliver",
            orderId: selected.id,
            deliveredOn: deliveredOn.trim(),
            deliveryInfo: deliveryInfo.trim() || undefined,
            shippingCostBaht: shippingCost,
            items: selected.items.map((item) => ({
              id: item.id,
              unitPriceBaht: parseSkewerUnitPriceInput(
                unitPriceDraft[item.id] ?? "",
              )!,
            })),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("บันทึกส่งสำเร็จแล้ว");
      const deliveredId = selected.id;
      setStatusFilter("DELIVERED");
      await load({ status: "DELIVERED", keepSelectedId: deliveredId });
    } finally {
      setSaving(false);
    }
  }

  async function confirmOrder() {
    if (!selected || selected.status !== "PENDING_CONFIRM") return;
    const items = selected.items.map((item) => {
      const n = Number.parseInt(qtyDraft[item.id] ?? "", 10);
      return { id: item.id, confirmedQuantity: n };
    });
    for (const item of selected.items) {
      const n = Number.parseInt(qtyDraft[item.id] ?? "", 10);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("จำนวนไม่ถูกต้อง", `กรอกจำนวนสำหรับ ${item.itemName}`);
        return;
      }
      if (n > item.requestedQuantity) {
        toast.error(
          "จำนวนเกินที่สั่ง",
          `${item.itemName} สั่ง ${item.requestedQuantity} ${itemUnit(item)}`,
        );
        return;
      }
    }

    const ok = await confirm({
      title: "ยืนยันออเดอร์นี้?",
      message: `ลูกค้า ${selected.customerPhone} · วันที่ต้องการ ${formatDateLabel(selected.requestedDate)} — หลังยืนยันระบบจะส่ง SMS แจ้งลูกค้า และลูกค้าจะเห็นจำนวนที่ได้ในประวัติ (ดูผลส่งได้ที่ ประวัติ SMS)`,
      confirmLabel: "ยืนยัน",
      tone: "primary",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/skewer-orders`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "confirm",
            orderId: selected.id,
            items,
            adminNote: adminNote.trim() || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ยืนยันไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("ยืนยันออเดอร์แล้ว — ดู/แชร์รายการได้ด้านขวา");
      const confirmedId = selected.id;
      setStatusFilter("CONFIRMED");
      await load({ status: "CONFIRMED", keepSelectedId: confirmedId });
    } finally {
      setSaving(false);
    }
  }

  async function savePricing() {
    if (!selected || selected.status !== "CONFIRMED") return;
    const items = selected.items.map((item) => {
      const unitPrice = parseSkewerUnitPriceInput(unitPriceDraft[item.id] ?? "");
      return { id: item.id, unitPrice };
    });
    for (const item of selected.items) {
      const unitPrice = parseSkewerUnitPriceInput(unitPriceDraft[item.id] ?? "");
      if (unitPrice == null) {
        toast.error("ราคาไม่ถูกต้อง", `กรอกราคาต่อหน่วยสำหรับ ${item.itemName}`);
        return;
      }
    }

    const shippingRaw = shippingCostBaht.trim();
    let shippingCost: number | null = null;
    if (shippingRaw) {
      const n = parseSkewerUnitPriceInput(shippingRaw);
      if (n == null) {
        toast.error("ราคาส่งไม่ถูกต้อง", "กรอกตัวเลข 0 หรือมากกว่า");
        return;
      }
      shippingCost = n;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/skewer-orders`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "updatePricing",
            orderId: selected.id,
            items: items.map((row) => ({
              id: row.id,
              unitPriceBaht: row.unitPrice!,
            })),
            shippingCostBaht: shippingCost,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกราคาไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("บันทึกราคาแล้ว");
      await load({ keepSelectedId: selected.id });
    } finally {
      setSaving(false);
    }
  }

  const billingSummary = useMemo(() => {
    if (
      !selected ||
      (selected.status !== "CONFIRMED" && selected.status !== "DELIVERED")
    ) {
      return null;
    }
    let itemsSubtotal = 0;
    for (const item of selected.items) {
      const qty = itemEffectiveQty(selected, item);
      const raw = unitPriceDraft[item.id] ?? "";
      const parsed = parseSkewerUnitPriceInput(raw);
      const unitPrice =
        parsed ?? itemDefaultUnitPrice(item);
      itemsSubtotal += skewerLineSubtotalBaht(qty, unitPrice);
    }
    const shippingRaw = shippingCostBaht.trim();
    const shipping = shippingRaw
      ? parseSkewerUnitPriceInput(shippingRaw) ?? 0
      : selected.shippingCostBaht ?? 0;
    const itemsRounded = Math.round(itemsSubtotal * 100) / 100;
    return {
      itemsSubtotal: itemsRounded,
      shipping,
      grandTotal: Math.round((itemsRounded + shipping) * 100) / 100,
    };
  }, [selected, unitPriceDraft, shippingCostBaht]);

  async function cancelPendingOrder() {
    await cancelOrder({ requireReason: false });
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-amber-50 via-white to-amber-50 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">ออเดอร์เสียบไม้</h3>
              <p className="mt-0.5 text-sm text-gray-600">
                ดูเบอร์ลูกค้า วันที่ต้องการ ยืนยันจำนวน — หลังยืนยันแล้วเลือกสถานะ「ยืนยันแล้ว」เพื่อดู/แชร์รายการ
              </p>
            </div>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
                รอ {pendingCount} รายการ
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <div>
              <label className={adminLabelClass}>สถานะ</label>
              <select
                className={adminInputClass}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setSelectedId(null);
                }}
              >
                <option value="PENDING_CONFIRM">รอยืนยัน</option>
                <option value="CONFIRMED">ยืนยันแล้ว</option>
                <option value="DELIVERED">ส่งสำเร็จแล้ว</option>
                <option value="CANCELLED">ยกเลิก</option>
                <option value="ALL">ทั้งหมด</option>
              </select>
            </div>
            <div>
              <label className={adminLabelClass}>วันที่ต้องการ</label>
              <DateInput
                className={adminInputClass}
                value={dateFilter}
                onChange={setDateFilter}
                placeholder={bangkokDateKey()}
              />
            </div>
            {dateFilter && (
              <button
                type="button"
                className="self-end text-sm text-gray-600 underline"
                onClick={() => setDateFilter("")}
              >
                ล้างวันที่
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-5">
          <div
            className={`lg:col-span-2 border-b border-gray-100 lg:border-b-0 lg:border-r ${
              showMobileDetail ? "hidden lg:block" : ""
            }`}
          >
            {loading ? (
              <p className="p-5 text-sm text-gray-500">กำลังโหลด…</p>
            ) : orders.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">ยังไม่มีออเดอร์ตามตัวกรอง</p>
            ) : (
              <>
                {isMobileLayout ? (
                  <p className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600">
                    แตะรายการเพื่อดูรายละเอียดและแชร์
                  </p>
                ) : null}
              <ul className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto lg:max-h-[70vh]">
                {orders.map((order) => {
                  const active = order.id === selectedId;
                  const qtyLabel = orderListQuantityLabel(order);
                  const billing = orderListBilling(order);
                  return (
                    <li key={order.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(order.id)}
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left transition ${
                          active ? "bg-amber-50" : "hover:bg-gray-50 active:bg-amber-50"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-gray-900">
                            {order.customerPhone || "—"}
                          </p>
                          <StatusBadge
                              label={SKEWER_ORDER_STATUS_LABELS[order.status]}
                              tone={SKEWER_ORDER_STATUS_TONE[order.status]}
                              size="sm"
                            />
                        </div>
                        <p className="mt-0.5 text-sm text-gray-600">
                          ต้องการ {formatDateLabel(order.requestedDate)}
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-gray-800">
                          รวม {qtyLabel}
                        </p>
                        {billing.hasPriceHint ? (
                          <p className="mt-0.5 text-xs text-gray-700">
                            {billing.hasSavedPricing ? "ราคา" : "ราคาประมาณ"}{" "}
                            {formatPrice(billing.grandTotal)} บาท
                            {billing.shipping > 0 ? " (รวมค่าส่ง)" : ""}
                          </p>
                        ) : order.status === "CONFIRMED" ||
                          order.status === "DELIVERED" ? (
                          <p className="mt-0.5 text-xs text-gray-500">
                            ยังไม่ระบุราคา
                          </p>
                        ) : null}
                        {order.status === "DELIVERED" && order.deliveredOn ? (
                          <p className="mt-0.5 text-xs text-sky-700">
                            ส่งแล้ว {formatDateLabel(order.deliveredOn)}
                          </p>
                        ) : null}
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          #{order.orderNumber}
                          {order.customerName ? ` · ${order.customerName}` : ""}
                        </p>
                        </div>
                        <IconChevronRight
                          size={18}
                          className={`shrink-0 text-gray-400 lg:hidden ${active ? "text-amber-700" : ""}`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </div>

          <div
            className={`lg:col-span-3 p-5 ${
              isMobileLayout && !selected ? "hidden lg:block" : ""
            }`}
          >
            {!selected ? (
              <p className="text-sm text-gray-500">เลือกออเดอร์ทางซ้ายเพื่อดูรายละเอียด</p>
            ) : (
              <div className="space-y-5">
                {isMobileLayout ? (
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-gray-900"
                  >
                    <span aria-hidden>←</span> กลับรายการ
                  </button>
                ) : null}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!!exportBusy}
                      onClick={() => void handleOpenPublicView()}
                      className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
                    >
                      {exportBusy === "view" ? "กำลังเปิด…" : "ดูหน้าสาธารณะ"}
                    </button>
                    <button
                      type="button"
                      disabled={!!exportBusy}
                      onClick={() => void handleSharePublicLink()}
                      className="rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
                    >
                      {exportBusy === "link" ? "…" : "แชร์ลิงก์"}
                    </button>
                    <button
                      type="button"
                      disabled={!!exportBusy}
                      onClick={() => void handleSaveImage()}
                      className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    >
                      {exportBusy === "save" ? "กำลังบันทึก…" : "บันทึกรูป"}
                    </button>
                    <button
                      type="button"
                      disabled={!!exportBusy}
                      onClick={() => void handleShareImage()}
                      className="rounded-xl border border-green-600 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 hover:bg-green-100 disabled:opacity-60"
                    >
                      {exportBusy === "share" ? "กำลังแชร์…" : "แชร์รูป"}
                    </button>
                  </div>
                  {publicShareUrl ? (
                    <p className="break-all text-xs text-gray-500">
                      ลิงก์สาธารณะ:{" "}
                      <a
                        href={publicShareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-violet-700 underline"
                      >
                        {publicShareUrl}
                      </a>
                    </p>
                  ) : null}
                  {exportMsg ? (
                    <p className="text-xs text-gray-600">{exportMsg}</p>
                  ) : null}
                </div>

                <div ref={captureRef} className="space-y-5 bg-white">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={SKEWER_ORDER_STATUS_LABELS[selected.status]}
                      tone={SKEWER_ORDER_STATUS_TONE[selected.status]}
                      size="sm"
                    />
                    {selected.confirmedAt ? (
                      <span className="text-xs text-gray-500">
                        ยืนยันเมื่อ{" "}
                        {new Date(selected.confirmedAt).toLocaleString("th-TH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    ) : null}
                    {selected.deliveredOn ? (
                      <span className="text-xs text-gray-500">
                        ส่งสำเร็จวันที่{" "}
                        {formatDateLabel(selected.deliveredOn)}
                      </span>
                    ) : selected.deliveredAt ? (
                      <span className="text-xs text-gray-500">
                        บันทึกส่งเมื่อ{" "}
                        {new Date(selected.deliveredAt).toLocaleString("th-TH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                    #{selected.orderNumber}
                  </p>
                  <h4 className="mt-1 text-lg font-semibold text-gray-900">
                    {selected.customerPhone}
                    {selected.customerName ? (
                      <span className="ml-2 text-base font-normal text-gray-600">
                        {selected.customerName}
                      </span>
                    ) : null}
                  </h4>
                  <p className="mt-1 text-sm text-gray-700">
                    วันที่ต้องการ:{" "}
                    <strong>{formatDateLabel(selected.requestedDate)}</strong>
                  </p>
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                    ที่อยู่: {selected.addressText}
                  </p>
                  {selected.latitude != null && selected.longitude != null && (
                    <a
                      className="mt-1 inline-block text-sm text-sky-700 underline"
                      href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      เปิดแผนที่
                    </a>
                  )}
                  {selected.note && (
                    <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      โน้ตลูกค้า: {selected.note}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  {(() => {
                    const split = summarizeSkewerSplit(
                      selected.items.map((i) => ({
                        quantity: itemEffectiveQty(selected, i),
                        sticksPerUnit: i.sticksPerUnit,
                        countsAsSticks: i.countsAsSticks,
                        skewerCategoryRole: i.skewerCategoryRole,
                        ordered: itemEffectiveQty(selected, i) > 0,
                      })),
                    );
                    const { saleLines, supplyLines } = splitLinesBySkewerRole(
                      selected.items,
                    );
                    const renderItem = (item: SkewerItem) => {
                      const unit = itemUnit(item);
                      const effectiveQty = itemEffectiveQty(selected, item);
                      return (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2.5"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-site-primary-soft">
                              {item.imageUrl ? (
                                <ZoomableImage
                                  src={item.imageUrl}
                                  alt={item.itemName}
                                  className="h-14 w-14 object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-gray-400">
                                  <IconSkewerPlaceholder size={28} />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900">
                                {item.itemName}
                              </p>
                              <p className="text-xs text-gray-500">
                                สั่ง {itemQtyLabel(item.requestedQuantity, item)}
                                {item.confirmedQuantity != null
                                  ? ` · ได้ ${itemQtyLabel(item.confirmedQuantity, item)}`
                                  : ""}
                              </p>
                            </div>
                          </div>
                          {selected.status === "PENDING_CONFIRM" ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={item.requestedQuantity}
                                className={`${adminInputClass} w-24`}
                                value={qtyDraft[item.id] ?? ""}
                                onChange={(e) =>
                                  setQtyDraft((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                              />
                              <span className="text-sm text-gray-500">
                                {unit}
                                {item.countsAsSticks !== false &&
                                itemSticksPer(item) > 1 ? (
                                  <span className="block text-[10px] text-gray-400">
                                    1{unit}={itemSticksPer(item)}ไม้
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          ) : selected.status === "CONFIRMED" ||
                            selected.status === "DELIVERED" ? (
                            <div className="flex flex-wrap items-end justify-end gap-3">
                              <div className="text-right">
                                <p className="text-lg font-bold tabular-nums text-emerald-800">
                                  {effectiveQty.toLocaleString("th-TH")}
                                </p>
                                <p className="text-xs text-gray-500">{unit}</p>
                                <p className="text-[10px] font-medium text-emerald-700">
                                  ได้จริง
                                </p>
                              </div>
                              <div className="text-right">
                                <label className="block text-[10px] font-semibold text-gray-500">
                                  ราคา/หน่วย (฿)
                                </label>
                                {selected.status === "CONFIRMED" ? (
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    className={`${adminInputClass} mt-0.5 w-24 text-right`}
                                    value={unitPriceDraft[item.id] ?? ""}
                                    onChange={(e) =>
                                      setUnitPriceDraft((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                  />
                                ) : (
                                  <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">
                                    {formatPrice(itemDefaultUnitPrice(item))}
                                  </p>
                                )}
                              </div>
                              <div className="min-w-[5.5rem] text-right">
                                <p className="text-[10px] font-semibold text-gray-500">
                                  รวม (฿)
                                </p>
                                <p className="text-base font-bold tabular-nums text-gray-900">
                                  {formatPrice(
                                    skewerLineSubtotalBaht(
                                      effectiveQty,
                                      parseSkewerUnitPriceInput(
                                        unitPriceDraft[item.id] ?? "",
                                      ) ?? itemDefaultUnitPrice(item),
                                    ),
                                  )}
                                </p>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    };
                    return (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900">
                            รายการ
                            {selected.status === "CONFIRMED" ||
                            selected.status === "DELIVERED" ? (
                              <span className="ml-2 text-xs font-normal text-emerald-700">
                                (จำนวนที่ยืนยันแล้ว)
                              </span>
                            ) : null}
                          </p>
                          {selected.items.length > 0 ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-right shadow-sm">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/70">
                                รวมออเดอร์
                              </p>
                              <p className="text-base font-black tabular-nums leading-tight text-amber-950 sm:text-lg">
                                {formatSkewerSplitSummary({
                                  sale: split.sale,
                                  supplyItemCount: split.supplyItemCount,
                                })}
                              </p>
                            </div>
                          ) : null}
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-semibold text-gray-700">
                            {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SALE}
                          </p>
                          <div className="space-y-2">
                            {saleLines.map(renderItem)}
                          </div>
                        </div>
                        {supplyLines.length > 0 ? (
                          <div>
                            <p className="mb-2 text-xs font-semibold text-gray-700">
                              {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SUPPLY}
                            </p>
                            <div className="space-y-2">
                              {supplyLines.map(renderItem)}
                            </div>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </div>

                {(selected.status === "CONFIRMED" ||
                  selected.status === "DELIVERED") && (
                  <SkewerOrderShareExtras
                    itemsSubtotalBaht={billingSummary?.itemsSubtotal ?? null}
                    shippingCostBaht={billingSummary?.shipping ?? null}
                    grandTotalBaht={billingSummary?.grandTotal ?? null}
                    deliveredOn={
                      selected.status === "DELIVERED"
                        ? selected.deliveredOn
                        : deliveredOn
                    }
                    deliveryInfo={
                      selected.status === "DELIVERED"
                        ? selected.deliveryInfo
                        : deliveryInfo
                    }
                    adminNote={selected.adminNote}
                    showBilling={
                      selected.items.some(
                        (item) =>
                          item.unitPriceBaht != null ||
                          (unitPriceDraft[item.id]?.trim() ?? "").length > 0,
                      ) ||
                      Boolean(
                        shippingCostBaht.trim() ||
                          selected.shippingCostBaht != null,
                      )
                    }
                  />
                )}
                </div>

                {selected.status === "PENDING_CONFIRM" && (
                  <>
                    <div>
                      <label className={adminLabelClass}>โน้ตแอดมิน (ถ้ามี)</label>
                      <textarea
                        className={adminInputClass}
                        rows={2}
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="สรุปหลังโทรคุย เช่น สถานที่ ราคา"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={confirmOrder}
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        ยืนยันจำนวนที่ได้
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void cancelPendingOrder()}
                        className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        ยกเลิกออเดอร์
                      </button>
                    </div>
                  </>
                )}

                {selected.status === "CONFIRMED" && selected.adminNote && (
                  <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    โน้ตแอดมิน: {selected.adminNote}
                  </p>
                )}

                {selected.status === "CONFIRMED" && billingSummary ? (
                  <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900">
                        สรุปยอดเก็บเงิน
                      </h5>
                      <p className="mt-0.5 text-xs text-gray-600">
                        ระบุราคาต่อหน่วยแล้วกดบันทึก — รวมค่าส่งด้วยถ้ามี
                      </p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-700">รวมสินค้า</span>
                        <span className="font-semibold tabular-nums text-gray-900">
                          {formatPrice(billingSummary.itemsSubtotal)} บาท
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-gray-700" htmlFor="skewer-shipping-cost">
                          ค่าส่ง (บาท)
                        </label>
                        <input
                          id="skewer-shipping-cost"
                          type="number"
                          min={0}
                          step="0.01"
                          className={`${adminInputClass} w-32 text-right`}
                          value={shippingCostBaht}
                          onChange={(e) => setShippingCostBaht(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-violet-200/80 pt-2">
                        <span className="font-semibold text-gray-900">
                          รวมทั้งสิ้น
                        </span>
                        <span className="text-lg font-black tabular-nums text-violet-950">
                          {formatPrice(billingSummary.grandTotal)} บาท
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void savePricing()}
                      className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                    >
                      บันทึกราคา
                    </button>
                  </div>
                ) : null}

                {selected.status === "DELIVERED" && billingSummary ? (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-gray-800">
                    <p className="font-semibold text-violet-950">สรุปยอด</p>
                    <div className="mt-2 space-y-1">
                      <p className="flex justify-between gap-3">
                        <span>รวมสินค้า</span>
                        <span className="font-semibold tabular-nums">
                          {formatPrice(billingSummary.itemsSubtotal)} บาท
                        </span>
                      </p>
                      {billingSummary.shipping > 0 ? (
                        <p className="flex justify-between gap-3">
                          <span>ค่าส่ง</span>
                          <span className="font-semibold tabular-nums">
                            {formatPrice(billingSummary.shipping)} บาท
                          </span>
                        </p>
                      ) : null}
                      <p className="flex justify-between gap-3 border-t border-violet-200/80 pt-2 font-semibold text-violet-950">
                        <span>รวมทั้งสิ้น</span>
                        <span className="text-base font-black tabular-nums">
                          {formatPrice(billingSummary.grandTotal)} บาท
                        </span>
                      </p>
                    </div>
                  </div>
                ) : null}

                {selected.status === "CONFIRMED" && (
                  <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900">
                        บันทึกการส่ง
                      </h5>
                      <p className="mt-0.5 text-xs text-gray-600">
                        เมื่อส่งของแล้ว กรอกข้อมูลการส่ง (ค่าส่งตั้งในสรุปยอดด้านบน)
                      </p>
                    </div>
                    <div>
                      <label className={adminLabelClass}>วันที่ส่งสำเร็จ</label>
                      <DateInput
                        className={adminInputClass}
                        value={deliveredOn}
                        onChange={setDeliveredOn}
                        placeholder={bangkokDateKey()}
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>
                        ข้อมูลการส่ง (เลขพัสดุ / ช่องทาง ฯลฯ)
                      </label>
                      <textarea
                        className={adminInputClass}
                        rows={3}
                        value={deliveryInfo}
                        onChange={(e) => setDeliveryInfo(e.target.value)}
                        placeholder="เช่น Kerry · TRK1234567890 · ส่งวันที่ 29 ส.ค."
                      />
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void deliverOrder()}
                      className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                    >
                      บันทึกส่งสำเร็จแล้ว
                    </button>
                  </div>
                )}

                {selected.status === "CONFIRMED" && (
                  <div className="space-y-3 rounded-2xl border border-red-100 bg-red-50/40 p-4">
                    <div>
                      <label className={adminLabelClass}>เหตุผลการยกเลิก</label>
                      <textarea
                        className={adminInputClass}
                        rows={2}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="ระบุเหตุผล เช่น ลูกค้าเปลี่ยนใจ / ของไม่พอ"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void cancelOrder()}
                      className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      ยกเลิกออเดอร์ (หลังยืนยัน)
                    </button>
                  </div>
                )}

                {selected.status === "DELIVERED" && (
                  <div className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-gray-800">
                    {selected.deliveredOn ? (
                      <p>
                        <span className="font-semibold text-sky-900">
                          วันที่ส่งสำเร็จ:{" "}
                        </span>
                        {formatDateLabel(selected.deliveredOn)}
                      </p>
                    ) : null}
                    {selected.deliveryInfo ? (
                      <p className="whitespace-pre-wrap">
                        <span className="font-semibold text-sky-900">
                          ข้อมูลการส่ง:{" "}
                        </span>
                        {selected.deliveryInfo}
                      </p>
                    ) : (
                      <p className="text-gray-500">ไม่ได้ระบุข้อมูลการส่ง</p>
                    )}
                    {selected.shippingCostBaht != null ? (
                      <p>
                        <span className="font-semibold text-sky-900">
                          ราคาส่ง:{" "}
                        </span>
                        {selected.shippingCostBaht.toLocaleString("th-TH", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}{" "}
                        บาท
                      </p>
                    ) : null}
                    {selected.adminNote ? (
                      <p className="text-emerald-900">
                        โน้ตแอดมิน: {selected.adminNote}
                      </p>
                    ) : null}
                  </div>
                )}

                {selected.status === "CANCELLED" && selected.cancelReason && (
                  <p className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
                    เหตุผลยกเลิก: {selected.cancelReason}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
