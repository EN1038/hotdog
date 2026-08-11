"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  formatPrice,
} from "@/lib/constants";
import type { PublicOrderReceipt } from "@/lib/order-public-share";
import { parseOrderItemOptionsForDisplay } from "@/lib/order-item-display";
import { formatQueueNumber } from "@/lib/order-queue-format";
import { LoadingState } from "@/components/LoadingState";
import {
  absoluteUrlFromPath,
  captureElementToPng,
  downloadPngDataUrl,
  sharePngDataUrl,
  sharePublicLink,
} from "@/lib/share-media";

const btnTop =
  "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50";

export default function PublicOrderSharePage() {
  const { token } = useParams<{ token: string }>();
  const captureRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<PublicOrderReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [exportBusy, setExportBusy] = useState<
    "save" | "share" | "link" | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/orders/${encodeURIComponent(token)}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "ไม่พบใบรับรองออเดอร์");
      }
      setData(body as PublicOrderReceipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data?.token) {
      setPageUrl(absoluteUrlFromPath(`/share/o/${data.token}`));
    }
  }, [data?.token]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function handleSaveImage() {
    if (!data || exportBusy) return;
    const node = captureRef.current;
    if (!node) return;
    setExportBusy("save");
    try {
      const dataUrl = await captureElementToPng(node);
      const r = await downloadPngDataUrl(
        dataUrl,
        `order-${data.orderNumber}`,
      );
      flash(r.ok ? "บันทึกรูปแล้ว" : r.error ?? "บันทึกไม่สำเร็จ");
    } catch (e) {
      flash(e instanceof Error ? e.message : "บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareImage() {
    if (!data || exportBusy) return;
    const node = captureRef.current;
    if (!node) return;
    setExportBusy("share");
    try {
      const dataUrl = await captureElementToPng(node);
      const r = await sharePngDataUrl(
        dataUrl,
        `order-${data.orderNumber}`,
        `ออเดอร์ #${data.orderNumber} · คิว ${formatQueueNumber(data.queueNumber)}`,
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
    if (!data || exportBusy) return;
    setExportBusy("link");
    try {
      const url = pageUrl || absoluteUrlFromPath(`/share/o/${data.token}`);
      const r = await sharePublicLink({
        url,
        title: `ออเดอร์ #${data.orderNumber} · คิว ${formatQueueNumber(data.queueNumber)}`,
        text: `ตรวจออเดอร์ #${data.orderNumber} ที่ ${data.branch.name}`,
      });
      if (r.error === "cancelled") return;
      flash(
        r.mode === "share"
          ? "แชร์ลิงก์แล้ว"
          : r.mode === "copy"
            ? "คัดลอกลิงก์แล้ว"
            : r.error ?? "แชร์ไม่สำเร็จ",
      );
    } finally {
      setExportBusy(null);
    }
  }

  if (loading) return <LoadingState label="กำลังโหลดใบรับรองออเดอร์" />;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-semibold text-gray-900">
          {error ?? "ไม่พบใบรับรอง"}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          ลิงก์อาจหมดอายุหรือไม่ถูกต้อง — ติดต่อร้านเพื่อขอลิงก์ใหม่
        </p>
      </div>
    );
  }

  const created = new Date(data.createdAt);
  const statusLabel =
    ORDER_STATUS_LABELS[data.status as keyof typeof ORDER_STATUS_LABELS] ??
    data.status;
  const payLabel =
    PAYMENT_METHOD_LABELS[
      data.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS
    ] ?? data.paymentMethod;
  const fulfillLabel =
    FULFILLMENT_LABELS[
      data.fulfillmentType as keyof typeof FULFILLMENT_LABELS
    ] ?? data.fulfillmentType;

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-lg px-4 py-6 pb-16">
        <div className="mb-3 flex items-start justify-between gap-2">
          <header className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              ใบตรวจออเดอร์สาธารณะ
            </p>
            <h1 className="mt-1 text-xl font-bold text-gray-900">
              {data.branch.brandName ?? data.branch.name}
            </h1>
            <p className="text-sm text-gray-600">{data.branch.name}</p>
          </header>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                className={btnTop}
                disabled={exportBusy != null}
                onClick={() => void handleSaveImage()}
              >
                {exportBusy === "save" ? "…" : "บันทึกรูป"}
              </button>
              <button
                type="button"
                className={btnTop}
                disabled={exportBusy != null}
                onClick={() => void handleShareImage()}
              >
                {exportBusy === "share" ? "…" : "แชร์รูป"}
              </button>
              <button
                type="button"
                className={`${btnTop} border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100`}
                disabled={exportBusy != null}
                onClick={() => void handleShareLink()}
              >
                {exportBusy === "link" ? "…" : "แชร์ลิงก์"}
              </button>
            </div>
            {toast ? (
              <p className="max-w-[12rem] text-right text-[10px] font-medium text-violet-800">
                {toast}
              </p>
            ) : null}
          </div>
        </div>

        <div ref={captureRef} className="space-y-3">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  คิว {formatQueueNumber(data.queueNumber)}
                </p>
                <p className="font-semibold text-gray-700">
                  #{data.orderNumber}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {created.toLocaleString("th-TH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                {statusLabel}
              </span>
            </div>

            <dl className="mt-4 grid gap-2 border-t border-gray-100 pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">รับสินค้า</dt>
                <dd className="font-medium text-gray-900">{fulfillLabel}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">ชำระเงิน</dt>
                <dd className="font-medium text-gray-900">{payLabel}</dd>
              </div>
              {data.customerName ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">ลูกค้า</dt>
                  <dd className="font-medium text-gray-900">
                    {data.customerName}
                  </dd>
                </div>
              ) : null}
              {data.customerPhoneMasked ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">โทร.</dt>
                  <dd className="font-medium text-gray-900">
                    {data.customerPhoneMasked}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">
              รายการสินค้า
            </h2>
            <ul className="mt-2 divide-y divide-gray-100">
              {data.items.map((it, idx) => {
                const parsed = parseOrderItemOptionsForDisplay(it);
                return (
                  <li key={`${it.itemName}-${idx}`} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">
                          {it.itemName}
                          <span className="ml-1 text-gray-500">
                            ×{it.quantity}
                          </span>
                        </p>
                        {parsed.isPack && parsed.stickCounts.length > 0 ? (
                          <p className="mt-1 text-xs text-amber-800">
                            ไม้:{" "}
                            {parsed.stickCounts
                              .map((r) =>
                                r.count > 1
                                  ? `${r.name}×${r.count}`
                                  : r.name,
                              )
                              .join(", ")}
                          </p>
                        ) : null}
                        {(parsed.isPack
                          ? parsed.extraNames
                          : parsed.optionNames
                        ).length > 0 ? (
                          <p className="mt-0.5 text-xs text-sky-800">
                            ตัวเลือก:{" "}
                            {(parsed.isPack
                              ? parsed.extraNames
                              : parsed.optionNames
                            ).join(" · ")}
                          </p>
                        ) : null}
                        {it.giftQuantity > 0 ? (
                          <p className="mt-0.5 text-xs font-medium text-emerald-700">
                            แถม {it.giftQuantity} ชิ้น
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 font-semibold text-gray-900">
                        ฿{formatPrice(it.lineTotal)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {data.consumableLines.length > 0 ? (
              <div className="mt-2 border-t border-amber-100 pt-2">
                <p className="text-xs font-semibold text-amber-900">
                  ถุง / แก้ว
                </p>
                <p className="mt-1 text-xs text-amber-950">
                  {data.consumableLines
                    .map(
                      (c) =>
                        `${c.itemName} ×${c.quantity}${c.unit ? ` ${c.unit}` : ""}`,
                    )
                    .join(" · ")}
                </p>
              </div>
            ) : null}

            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>ค่าส่ง</span>
                <span>฿{formatPrice(data.deliveryFee)}</span>
              </div>
              {data.discountAmount > 0 ? (
                <div className="flex justify-between text-gray-600">
                  <span>ส่วนลด</span>
                  <span>-฿{formatPrice(data.discountAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-bold text-gray-900">
                <span>รวมทั้งสิ้น</span>
                <span className="text-red-600">
                  ฿{formatPrice(data.grandTotal)}
                </span>
              </div>
            </div>
          </section>
        </div>

        {data.branch.phone || data.branch.address ? (
          <p className="mt-4 text-center text-xs text-gray-500">
            {data.branch.address ? `${data.branch.address} · ` : ""}
            {data.branch.phone ? `โทร ${data.branch.phone}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
