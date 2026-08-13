"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { OrderStatus, type FulfillmentType, type SalesChannel } from "@prisma/client";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_COLORS,
  SALES_CHANNEL_LABELS,
  canStaffCancel,
  getAllowedNextStatuses,
  getStaffLegendStatuses,
  getStaffStatusLabel,
  type StaffRole,
} from "@/lib/constants";
import { IconArrowRight, IconLabel, IconNote, IconPrinter } from "@/components/icons";
import { CustomerTypeBadge } from "@/components/CustomerTypeBadge";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { distanceKm, formatDistanceKm, hasMapPin } from "@/lib/geo";
import { formatQueueNumber } from "@/lib/order-queue-format";
import {
  countPackStickPieces,
  isPackLikeOptions,
  parseOrderItemOptionsForDisplay,
} from "@/lib/order-item-display";
import { canUsePrintActions, printQueueTickets } from "@/lib/print-bridge";
import {
  absoluteUrlFromPath,
  captureElementToPng,
  downloadPngDataUrl,
  sharePngDataUrl,
  sharePublicLink,
} from "@/lib/share-media";

type OrderItem = {
  id: string;
  quantity: number;
  unitPrice: string | number;
  optionsPrice?: string | number;
  optionsText?: string | null;
  giftQuantity?: number | null;
  note?: string | null;
  itemName: string;
  branchMenuItem?: { name: string } | null;
};

export type OrderCardData = {
  id: string;
  orderNumber?: string;
  queueNumber?: number | null;
  status: OrderStatus;
  fulfillmentType?: FulfillmentType;
  addressDetail: string | null;
  customerName?: string;
  customerPhone?: string;
  isNewCustomer?: boolean;
  note?: string | null;
  cancelReason?: string | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  createdAt: string;
  createdByStaffId?: string | null;
  salesChannel?: SalesChannel | null;
  cupSizeOz?: number | null;
  cupCount?: number | null;
  bagCount?: number | null;
  consumableLines?: Array<{
    id: string;
    itemName: string;
    quantity: number;
    unit?: string | null;
  }> | null;
  photoUrl?: string | null;
  paymentMethod?: string | null;
  awaitingPhotoKey?: boolean;
  promoSummary?: string | null;
  customer?: { phone: string; name?: string | null } | null;
  deliveryLocation: { name: string; isCustomAddress?: boolean } | null;
  items: OrderItem[];
};

type OrderCardProps = {
  order: OrderCardData;
  roles?: StaffRole[];
  onStatusChange?: (orderId: string, status: OrderStatus) => void;
  onRequestCancel?: (orderId: string) => void;
  showActions?: boolean;
  /** รายการเมนูพับได้ — ใช้บนหน้า staff */
  collapsibleItems?: boolean;
  /** ซ่อนปุ่มบันทึก/แชร์ไว้ในแถวรอง — เหมาะมือถือแม่ค้า */
  compactTools?: boolean;
  /** Branch pin — used to show delivery distance */
  branchPin?: { latitude: number; longitude: number } | null;
  highlight?: boolean;
  /** How many queue slips to print (from brand setting) */
  queueTicketCopies?: number;
  /** Operating-day / Bangkok date label for the ticket */
  ticketDateLabel?: string;
};

/** Workflow order — used to pick the main “next step” button on touch UIs. */
const STATUS_FLOW: OrderStatus[] = [
  OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.DELIVERING,
  OrderStatus.COMPLETED,
];

function flowIndex(status: OrderStatus): number {
  const i = STATUS_FLOW.indexOf(status);
  return i === -1 ? 99 : i;
}

function splitPrimaryAction(
  current: OrderStatus,
  allowed: OrderStatus[],
): { primary: OrderStatus | null; secondary: OrderStatus[] } {
  if (allowed.length === 0) return { primary: null, secondary: [] };
  const currentIdx = flowIndex(current);
  const forward = allowed
    .filter((s) => flowIndex(s) > currentIdx)
    .sort((a, b) => flowIndex(a) - flowIndex(b));
  const primary = forward[0] ?? allowed[0] ?? null;
  const secondary = allowed.filter((s) => s !== primary);
  return { primary, secondary };
}

