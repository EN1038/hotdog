"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type {
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  SalesChannel,
} from "@prisma/client";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SALES_CHANNEL_LABELS,
  formatPrice,
} from "@/lib/constants";
import {
  parseOrderItemOptionsForDisplay,
  summarizeOrderItems,
} from "@/lib/order-item-display";
import {
  orderGrandTotal,
  orderItemsSubtotal,
} from "@/lib/order-totals";
import { OrderTimeline } from "@/components/customer/OrderTimeline";
import { CustomerTypeBadge } from "@/components/CustomerTypeBadge";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { IconBack } from "@/components/icons";
import { LoadingState } from "@/components/LoadingState";
import { formatQueueNumber } from "@/lib/order-queue-format";
import {
  AdminEditOrderItemsModal,
  type EditOrderLineDraft,
} from "@/components/admin/AdminEditOrderItemsModal";
import { btnPrimary } from "@/components/admin/AdminShell";
import type { MenuItemData } from "@/lib/customer-types";
import { reconstructOptionIdsFromText } from "@/lib/order-item-options-text";
import {
  absoluteUrlFromPath,
  captureElementToPng,
  downloadPngDataUrl,
  sharePngDataUrl,
  sharePublicLink,
} from "@/lib/share-media";

type AdminOrderDetail = {
  id: string;
  orderNumber: string;
  queueNumber: number;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  salesChannel?: SalesChannel | null;
  customerName: string;
  customerPhone: string;
  isNewCustomer: boolean;
  addressDetail: string | null;
  scheduledAt: string | null;
  note: string | null;
  awaitingPhotoKey?: boolean;
  deliveryFee: string;
  discountAmount: string;
  createdAt: string;
  photoUrl?: string | null;
  branch: { id: string; name: string; phone: string | null };
  customer: { phone: string; name: string | null } | null;
  deliveryLocation: { name: string } | null;
  items: Array<{
    id: string;
    branchMenuItemId: string | null;
    itemName: string;
    quantity: number;
    unitPrice: string;
    optionsPrice: string;
    optionsText: string | null;
    giftQuantity?: number | null;
    note: string | null;
    branchMenuItem?: { imageUrl: string | null } | null;
  }>;
  consumableLines?: Array<{
    id: string;
    itemName: string;
    quantity: number;
    unit: string;
  }> | null;
};

