"use client";

import Link from "next/link";
import type { FulfillmentType, OrderStatus } from "@prisma/client";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/constants";
import { orderGrandTotal } from "@/lib/order-totals";
import {
  parseOrderItemOptionsForDisplay,
  summarizeOrderItems,
} from "@/lib/order-item-display";
import { CustomerTypeBadge } from "@/components/CustomerTypeBadge";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import {
  adminTableClass,
  adminTableWrapClass,
  adminTheadClass,
  adminTrClass,
} from "@/components/admin/admin-ui";
import { formatQueueNumber } from "@/lib/order-queue-format";

export type AdminOrderRow = {
  id: string;
  orderNumber?: string;
  queueNumber?: number | null;
  status: OrderStatus;
  fulfillmentType?: FulfillmentType;
  paymentMethod?: keyof typeof PAYMENT_METHOD_LABELS;
  addressDetail: string | null;
  customerName?: string;
  isNewCustomer?: boolean;
  createdAt: string;
  deliveryFee?: string | number;
  discountAmount?: string | number;
  customer?: { phone: string; name?: string | null } | null;
  deliveryLocation: { name: string } | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: string | number;
    optionsPrice?: string | number;
    itemName: string;
    optionsText?: string | null;
    giftQuantity?: number | null;
  }>;
  consumableLines?: Array<{
    id?: string;
    itemName: string;
    quantity: number;
    unit?: string | null;
  }> | null;
};

type OrdersTableProps = {
  orders: AdminOrderRow[];
  emptyText?: string;
  /** When set, show permanent-delete action per row */
  onHardDelete?: (order: AdminOrderRow) => void;
  hardDeleteBusyId?: string | null;
};

function formatMoney(n: number) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function OrdersTable({
  orders,
  emptyText = "ยังไม่มีออเดอร์",
  onHardDelete,
  hardDeleteBusyId,
}: OrdersTableProps) {
  if (orders.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
        {emptyText}
      </p>
    );
  }

  return (
    <div className={adminTableWrapClass}>
      <table className={adminTableClass}>
        <thead className={adminTheadClass}>
          <tr>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">เลขที่</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">เวลา</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">ลูกค้า</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">ช่องทาง</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">รายการ</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">ยอด</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">สถานะ</th>
            {onHardDelete ? (
              <th className="whitespace-nowrap px-3 py-3 font-semibold">จัดการ</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const total = orderGrandTotal(
              order.items,
              order.deliveryFee,
              order.discountAmount,
            );
            const itemsSummary = summarizeOrderItems(order.items);
            const channel =
              order.fulfillmentType === "PICKUP"
                ? FULFILLMENT_LABELS.PICKUP
                : (order.deliveryLocation?.name ??
                  FULFILLMENT_LABELS.DELIVERY);
            const href = `/admin/orders/${order.id}`;
            const packNames = itemsSummary.hasPack
              ? order.items
                  .filter((it) => it.optionsText && it.itemName)
                  .map((it) => it.itemName)
              : [];
            const optionLabels = [
              ...new Set(
                order.items.flatMap((it) => {
                  const p = parseOrderItemOptionsForDisplay(it);
                  return p.isPack ? p.extraNames : p.optionNames;
                }),
              ),
            ].filter(Boolean);
            const consumableText = (order.consumableLines ?? [])
              .map(
                (l) =>
                  `${l.itemName} ×${l.quantity}${l.unit ? ` ${l.unit}` : ""}`,
              )
              .join(" · ");

            return (
              <tr
                key={order.id}
                className={`group ${adminTrClass} hover:bg-site-primary-soft/40`}
              >
                <td className="whitespace-nowrap px-3 py-3 font-medium text-gray-900">
                  <Link
                    href={href}
                    className="font-medium text-site-primary underline-offset-2 group-hover:underline"
                  >
                    {order.orderNumber
                      ? `คิว ${formatQueueNumber(order.queueNumber)} · #${order.orderNumber}`
                      : order.id.slice(-6)}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-gray-600">
                  <Link href={href} className="block">
                    {formatDateTime(order.createdAt)}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <Link href={href} className="block">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium text-gray-900">
                      <span>
                        {order.customerName || order.customer?.name || "—"}
                      </span>
                      {typeof order.isNewCustomer === "boolean" && (
                        <CustomerTypeBadge
                          isNewCustomer={order.isNewCustomer}
                        />
                      )}
                    </p>
                  </Link>
                  {order.customer?.phone ? (
                    <div
                      className="mt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PhoneCallButton
                        phone={order.customer.phone}
                        showNumber
                        size={14}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">—</p>
                  )}
                </td>
                <td className="px-3 py-3 text-gray-700">
                  <Link href={href} className="block">
                    <p>{channel}</p>
                    {order.paymentMethod && (
                      <p className="text-xs text-gray-500">
                        {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                      </p>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-3 text-gray-600">
                  <Link href={href} className="block">
                    <p className="font-medium text-gray-800">
                      {itemsSummary.primary}
                    </p>
                    {itemsSummary.secondary ? (
                      <p className="text-xs font-medium text-amber-700">
                        {itemsSummary.secondary}
                      </p>
                    ) : null}
                    {packNames.length > 0 ? (
                      <p className="mt-0.5 max-w-[14rem] truncate text-xs text-gray-500">
                        {packNames.join(", ")}
                      </p>
                    ) : null}
                    {optionLabels.length > 0 ? (
                      <p className="mt-0.5 max-w-[14rem] truncate text-xs font-medium text-sky-800">
                        ตัวเลือก: {optionLabels.join(" · ")}
                      </p>
                    ) : null}
                    {consumableText ? (
                      <p className="mt-0.5 max-w-[14rem] truncate text-xs font-medium text-amber-800">
                        {consumableText}
                      </p>
                    ) : null}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-gray-900">
                  <Link href={href}>{formatMoney(total)} ฿</Link>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <Link href={href}>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_BADGE[order.status]}`}
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </Link>
                </td>
                {onHardDelete ? (
                  <td className="whitespace-nowrap px-3 py-3">
                    <button
                      type="button"
                      disabled={
                        !order.orderNumber || hardDeleteBusyId === order.id
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onHardDelete(order);
                      }}
                      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {hardDeleteBusyId === order.id ? "กำลังลบ…" : "ลบถาวร"}
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        กดที่เลขที่ออเดอร์หรือแถวเพื่อดูรายละเอียด · ชุดโปร (เลือกไม้) แสดงจำนวนชิ้นในชุดแยกจากจำนวนรายการ
        {onHardDelete
          ? " · ลบถาวรจะคืนสต๊อกแล้วลบออกจากประวัติ"
          : ""}
      </p>
    </div>
  );
}
