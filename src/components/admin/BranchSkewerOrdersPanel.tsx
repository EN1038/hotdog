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
  SKEWER_CATEGORY_ROLE_LABELS,
  formatSkewerSplitSummary,
  formatSkewerQtyLabel,
  resolveSkewerQtyUnit,
  resolveSticksPerUnit,
  summarizeSkewerSplit,
} from "@/lib/skewer-order";
import { splitLinesBySkewerRole } from "@/components/skewer/SkewerSplitOrderSections";
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
  createdAt: string;
  publicSharePath?: string | null;
  items: SkewerItem[];
};

type Props = { branchId: string };

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

function statusTone(status: SkewerOrderStatus) {
  if (status === "PENDING_CONFIRM") return "bg-amber-50 text-amber-900 border-amber-200";
  if (status === "CONFIRMED") return "bg-emerald-50 text-emerald-900 border-emerald-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
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
  if (order.status === "CONFIRMED") {
    return item.confirmedQuantity ?? 0;
  }
  return item.requestedQuantity;
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
  const [adminNote, setAdminNote] = useState("");
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
      setAdminNote("");
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
    for (const item of selected.items) {
      next[item.id] = String(
        item.confirmedQuantity ?? item.requestedQuantity,
      );
    }
    setQtyDraft(next);
    setAdminNote(selected.adminNote ?? "");
  }, [selected]);

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

  async function cancelOrder() {
    if (!selected || selected.status !== "PENDING_CONFIRM") return;
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
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(order.status)}`}
                          >
                            {SKEWER_ORDER_STATUS_LABELS[order.status]}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-gray-600">
                          ต้องการ {formatDateLabel(order.requestedDate)}
                        </p>
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
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusTone(selected.status)}`}
                    >
                      {SKEWER_ORDER_STATUS_LABELS[selected.status]}
                    </span>
                    {selected.confirmedAt ? (
                      <span className="text-xs text-gray-500">
                        ยืนยันเมื่อ{" "}
                        {new Date(selected.confirmedAt).toLocaleString("th-TH", {
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
                          ) : selected.status === "CONFIRMED" ? (
                            <div className="text-right">
                              <p className="text-lg font-bold tabular-nums text-emerald-800">
                                {effectiveQty.toLocaleString("th-TH")}
                              </p>
                              <p className="text-xs text-gray-500">{unit}</p>
                              <p className="text-[10px] font-medium text-emerald-700">
                                ได้จริง
                              </p>
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
                            {selected.status === "CONFIRMED" ? (
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
                        onClick={cancelOrder}
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