function OrderItemOptionChips({
  optionsText,
  itemName,
  giftQuantity,
  quantity,
}: {
  optionsText?: string | null;
  itemName?: string | null;
  giftQuantity?: number | null;
  quantity?: number;
}) {
  const parsed = parseOrderItemOptionsForDisplay({
    optionsText,
    itemName,
    giftQuantity,
    quantity,
  });
  const labels = parsed.isPack
    ? [...parsed.stickNames, ...parsed.extraNames]
    : parsed.optionNames;
  if (labels.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {labels.map((label, idx) => (
        <li
          key={`${label}-${idx}`}
          className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-900"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

/** ป้ายปุ่มหลักให้แม่ค้าเข้าใจทันที */
function primaryActionLabel(
  current: OrderStatus,
  next: OrderStatus,
  roles: StaffRole[],
): string {
  if (
    current === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE &&
    next === OrderStatus.PREPARING
  ) {
    return "รับออเดอร์";
  }
  return getStaffStatusLabel(next, roles);
}

export function OrderCard({
  order,
  roles = [],
  onStatusChange,
  onRequestCancel,
  showActions = false,
  collapsibleItems = false,
  compactTools = false,
  branchPin = null,
  highlight = false,
  queueTicketCopies = 1,
  ticketDateLabel = "",
}: OrderCardProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [itemsExpanded, setItemsExpanded] = useState(true);
  const [canPrint, setCanPrint] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [exportBusy, setExportBusy] = useState<
    "save" | "share" | "link" | null
  >(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  function flashShare(msg: string) {
    setShareHint(msg);
    window.setTimeout(() => setShareHint(null), 2500);
  }

  async function getStaffPublicShareUrl(): Promise<string> {
    const res = await fetch(`/api/staff/orders/${order.id}/share`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error ?? "สร้างลิงก์ไม่สำเร็จ");
    }
    return absoluteUrlFromPath(String(body.path ?? ""));
  }

  async function captureCardPng(): Promise<string> {
    const node = captureRef.current;
    if (!node) throw new Error("ไม่พบใบออเดอร์");
    const wasExpanded = itemsExpanded;
    if (collapsibleItems && !wasExpanded) {
      setItemsExpanded(true);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    try {
      return await captureElementToPng(node);
    } finally {
      if (collapsibleItems && !wasExpanded) setItemsExpanded(false);
    }
  }

  async function handleSaveImage() {
    if (exportBusy) return;
    setExportBusy("save");
    try {
      const dataUrl = await captureCardPng();
      const r = await downloadPngDataUrl(
        dataUrl,
        `order-${order.orderNumber ?? order.id}`,
      );
      flashShare(r.ok ? "บันทึกรูปแล้ว" : r.error ?? "บันทึกไม่สำเร็จ");
    } catch (e) {
      flashShare(e instanceof Error ? e.message : "บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareImage() {
    if (exportBusy) return;
    setExportBusy("share");
    try {
      const dataUrl = await captureCardPng();
      const r = await sharePngDataUrl(
        dataUrl,
        `order-${order.orderNumber ?? order.id}`,
        `ออเดอร์ #${order.orderNumber ?? order.id.slice(-6)}`,
      );
      if (r.error === "cancelled") return;
      flashShare(
        r.mode === "share"
          ? "แชร์รูปแล้ว"
          : r.ok
            ? "บันทึกรูปแทน"
            : r.error ?? "แชร์ไม่สำเร็จ",
      );
    } catch (e) {
      flashShare(e instanceof Error ? e.message : "แชร์รูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleSharePublicLink() {
    if (exportBusy) return;
    setExportBusy("link");
    try {
      const url = await getStaffPublicShareUrl();
      const q =
        order.queueNumber != null
          ? ` · คิว ${formatQueueNumber(order.queueNumber)}`
          : "";
      const r = await sharePublicLink({
        url,
        title: `ออเดอร์ #${order.orderNumber ?? order.id.slice(-6)}${q}`,
        text: `ตรวจออเดอร์ #${order.orderNumber ?? ""}`,
      });
      if (r.error === "cancelled") return;
      flashShare(
        r.mode === "share"
          ? "แชร์ลิงก์แล้ว"
          : r.mode === "copy"
            ? "คัดลอกลิงก์แล้ว"
            : r.error ?? "แชร์ไม่สำเร็จ",
      );
    } catch (e) {
      flashShare(e instanceof Error ? e.message : "แชร์ลิงก์ไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  useEffect(() => {
    const refresh = () => setCanPrint(canUsePrintActions());
    refresh();
    window.addEventListener("skillsale-print-ready", refresh);
    const id = window.setInterval(refresh, 1500);
    return () => {
      window.removeEventListener("skillsale-print-ready", refresh);
      window.clearInterval(id);
    };
  }, []);

  const colorClass = ORDER_STATUS_COLORS[order.status];
  const fulfillment = order.fulfillmentType ?? "DELIVERY";
  const allowed =
    showActions && roles.length > 0 && !order.awaitingPhotoKey
      ? getAllowedNextStatuses(roles, order.status, fulfillment).filter(
          (s) => s !== order.status,
        )
      : [];
  const showCancel =
    showActions && roles.length > 0 && canStaffCancel(roles, order.status);
  const { primary, secondary } = splitPrimaryAction(order.status, allowed);
  const hasActions = Boolean(primary || secondary.length > 0 || showCancel);

  const total = order.items.reduce(
    (sum, item) =>
      sum +
      (Number(item.unitPrice) + Number(item.optionsPrice ?? 0)) *
        item.quantity,
    0,
  );

  const locationLabel =
    fulfillment === "PICKUP"
      ? FULFILLMENT_LABELS.PICKUP
      : (order.deliveryLocation?.name ?? FULFILLMENT_LABELS.DELIVERY);

  const deliveryDistanceLabel =
    branchPin &&
    hasMapPin(branchPin) &&
    order.deliveryLatitude != null &&
    order.deliveryLongitude != null &&
    Number.isFinite(order.deliveryLatitude) &&
    Number.isFinite(order.deliveryLongitude)
      ? formatDistanceKm(
          distanceKm(
            branchPin.latitude,
            branchPin.longitude,
            order.deliveryLatitude,
            order.deliveryLongitude,
          ),
        )
      : null;

  const contactPhone =
    order.customerPhone?.trim() ||
    order.customer?.phone?.trim() ||
    "";

  return (
    <div
      id={`staff-order-card-${order.id}`}
      className={`flex flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all ${
        highlight ? "ring-4 ring-site-primary/30 ring-offset-2" : ""
      } ${colorClass}`}
    >
      <div className="relative flex-1 p-4">
        {!compactTools ? (
          <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-1">
              <button
                type="button"
                disabled={exportBusy != null}
                onClick={() => void handleSaveImage()}
                className="rounded-md bg-white/95 px-1.5 py-1 text-[10px] font-semibold text-gray-800 shadow-sm ring-1 ring-black/10 hover:bg-white disabled:opacity-50"
              >
                {exportBusy === "save" ? "…" : "บันทึกรูป"}
              </button>
              <button
                type="button"
                disabled={exportBusy != null}
                onClick={() => void handleShareImage()}
                className="rounded-md bg-white/95 px-1.5 py-1 text-[10px] font-semibold text-gray-800 shadow-sm ring-1 ring-black/10 hover:bg-white disabled:opacity-50"
              >
                {exportBusy === "share" ? "…" : "แชร์รูป"}
              </button>
              <button
                type="button"
                disabled={exportBusy != null}
                onClick={() => void handleSharePublicLink()}
                className="rounded-md bg-violet-50 px-1.5 py-1 text-[10px] font-semibold text-violet-950 shadow-sm ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-50"
              >
                {exportBusy === "link" ? "…" : "ลิงก์"}
              </button>
            </div>
            {shareHint ? (
              <p className="max-w-[7.5rem] text-right text-[9px] font-medium text-violet-800">
                {shareHint}
              </p>
            ) : null}
          </div>
        ) : null}

        <div ref={captureRef} className={compactTools ? "" : "pr-[5.5rem]"}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-2xl font-black tracking-tight text-gray-900">
                คิว {formatQueueNumber(order.queueNumber)}
              </p>
              {canPrint && order.queueNumber != null ? (
                <button
                  type="button"
                  disabled={printing}
                  onClick={() => {
                    setPrinting(true);
                    try {
                      printQueueTickets({
                        queueNumber: order.queueNumber,
                        orderNumber: order.orderNumber,
                        dateLabel:
                          ticketDateLabel ||
                          (order.createdAt
                            ? new Date(order.createdAt).toLocaleDateString(
                                "sv-SE",
                                { timeZone: "Asia/Bangkok" },
                              )
                            : ""),
                        copies: queueTicketCopies,
                      });
                    } finally {
                      setPrinting(false);
                    }
                  }}
                  aria-label="พิมพ์เลขคิว"
                  title="พิมพ์เลขคิว"
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 text-[13px] font-bold text-orange-800 hover:bg-orange-100 disabled:opacity-60"
                >
                  <IconPrinter size={16} aria-hidden />
                  {printing ? "พิมพ์…" : "พิมพ์คิว"}
                </button>
              ) : null}
            </div>
            {order.orderNumber ? (
              <p className="mt-0.5 text-[13px] font-medium text-gray-500">
                บิล #{order.orderNumber}
              </p>
            ) : null}
            <p className="mt-0.5 text-[13px] font-semibold text-gray-700">
              {locationLabel}
            </p>
            {order.createdByStaffId ? (
              <span className="mt-1.5 inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-[12px] font-semibold text-violet-800">
                คีย์โดยพนักงาน
              </span>
            ) : null}
            {order.salesChannel ? (
              <span className="mt-1.5 ml-1 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700">
                {SALES_CHANNEL_LABELS[order.salesChannel]}
              </span>
            ) : null}
            {order.awaitingPhotoKey ? (
              <span className="mt-1.5 inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-[12px] font-semibold text-orange-800">
                รอคีย์จากรูป
              </span>
            ) : null}
            {order.deliveryLocation?.isCustomAddress ? (
              <span className="mt-1.5 inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-[12px] font-semibold text-sky-800">
                ที่อยู่ลูกค้า
              </span>
            ) : null}
            {deliveryDistanceLabel ? (
              <p className="mt-1.5 text-[15px] font-bold text-sky-800">
                ห่างจากร้าน ~{deliveryDistanceLabel}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-lg bg-white/90 px-2.5 py-1.5 text-[12px] font-bold text-gray-800 ring-1 ring-black/5">
            {getStaffStatusLabel(order.status, roles)}
          </span>
        </div>

        {order.addressDetail ? (
          <p
            className={`mt-1.5 text-sm text-gray-800 ${
              order.deliveryLocation?.isCustomAddress
                ? "rounded-lg bg-sky-50 px-2.5 py-1.5 font-medium text-sky-950"
                : ""
            }`}
          >
            {order.deliveryLocation?.isCustomAddress ? (
              <span className="mb-0.5 block text-xs font-semibold text-sky-700">
                ส่งที่
              </span>
            ) : null}
            {order.addressDetail}
          </p>
        ) : null}

        {order.deliveryLatitude != null &&
        order.deliveryLongitude != null &&
        Number.isFinite(order.deliveryLatitude) &&
        Number.isFinite(order.deliveryLongitude) ? (
          <a
            href={`https://maps.google.com/?q=${order.deliveryLatitude},${order.deliveryLongitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex text-sm font-medium text-site-primary underline"
          >
            เปิดในแผนที่
          </a>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="text-[15px] font-bold text-gray-800">
              {order.customerName || order.customer?.name || "-"}
            </p>
            {typeof order.isNewCustomer === "boolean" && (
              <CustomerTypeBadge isNewCustomer={order.isNewCustomer} />
            )}
          </div>
          {contactPhone && !contactPhone.startsWith("walkin:") ? (
            <PhoneCallButton
              phone={contactPhone}
              showNumber={false}
              size={16}
            />
          ) : null}
        </div>

        {order.consumableLines && order.consumableLines.length > 0 ? (
          <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
            {order.consumableLines
              .map(
                (l) =>
                  `${l.itemName} × ${l.quantity}${l.unit ? ` ${l.unit}` : ""}`,
              )
              .join(" · ")}
          </p>
        ) : order.cupCount != null && order.cupCount > 0 ? (
          <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
            แก้ว {order.cupSizeOz ?? "—"} ออนซ์ × {order.cupCount} · ถุง{" "}
            {order.bagCount ?? order.cupCount} ใบ
          </p>
        ) : null}

        {order.note ? (
          <p className="mt-1.5 rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs text-orange-800">
            <IconLabel
              icon={IconNote}
              size={12}
              iconClassName="text-orange-600"
            >
              {order.note}
            </IconLabel>
          </p>
        ) : null}

        {order.photoUrl ? (
          <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.photoUrl}
              alt="รูปออเดอร์"
              className="max-h-48 w-full object-cover"
            />
          </div>
        ) : null}

        {order.awaitingPhotoKey && showActions ? (
          <Link
            href={`/staff/key-order/photo/${order.id}`}
            className="mt-2 flex w-full items-center justify-center rounded-lg bg-orange-500 px-3 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
          >
            คีย์รายการจากรูป
          </Link>
        ) : null}

        {order.status === OrderStatus.CANCELLED && order.cancelReason ? (
          <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
            เหตุผลยกเลิก: {order.cancelReason}
          </p>
        ) : null}

        <div className="mt-3">
          {collapsibleItems ? (
            <>
              <button
                type="button"
                onClick={() => setItemsExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-3 text-left text-[14px] ring-1 ring-black/5"
              >
                <span className="font-bold text-gray-800">
                  {order.items.length} รายการ
                  {!itemsExpanded ? (
                    <span className="ml-1 font-medium text-gray-500">
                      · แตะเพื่อดู
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[13px] font-bold text-site-primary">
                  {itemsExpanded ? "ซ่อน" : "ดูรายการ"}
                </span>
              </button>
              {itemsExpanded ? (
                <ul className="mt-1.5 divide-y divide-gray-100 overflow-hidden rounded-lg bg-white/70 ring-1 ring-black/5">
                  {order.items.map((item) => {
                    const packPieces = isPackLikeOptions(item.optionsText)
                      ? countPackStickPieces(item)
                      : 0;
                    return (
                    <li
                      key={item.id}
                      className="flex items-start gap-2 px-2.5 py-2 text-xs text-gray-900"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-bold text-gray-800">
                        {item.quantity}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="font-medium leading-snug">
                          {(item.itemName || item.branchMenuItem?.name) ?? "-"}
                          {packPieces > 0 ? (
                            <span className="ml-1 font-semibold text-amber-700">
                              · {packPieces} ชิ้นในชุด
                            </span>
                          ) : null}
                        </p>
                        {item.optionsText ? (
                          <OrderItemOptionChips
                            optionsText={item.optionsText}
                            itemName={item.itemName || item.branchMenuItem?.name}
                            giftQuantity={item.giftQuantity}
                            quantity={item.quantity}
                          />
                        ) : null}
                        {item.note ? (
                          <p className="mt-0.5 text-[11px] text-orange-600">
                            {item.note}
                          </p>
                        ) : null}
                      </div>
                    </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg bg-white/70 ring-1 ring-black/5">
              {order.items.map((item) => {
                const packPieces = isPackLikeOptions(item.optionsText)
                  ? countPackStickPieces(item)
                  : 0;
                return (
                <li
                  key={item.id}
                  className="flex items-start gap-2 px-2.5 py-2 text-xs text-gray-900"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-bold text-gray-800">
                    {item.quantity}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="font-medium leading-snug">
                      {(item.itemName || item.branchMenuItem?.name) ?? "-"}
                      {packPieces > 0 ? (
                        <span className="ml-1 font-semibold text-amber-700">
                          · {packPieces} ชิ้นในชุด
                        </span>
                      ) : null}
                    </p>
                    {item.optionsText ? (
                      <OrderItemOptionChips
                        optionsText={item.optionsText}
                        itemName={item.itemName || item.branchMenuItem?.name}
                        giftQuantity={item.giftQuantity}
                        quantity={item.quantity}
                      />
                    ) : null}
                    {item.note ? (
                      <p className="mt-0.5 text-[11px] text-orange-600">
                        {item.note}
                      </p>
                    ) : null}
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-3 text-right text-xl font-black tabular-nums text-gray-900">
          รวม {total.toLocaleString("th-TH")} บาท
        </p>
        </div>
      </div>

      {showActions && hasActions ? (
        <div className="border-t border-black/10 bg-white/90 p-3">
          {primary ? (
            <button
              type="button"
              onClick={() => onStatusChange?.(order.id, primary)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-site-primary px-4 text-[16px] font-extrabold text-white shadow-sm active:scale-[0.98] hover:opacity-95"
            >
              {primaryActionLabel(order.status, primary, roles)}
              <IconArrowRight size={20} />
            </button>
          ) : null}

          {(secondary.length > 0 || showCancel) && (
            <div
              className={`grid gap-2 ${primary ? "mt-2.5" : ""} ${
                secondary.length + (showCancel ? 1 : 0) > 1
                  ? "grid-cols-2"
                  : "grid-cols-1"
              }`}
            >
              {secondary.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onStatusChange?.(order.id, status)}
                  className="flex min-h-11 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-3 text-[13px] font-bold text-gray-800 active:bg-gray-50"
                >
                  {getStaffStatusLabel(status, roles)}
                </button>
              ))}
              {showCancel && onRequestCancel ? (
                <button
                  type="button"
                  onClick={() => onRequestCancel(order.id)}
                  className={`flex min-h-11 items-center justify-center rounded-xl border-2 border-red-300 bg-red-50 px-3 text-[13px] font-bold text-red-700 active:bg-red-100 ${
                    secondary.length === 0 ? "col-span-full" : ""
                  }`}
                >
                  ยกเลิก
                </button>
              ) : null}
            </div>
          )}

          {compactTools ? (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setToolsOpen((v) => !v)}
                className="w-full rounded-lg py-2 text-center text-[13px] font-semibold text-slate-500"
              >
                {toolsOpen ? "ซ่อนเครื่องมือ" : "บันทึกรูป / แชร์ / ลิงก์"}
              </button>
              {toolsOpen ? (
                <div className="mt-1 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={exportBusy != null}
                    onClick={() => void handleSaveImage()}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[12px] font-bold text-slate-700 disabled:opacity-50"
                  >
                    {exportBusy === "save" ? "…" : "บันทึกรูป"}
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy != null}
                    onClick={() => void handleShareImage()}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[12px] font-bold text-slate-700 disabled:opacity-50"
                  >
                    {exportBusy === "share" ? "…" : "แชร์รูป"}
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy != null}
                    onClick={() => void handleSharePublicLink()}
                    className="rounded-xl border border-violet-200 bg-violet-50 px-2 py-2.5 text-[12px] font-bold text-violet-900 disabled:opacity-50"
                  >
                    {exportBusy === "link" ? "…" : "ลิงก์"}
                  </button>
                </div>
              ) : null}
              {shareHint ? (
                <p className="mt-1 text-center text-[12px] font-medium text-violet-800">
                  {shareHint}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : compactTools ? (
        <div className="border-t border-black/10 bg-white/90 px-3 py-2">
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            className="w-full rounded-lg py-2 text-center text-[13px] font-semibold text-slate-500"
          >
            {toolsOpen ? "ซ่อนเครื่องมือ" : "บันทึกรูป / แชร์ / ลิงก์"}
          </button>
          {toolsOpen ? (
            <div className="mt-1 grid grid-cols-3 gap-2 pb-1">
              <button
                type="button"
                disabled={exportBusy != null}
                onClick={() => void handleSaveImage()}
                className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[12px] font-bold text-slate-700 disabled:opacity-50"
              >
                {exportBusy === "save" ? "…" : "บันทึกรูป"}
              </button>
              <button
                type="button"
                disabled={exportBusy != null}
                onClick={() => void handleShareImage()}
                className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[12px] font-bold text-slate-700 disabled:opacity-50"
              >
                {exportBusy === "share" ? "…" : "แชร์รูป"}
              </button>
              <button
                type="button"
                disabled={exportBusy != null}
                onClick={() => void handleSharePublicLink()}
                className="rounded-xl border border-violet-200 bg-violet-50 px-2 py-2.5 text-[12px] font-bold text-violet-900 disabled:opacity-50"
              >
                {exportBusy === "link" ? "…" : "ลิงก์"}
              </button>
            </div>
          ) : null}
          {shareHint ? (
            <p className="mt-1 pb-1 text-center text-[12px] font-medium text-violet-800">
              {shareHint}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function StatusLegend({
  roles = [],
  autoAcceptOrders = false,
  waitingCount = 0,
  value,
  onChange,
}: {
  roles?: StaffRole[];
  autoAcceptOrders?: boolean;
  /** จำนวนออเดอร์รอร้านรับ — ใช้โชว์แท็บแม้เปิดรับออโต้ */
  waitingCount?: number;
  value?: OrderStatus | null;
  onChange?: (status: OrderStatus) => void;
}) {
  const statuses = getStaffLegendStatuses(roles, {
    autoAcceptOrders,
    hasWaitingOrders: waitingCount > 0,
  });
  if (statuses.length === 0) return null;

  const active = value ?? statuses[0];

  return (
    <div
      className="overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
    >
      <div className="flex w-full min-w-0 border-b border-gray-200">
        {statuses.map((status) => {
          const selected = status === active;
          const isWaiting = status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE;
          return (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange?.(status)}
              className={`relative min-h-12 min-w-0 flex-1 cursor-pointer border-b-2 px-1 py-2.5 text-center text-[13px] font-bold leading-tight transition-colors sm:text-sm ${
                selected
                  ? isWaiting
                    ? "-mb-px border-amber-500 text-amber-700"
                    : "-mb-px border-site-primary text-site-primary"
                  : isWaiting && waitingCount > 0
                    ? "border-transparent text-amber-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <span className="inline-flex items-center justify-center gap-1">
                <span className="truncate">
                  {getStaffStatusLabel(status, roles)}
                </span>
                {isWaiting && waitingCount > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-black text-white">
                    {waitingCount > 99 ? "99+" : waitingCount}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