function OptionChips({
  labels,
  tone = "slate",
}: {
  labels: string[];
  tone?: "slate" | "amber" | "sky" | "violet";
}) {
  if (labels.length === 0) return null;
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "sky"
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : tone === "violet"
          ? "border-violet-200 bg-violet-50 text-violet-900"
          : "border-slate-200 bg-slate-50 text-slate-800";
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {labels.map((label, idx) => (
        <li
          key={`${label}-${idx}`}
          className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass}`}
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

const btnTop =
  "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50";

export default function AdminOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const captureRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [editInitialLines, setEditInitialLines] = useState<EditOrderLineDraft[]>(
    [],
  );
  const [exportBusy, setExportBusy] = useState<
    "save" | "share" | "link" | null
  >(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [publicShareUrl, setPublicShareUrl] = useState<string | null>(null);

  function flashShare(msg: string) {
    setShareHint(msg);
    window.setTimeout(() => setShareHint(null), 2800);
  }

  async function ensurePublicShareUrl(): Promise<string> {
    if (publicShareUrl) return publicShareUrl;
    const res = await fetch(`/api/admin/orders/${orderId}/share`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error ?? "สร้างลิงก์สาธารณะไม่สำเร็จ");
    }
    const url = absoluteUrlFromPath(String(body.path ?? ""));
    setPublicShareUrl(url);
    return url;
  }

  async function captureOrderPng(): Promise<string> {
    const node = captureRef.current;
    if (!node) throw new Error("ไม่พบใบออเดอร์");
    return captureElementToPng(node);
  }

  async function handleSaveImage() {
    if (!order || exportBusy) return;
    setExportBusy("save");
    try {
      const dataUrl = await captureOrderPng();
      const r = await downloadPngDataUrl(
        dataUrl,
        `order-${order.orderNumber || order.id}`,
      );
      flashShare(r.ok ? "บันทึกรูปแล้ว" : r.error ?? "บันทึกไม่สำเร็จ");
    } catch (e) {
      flashShare(e instanceof Error ? e.message : "บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareImage() {
    if (!order || exportBusy) return;
    setExportBusy("share");
    try {
      const dataUrl = await captureOrderPng();
      const r = await sharePngDataUrl(
        dataUrl,
        `order-${order.orderNumber || order.id}`,
        `ออเดอร์ #${order.orderNumber} · คิว ${formatQueueNumber(order.queueNumber)}`,
      );
      if (r.error === "cancelled") return;
      flashShare(
        r.mode === "share"
          ? "แชร์รูปแล้ว"
          : r.ok
            ? "บันทึกรูปแทน (เครื่องนี้ยังแชร์รูปไม่ได้)"
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
      const url = await ensurePublicShareUrl();
      const r = await sharePublicLink({
        url,
        title: `ออเดอร์ #${order?.orderNumber ?? orderId}`,
        text: `ตรวจออเดอร์ #${order?.orderNumber ?? ""} · คิว ${formatQueueNumber(order?.queueNumber ?? 0)}`,
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
      flashShare(e instanceof Error ? e.message : "สร้างลิงก์ไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/orders/${orderId}`);
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (!res.ok) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setOrder(await res.json());
    setLoading(false);
  }, [orderId, router]);

  useEffect(() => {
    load();
  }, [load]);

  const canEditItems = useMemo(() => {
    if (!order) return false;
    if (order.status === "CANCELLED") return false;
    if (order.awaitingPhotoKey) return false;
    return order.items.some((i) => Boolean(i.branchMenuItemId));
  }, [order]);

  async function openEditModal() {
    if (!order) return;
    setEditError("");
    try {
      const res = await fetch(
        `/api/admin/branches/${order.branch.id}/menu-items`,
      );
      const menus = res.ok
        ? ((await res.json()) as Array<
            MenuItemData & {
              optionGroups?: Array<{
                mode: string;
                options: Array<{ id: string; name: string }>;
                menuItemSources?: Array<{
                  isEnabled: boolean;
                  menuItemId: string;
                  menuItem: { name: string; isHidden: boolean } | null;
                }>;
              }>;
            }
          >)
        : [];
      const menuMap = new Map(menus.map((m) => [m.id, m]));
      const lines: EditOrderLineDraft[] = order.items
        .filter((it) => it.branchMenuItemId)
        .map((it) => {
          const menu = menuMap.get(it.branchMenuItemId!);
          const optionIds = reconstructOptionIdsFromText(
            menu?.optionGroups ?? [],
            it.optionsText,
          );
          return {
            key: it.id,
            branchMenuItemId: it.branchMenuItemId!,
            name: it.itemName,
            quantity: it.quantity,
            optionIds,
            note: it.note ?? "",
          };
        });
      setEditInitialLines(lines);
      setEditOpen(true);
    } catch {
      setEditError("โหลดเมนูสำหรับแก้ไขไม่สำเร็จ");
    }
  }

  async function saveEditItems(input: {
    items: Array<{
      branchMenuItemId: string;
      quantity: number;
      optionIds: string[];
      note?: string;
    }>;
    reason?: string;
  }) {
    if (!order) return;
    setEditBusy(true);
    setEditError("");
    try {
      const res = await fetch(
        `/api/admin/branches/${order.branch.id}/orders/${order.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(
          typeof data.error === "string" ? data.error : "บันทึกไม่สำเร็จ",
        );
        return;
      }
      setEditOpen(false);
      await load();
    } catch {
      setEditError("บันทึกไม่สำเร็จ");
    } finally {
      setEditBusy(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (notFound || !order) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-gray-600">ไม่พบออเดอร์นี้</p>
        <Link
          href="/admin"
          className="mt-3 inline-block text-sm text-site-primary hover:underline"
        >
          กลับแดชบอร์ด
        </Link>
      </div>
    );
  }

  const created = new Date(order.createdAt);
  const itemsSummary = summarizeOrderItems(order.items);
  const itemsTotal = orderItemsSubtotal(order.items);
  const grand = orderGrandTotal(
    order.items,
    order.deliveryFee,
    order.discountAmount,
  );
  const backHref = `/admin/branches/${order.branch.id}?tab=orders`;
  const isFinished =
    order.status === "COMPLETED" || order.status === "CANCELLED";
  const giftTotal = order.items.reduce(
    (n, it) => n + Math.max(0, Number(it.giftQuantity ?? 0)),
    0,
  );
  const consumableLines = order.consumableLines ?? [];
  const channelLabel =
    order.salesChannel && SALES_CHANNEL_LABELS[order.salesChannel]
      ? SALES_CHANNEL_LABELS[order.salesChannel]
      : null;

  const optionHighlightLabels = (() => {
    const labels: string[] = [];
    for (const it of order.items) {
      const p = parseOrderItemOptionsForDisplay(it);
      if (p.isPack) labels.push(...p.extraNames);
      else labels.push(...p.optionNames);
    }
    return [...new Set(labels.filter(Boolean))];
  })();

  return (
    <div className="w-full">
      <div className="mb-4 flex items-start gap-3">
        <Link
          href={backHref}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="กลับ"
        >
          <IconBack size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-gray-900">
            รายละเอียดออเดอร์
          </h2>
          <p className="text-sm text-gray-500">{order.branch.name}</p>
        </div>
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
              onClick={() => void handleSharePublicLink()}
            >
              {exportBusy === "link" ? "…" : "แชร์ลิงก์"}
            </button>
          </div>
          {shareHint ? (
            <p className="max-w-[14rem] text-right text-[10px] font-medium text-violet-800">
              {shareHint}
            </p>
          ) : null}
        </div>
      </div>

      <div ref={captureRef} className="space-y-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-2xl font-bold text-gray-900">
                คิว {formatQueueNumber(order.queueNumber)}
              </p>
              <p className="text-lg font-bold text-gray-700">
                #{order.orderNumber}
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                {created.toLocaleString("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${ORDER_STATUS_BADGE[order.status]}`}
            >
              {ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>

          {!isFinished && (
            <div className="mt-4">
              <OrderTimeline
                status={order.status}
                fulfillmentType={order.fulfillmentType}
              />
            </div>
          )}

          <dl className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-500">ลูกค้า</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 font-medium text-gray-900">
                <span>{order.customerName || order.customer?.name || "—"}</span>
                <CustomerTypeBadge isNewCustomer={order.isNewCustomer} />
              </dd>
              {(order.customerPhone || order.customer?.phone) && (
                <div className="mt-1">
                  <PhoneCallButton
                    phone={order.customerPhone || order.customer?.phone || ""}
                    showNumber
                  />
                </div>
              )}
            </div>
            <div>
              <dt className="text-xs text-gray-500">ประเภทการรับ</dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {FULFILLMENT_LABELS[order.fulfillmentType]}
              </dd>
              {channelLabel ? (
                <p className="mt-0.5 text-xs text-gray-500">
                  ช่องทาง · {channelLabel}
                </p>
              ) : null}
            </div>
            <div>
              <dt className="text-xs text-gray-500">ชำระเงิน</dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {PAYMENT_METHOD_LABELS[order.paymentMethod]}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">จำนวนรายการ</dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {itemsSummary.primary}
                {itemsSummary.secondary ? (
                  <span className="mt-0.5 block text-sm font-medium text-amber-700">
                    {itemsSummary.secondary}
                  </span>
                ) : null}
                {giftTotal > 0 ? (
                  <span className="mt-0.5 block text-xs font-medium text-emerald-700">
                    ของแถม {giftTotal.toLocaleString("th-TH")} ชิ้น
                  </span>
                ) : null}
              </dd>
            </div>
            {order.fulfillmentType === "DELIVERY" && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-500">ที่อยู่จัดส่ง</dt>
                <dd className="mt-0.5 text-sm text-gray-900">
                  {order.deliveryLocation?.name
                    ? `${order.deliveryLocation.name}`
                    : ""}
                  {order.addressDetail
                    ? `${order.deliveryLocation?.name ? " · " : ""}${order.addressDetail}`
                    : order.deliveryLocation?.name
                      ? ""
                      : "—"}
                </dd>
              </div>
            )}
            {order.scheduledAt && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-500">เวลานัดรับ/ส่ง</dt>
                <dd className="mt-0.5 font-medium text-gray-900">
                  {new Date(order.scheduledAt).toLocaleString("th-TH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-xs text-gray-500">หมายเหตุออเดอร์</dt>
              <dd className="mt-0.5 text-sm text-gray-900">
                {order.note?.trim() || "—"}
              </dd>
            </div>
            {optionHighlightLabels.length > 0 ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-gray-500">
                  ตัวเลือกที่เลือก (เช่น ความเผ็ด / น้ำจิ้ม)
                </dt>
                <dd className="mt-1">
                  <OptionChips labels={optionHighlightLabels} tone="sky" />
                </dd>
              </div>
            ) : null}
            {consumableLines.length > 0 ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-gray-500">
                  ของสิ้นเปลืองที่ใช้กับออเดอร์ (ถุง / แก้ว ฯลฯ)
                </dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {consumableLines.map((line) => (
                    <span
                      key={line.id}
                      className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-950"
                    >
                      {line.itemName}
                      <span className="ml-1.5 rounded-md bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold">
                        ×{line.quantity}
                        {line.unit ? ` ${line.unit}` : ""}
                      </span>
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-gray-900">รายการสินค้า</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {order.items.length.toLocaleString("th-TH")} บรรทัด ·{" "}
                {itemsSummary.primary}
                {itemsSummary.secondary
                  ? ` · ${itemsSummary.secondary.replace(/^รวม\s*/, "")}`
                  : ""}
              </p>
            </div>
            {canEditItems ? (
              <button
                type="button"
                className={`${btnPrimary} !px-3 !py-1.5 text-sm`}
                onClick={() => void openEditModal()}
              >
                แก้ไขรายการ
              </button>
            ) : null}
          </div>
          {editError ? (
            <p className="mt-2 text-sm text-red-600">{editError}</p>
          ) : null}
          <ul className="mt-3 divide-y divide-gray-100">
            {order.items.map((it, index) => {
              const unit = Number(it.unitPrice) + Number(it.optionsPrice);
              const line = unit * it.quantity;
              const imageUrl = it.branchMenuItem?.imageUrl;
              const parsed = parseOrderItemOptionsForDisplay(it);
              const giftQty = Math.max(0, Number(it.giftQuantity ?? 0));

              return (
                <li key={it.id} className="flex items-start gap-3 py-4">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={it.itemName}
                        className="h-14 w-14 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-sm font-semibold text-gray-500">
                        {index + 1}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                      <p className="font-semibold text-gray-900">{it.itemName}</p>
                      {parsed.isPack ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          ชุดโปร
                        </span>
                      ) : null}
                      {giftQty > 0 ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          แถม {giftQty.toLocaleString("th-TH")} ชิ้น
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm text-gray-600">
                      ราคา{" "}
                      <span className="font-medium text-gray-800">
                        ฿{formatPrice(Number(it.unitPrice))}
                      </span>
                      {Number(it.optionsPrice) !== 0 ? (
                        <>
                          {" "}
                          + ตัวเลือก{" "}
                          <span className="font-medium text-gray-800">
                            ฿{formatPrice(it.optionsPrice)}
                          </span>
                        </>
                      ) : null}
                      {" · "}
                      จำนวน{" "}
                      <span className="font-medium text-gray-800">
                        {it.quantity.toLocaleString("th-TH")}
                      </span>
                      {parsed.isPack && parsed.stickPieceTotal > 0 ? (
                        <span className="ml-1 font-medium text-amber-700">
                          · {parsed.stickPieceTotal.toLocaleString("th-TH")}{" "}
                          ชิ้นในชุด
                        </span>
                      ) : null}
                    </p>

                    {parsed.isPack ? (
                      <div className="mt-2 space-y-2">
                        {parsed.stickCounts.length > 0 ? (
                          <div>
                            <p className="text-xs font-semibold text-gray-600">
                              ไม้ในชุด ({parsed.stickNames.length} ไม้)
                            </p>
                            <ul className="mt-1.5 flex flex-wrap gap-1.5">
                              {parsed.stickCounts.map((row) => (
                                <li
                                  key={row.name}
                                  className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-950"
                                >
                                  <span className="font-medium">{row.name}</span>
                                  {row.count > 1 ? (
                                    <span className="rounded-md bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                                      ×{row.count}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {parsed.extraNames.length > 0 ? (
                          <div>
                            <p className="text-xs font-semibold text-gray-600">
                              ตัวเลือกเพิ่ม
                            </p>
                            <OptionChips
                              labels={parsed.extraNames}
                              tone="violet"
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : parsed.optionNames.length > 0 ? (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-gray-600">
                          ตัวเลือก
                        </p>
                        <OptionChips labels={parsed.optionNames} tone="sky" />
                      </div>
                    ) : null}

                    {it.note?.trim() ? (
                      <p className="mt-2 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-1.5 text-xs text-orange-900">
                        <span className="font-semibold">หมายเหตุรายการ:</span>{" "}
                        {it.note.trim()}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-gray-900">
                      ฿{formatPrice(line)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      ฿{formatPrice(unit)} × {it.quantity}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {consumableLines.length > 0 ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h3 className="font-semibold text-amber-950">
                ถุง / แก้ว / ของสิ้นเปลือง
              </h3>
              <p className="text-xs text-amber-900/70">
                จากหน้าคีย์ออเดอร์ · ตัดสต็อกสิ้นเปลือง
              </p>
            </div>
            <ul className="mt-3 divide-y divide-amber-100/80 overflow-hidden rounded-xl border border-amber-200 bg-white">
              {consumableLines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-gray-900">
                    {line.itemName}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-amber-950">
                    {line.quantity.toLocaleString("th-TH")}
                    {line.unit ? ` ${line.unit}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {order.photoUrl ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900">
              รูปรอคีย์ (ออเดอร์จากรูป)
            </h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.photoUrl}
              alt="รูปรอคีย์"
              className="mt-2 max-h-48 w-full rounded-xl border border-gray-200 object-contain bg-white"
            />
          </section>
        ) : null}

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">สรุปยอด</h3>
          <div className="mt-3 space-y-1.5 text-sm text-gray-700">
            <div className="flex justify-between">
              <span>รวมค่าสินค้า</span>
              <span>฿{formatPrice(itemsTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>ค่าส่ง</span>
              <span>฿{formatPrice(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between">
              <span>ส่วนลด</span>
              <span>-฿{formatPrice(order.discountAmount)}</span>
            </div>
            {giftTotal > 0 ? (
              <div className="flex justify-between text-emerald-700">
                <span>ของแถม (ไม่คิดเงิน)</span>
                <span>{giftTotal.toLocaleString("th-TH")} ชิ้น</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
              <span>รวมทั้งสิ้น</span>
              <span className="text-red-600">฿{formatPrice(grand)}</span>
            </div>
          </div>
        </section>
      </div>

      <AdminEditOrderItemsModal
        open={editOpen}
        branchId={order.branch.id}
        orderNumber={order.orderNumber}
        fulfillmentType={order.fulfillmentType}
        initialLines={editInitialLines}
        busy={editBusy}
        onClose={() => {
          if (!editBusy) setEditOpen(false);
        }}
        onSave={(input) => {
          void saveEditItems(input);
        }}
      />
    </div>
  );
}
