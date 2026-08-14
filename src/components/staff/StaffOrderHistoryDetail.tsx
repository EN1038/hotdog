"use client";

import { useEffect, useRef, useState } from "react";
import type {
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  SalesChannel,
} from "@prisma/client";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SALES_CHANNEL_LABELS,
  formatPrice,
} from "@/lib/constants";
import { formatQueueNumber } from "@/lib/order-queue-format";
import {
  absoluteUrlFromPath,
  captureElementToPng,
  downloadPngDataUrl,
  sharePngDataUrl,
  sharePublicLink,
} from "@/lib/share-media";

export type StaffOrderHistoryDetailData = {
  id: string;
  orderNumber: string;
  queueNumber: number;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  salesChannel: SalesChannel | null;
  customerName: string | null;
  createdAt: string;
  note: string | null;
  deliveryFee: number;
  discountAmount: number;
  grandTotal: number;
  items: Array<{
    id: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    optionsPrice: number;
    optionsText: string | null;
    giftQuantity: number;
    note: string | null;
    lineTotal: number;
  }>;
  consumableLines: Array<{
    itemName: string;
    quantity: number;
    unit: string;
  }>;
};

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function StaffOrderHistoryDetail({
  open,
  orderId,
  onClose,
  brandName,
  branchName,
}: {
  open: boolean;
  orderId: string | null;
  onClose: () => void;
  brandName?: string;
  branchName?: string;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<StaffOrderHistoryDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<"save" | "share" | "link" | null>(
    null,
  );
  const [shareHint, setShareHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) {
      setOrder(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/staff/orders/${encodeURIComponent(orderId)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "โหลดออเดอร์ไม่สำเร็จ");
        return body as StaffOrderHistoryDetailData;
      })
      .then((data) => {
        if (!cancelled) setOrder(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setOrder(null);
          setError(e instanceof Error ? e.message : "โหลดออเดอร์ไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  function flash(msg: string) {
    setShareHint(msg);
    window.setTimeout(() => setShareHint(null), 2500);
  }

  async function ensureShareUrl() {
    if (!orderId) throw new Error("ไม่พบออเดอร์");
    const res = await fetch(`/api/staff/orders/${orderId}/share`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "สร้างลิงก์ไม่สำเร็จ");
    return absoluteUrlFromPath(String(body.path ?? ""));
  }

  async function handleSaveImage() {
    if (!order || exportBusy) return;
    const node = captureRef.current;
    if (!node) return;
    setExportBusy("save");
    try {
      const dataUrl = await captureElementToPng(node);
      const r = await downloadPngDataUrl(dataUrl, `order-${order.orderNumber}`);
      flash(r.ok ? "บันทึกรูปแล้ว" : r.error ?? "บันทึกไม่สำเร็จ");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareImage() {
    if (!order || exportBusy) return;
    const node = captureRef.current;
    if (!node) return;
    setExportBusy("share");
    try {
      const dataUrl = await captureElementToPng(node);
      const r = await sharePngDataUrl(
        dataUrl,
        `order-${order.orderNumber}`,
        `ออเดอร์ #${order.orderNumber}`,
      );
      if (r.error === "cancelled") return;
      flash(
        r.mode === "share"
          ? "แชร์รูปแล้ว"
          : r.ok
            ? "บันทึกรูปแทน (เครื่องนี้ยังแชร์รูปไม่ได้)"
            : r.error ?? "แชร์ไม่สำเร็จ",
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "แชร์รูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareLink() {
    if (!order || exportBusy) return;
    setExportBusy("link");
    try {
      const url = await ensureShareUrl();
      const r = await sharePublicLink({
        url,
        title: `ออเดอร์ #${order.orderNumber}`,
        text: `ออเดอร์ #${order.orderNumber} · ฿${formatPrice(order.grandTotal)}`,
      });
      if (r.error === "cancelled") return;
      flash(
        r.mode === "share"
          ? "แชร์ลิงก์แล้ว"
          : r.ok
            ? "คัดลอกลิงก์แล้ว"
            : r.error ?? "แชร์ไม่สำเร็จ",
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "แชร์ลิงก์ไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  if (!open) return null;

  const btn =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-slate-800 disabled:opacity-50";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="รายละเอียดออเดอร์"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-base font-extrabold text-slate-900">
              รายละเอียดออเดอร์
            </p>
            <p className="text-xs text-slate-500">กดแชร์รูปหรือลิงก์ได้</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500"
          >
            ปิด
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">กำลังโหลด…</p>
          ) : error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : order ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={btn}
                  disabled={exportBusy != null}
                  onClick={() => void handleSaveImage()}
                >
                  {exportBusy === "save" ? "…" : "บันทึกรูป"}
                </button>
                <button
                  type="button"
                  className={btn}
                  disabled={exportBusy != null}
                  onClick={() => void handleShareImage()}
                >
                  {exportBusy === "share" ? "…" : "แชร์รูป"}
                </button>
                <button
                  type="button"
                  className={`${btn} border-violet-200 bg-violet-50 text-violet-950`}
                  disabled={exportBusy != null}
                  onClick={() => void handleShareLink()}
                >
                  {exportBusy === "link" ? "…" : "แชร์ลิงก์"}
                </button>
              </div>
              {shareHint ? (
                <p className="text-xs font-medium text-violet-800">{shareHint}</p>
              ) : null}

              <div ref={captureRef} className="space-y-3 rounded-xl bg-white p-1">
                <div className="rounded-xl border border-slate-200 px-3 py-3">
                  {brandName ? (
                    <p className="text-sm font-bold text-slate-900">{brandName}</p>
                  ) : null}
                  {branchName ? (
                    <p className="text-xs font-semibold text-slate-600">
                      สาขา {branchName.replace(/^สาขา\s*/i, "")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-lg font-black text-slate-900">
                    คิว {formatQueueNumber(order.queueNumber)}
                  </p>
                  <p className="text-sm font-bold text-slate-700">
                    #{order.orderNumber}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatWhen(order.createdAt)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    {" · "}
                    {PAYMENT_METHOD_LABELS[order.paymentMethod] ??
                      order.paymentMethod}
                    {" · "}
                    {FULFILLMENT_LABELS[order.fulfillmentType] ??
                      order.fulfillmentType}
                    {order.salesChannel
                      ? ` · ${SALES_CHANNEL_LABELS[order.salesChannel] ?? order.salesChannel}`
                      : ""}
                  </p>
                  {order.customerName ? (
                    <p className="mt-1 text-xs text-slate-600">
                      ลูกค้า {order.customerName}
                    </p>
                  ) : null}
                </div>

                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {order.items.map((it) => (
                    <li key={it.id} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900">
                            {it.itemName}
                            <span className="ml-1 font-semibold text-slate-500">
                              ×{it.quantity}
                            </span>
                            {it.giftQuantity > 0 ? (
                              <span className="ml-1 text-xs font-semibold text-emerald-700">
                                แถม {it.giftQuantity}
                              </span>
                            ) : null}
                          </p>
                          {it.optionsText ? (
                            <p className="mt-0.5 text-xs text-slate-500">
                              {it.optionsText}
                            </p>
                          ) : null}
                          {it.note ? (
                            <p className="mt-0.5 text-xs text-slate-500">
                              โน้ต: {it.note}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-sm font-extrabold tabular-nums text-slate-900">
                          ฿{formatPrice(it.lineTotal)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                {order.consumableLines.length > 0 ? (
                  <p className="text-xs text-slate-500">
                    ของใช้:{" "}
                    {order.consumableLines
                      .map((c) => `${c.itemName} ×${c.quantity}`)
                      .join(" · ")}
                  </p>
                ) : null}

                {order.note ? (
                  <p className="text-xs text-slate-600">หมายเหตุ: {order.note}</p>
                ) : null}

                {order.deliveryFee > 0 || order.discountAmount > 0 ? (
                  <div className="text-xs text-slate-600">
                    {order.deliveryFee > 0 ? (
                      <p>ค่าส่ง ฿{formatPrice(order.deliveryFee)}</p>
                    ) : null}
                    {order.discountAmount > 0 ? (
                      <p>ส่วนลด ฿{formatPrice(order.discountAmount)}</p>
                    ) : null}
                  </div>
                ) : null}

                <p className="text-right text-lg font-black tabular-nums text-slate-900">
                  รวม ฿{formatPrice(order.grandTotal)}
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
