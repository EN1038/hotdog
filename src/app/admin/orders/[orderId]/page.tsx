"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { FulfillmentType, OrderStatus, PaymentMethod } from "@prisma/client";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  formatPrice,
} from "@/lib/constants";
import {
  orderGrandTotal,
  orderItemsSubtotal,
} from "@/lib/order-totals";
import { OrderTimeline } from "@/components/customer/OrderTimeline";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { IconBack } from "@/components/icons";
import { LoadingState } from "@/components/LoadingState";

type AdminOrderDetail = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string;
  addressDetail: string | null;
  scheduledAt: string | null;
  note: string | null;
  deliveryFee: string;
  discountAmount: string;
  createdAt: string;
  branch: { id: string; name: string; phone: string | null };
  customer: { phone: string; name: string | null } | null;
  deliveryLocation: { name: string } | null;
  items: Array<{
    id: string;
    itemName: string;
    quantity: number;
    unitPrice: string;
    optionsPrice: string;
    optionsText: string | null;
    note: string | null;
    branchMenuItem?: { imageUrl: string | null } | null;
  }>;
};

export default function AdminOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
  const itemCount = order.items.reduce((n, it) => n + it.quantity, 0);
  const itemsTotal = orderItemsSubtotal(order.items);
  const grand = orderGrandTotal(
    order.items,
    order.deliveryFee,
    order.discountAmount,
  );
  const backHref = `/admin/branches/${order.branch.id}?tab=orders`;
  const isFinished =
    order.status === "COMPLETED" || order.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={backHref}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="กลับ"
        >
          <IconBack size={20} />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            รายละเอียดออเดอร์
          </h2>
          <p className="text-sm text-gray-500">{order.branch.name}</p>
        </div>
      </div>

      <div className="space-y-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-gray-900">
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

          <dl className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500">ลูกค้า</dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {order.customerName || order.customer?.name || "—"}
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
                {itemCount} ชิ้น
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
            <div className="sm:col-span-2">
              <dt className="text-xs text-gray-500">หมายเหตุ</dt>
              <dd className="mt-0.5 text-sm text-gray-900">
                {order.note?.trim() || "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">รายการสินค้า</h3>
          <ul className="mt-3 divide-y divide-gray-100">
            {order.items.map((it) => {
              const line =
                (Number(it.unitPrice) + Number(it.optionsPrice)) * it.quantity;
              const imageUrl = it.branchMenuItem?.imageUrl;
              return (
                <li key={it.id} className="flex items-start gap-3 py-3">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={it.itemName}
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xs text-gray-400">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{it.itemName}</p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      ฿{formatPrice(Number(it.unitPrice) + Number(it.optionsPrice))}{" "}
                      × {it.quantity}
                      {it.optionsText ? ` · ${it.optionsText}` : ""}
                      {it.note ? ` · ${it.note}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-gray-900">
                    ฿{formatPrice(line)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

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
            <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
              <span>รวมทั้งสิ้น</span>
              <span className="text-red-600">฿{formatPrice(grand)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
