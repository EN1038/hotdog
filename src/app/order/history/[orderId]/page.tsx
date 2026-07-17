"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  canCustomerCancel,
  formatPrice,
  isActiveOrderStatus,
  telHref,
} from "@/lib/constants";
import type { OrderData } from "@/lib/customer-types";
import { orderGrandTotal, orderItemsTotal } from "@/lib/customer-types";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { useCustomer } from "@/components/customer/CustomerProvider";
import { useConfirm } from "@/components/ConfirmDialog";
import { OrderTimeline } from "@/components/customer/OrderTimeline";
import { LoadingState } from "@/components/LoadingState";
import {
  IconBack,
  IconBag,
  IconCard,
  IconClose,
  IconHome,
  IconMoney,
  IconNote,
  IconPackage,
  IconPhone,
  IconPin,
  IconRefresh,
  IconSkewerPlaceholder,
  IconUser,
} from "@/components/icons";

type OrderDetail = OrderData & {
  branch: OrderData["branch"] & { phone?: string | null };
  items: Array<
    OrderData["items"][number] & {
      branchMenuItemId: string;
      branchMenuItem?: { imageUrl?: string | null } | null;
    }
  >;
};

function ContactStoreButton({
  branchId,
  phone,
}: {
  branchId: string;
  phone?: string | null;
}) {
  const className =
    "flex w-full items-center justify-center rounded-xl border border-gray-300 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50";

  if (phone) {
    return (
      <a href={`tel:${phone}`} className={className}>
        ติดต่อหน้าร้าน
      </a>
    );
  }

  return (
    <Link href={`/order/store/${branchId}`} className={className}>
      ติดต่อหน้าร้าน
    </Link>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  valueClassName = "text-gray-900",
  href,
}: {
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-gray-500">
        <Icon size={14} className="shrink-0" />
        <span className="text-sm">{label}</span>
      </div>
      {href ? (
        <a
          href={href}
          className={`shrink-0 text-right text-sm font-semibold underline underline-offset-2 ${valueClassName}`}
        >
          {value}
        </a>
      ) : (
        <span
          className={`shrink-0 text-right text-sm font-medium ${valueClassName}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const { addLine, setFulfillment } = useCustomer();
  const { confirm } = useConfirm();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/customer/orders/${orderId}`);
    if (res.status === 401) {
      setAuthRequired(true);
      return;
    }
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    setAuthRequired(false);
    setNotFound(false);
    setOrder(await res.json());
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  usePollingRefresh(load, {
    enabled: order != null && isActiveOrderStatus(order.status),
    intervalMs: 10_000,
  });

  useEffect(() => {
    if (!authRequired) return;
    router.replace(
      `/order/login?returnTo=${encodeURIComponent(`/order/history/${orderId}`)}`,
    );
  }, [authRequired, orderId, router]);

  async function cancelOrder() {
    const ok = await confirm({
      title: "ยกเลิกออเดอร์?",
      message: "ยืนยันยกเลิกออเดอร์นี้ — การกระทำนี้อาจไม่สามารถย้อนกลับได้",
      confirmLabel: "ยกเลิกออเดอร์",
    });
    if (!ok) return;
    setError("");
    setCancelling(true);
    try {
      const res = await fetch(`/api/customer/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "ยกเลิกไม่สำเร็จ");
        return;
      }
      setOrder(data);
    } finally {
      setCancelling(false);
    }
  }

  function reorder() {
    if (!order) return;
    setError("");
    setReordering(true);
    try {
      setFulfillment(order.fulfillmentType);
      for (const it of order.items) {
        addLine(order.branch.id, {
          branchMenuItemId: it.branchMenuItemId,
          name: it.itemName,
          unitPrice: Number(it.unitPrice),
          quantity: it.quantity,
          optionIds: [],
          optionNames: it.optionsText
            ? it.optionsText.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          optionsPrice: Number(it.optionsPrice),
          note: it.note ?? undefined,
        });
      }
      router.push(`/order/store/${order.branch.id}`);
    } finally {
      setReordering(false);
    }
  }

  if (authRequired) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f5f5f6] px-4">
        <LoadingState
          className="w-full max-w-sm border-0 bg-transparent shadow-none"
          label="กำลังพาไปหน้าใส่เบอร์เพื่อดูออเดอร์..."
        />
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f5f5f6]">
        <p className="text-gray-500">ไม่พบออเดอร์</p>
        <Link href="/order/history" className="text-site-primary underline">
          กลับหน้าประวัติ
        </Link>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f6] px-4">
        <LoadingState className="w-full max-w-sm border-0 bg-transparent shadow-none" />
      </main>
    );
  }

  const created = new Date(order.createdAt);
  const cancellable = canCustomerCancel(order.status);
  const canReorder = order.status === OrderStatus.COMPLETED;
  const showContactStore = order.status !== OrderStatus.COMPLETED;
  const isFinished =
    order.status === OrderStatus.COMPLETED ||
    order.status === OrderStatus.CANCELLED;
  const itemCount = order.items.reduce((s, it) => s + it.quantity, 0);
  const hasFooter = showContactStore || cancellable || canReorder;
  const footerPadding = cancellable ? "pb-52" : hasFooter ? "pb-36" : "pb-8";

  return (
    <main className={`min-h-screen bg-[#f5f5f6] ${footerPadding}`}>
      <header className="sticky top-0 z-10 border-b bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/order/history"
            className="flex h-9 w-9 items-center justify-center text-gray-600"
            aria-label="กลับ"
          >
            <IconBack size={22} />
          </Link>
          <h1 className="font-bold text-gray-900">รายละเอียดคำสั่งซื้อ</h1>
        </div>
      </header>

      <div className="mx-4 mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-bold text-gray-900">#{order.orderNumber}</p>
            <p className="text-xs text-gray-500">
              {created.toLocaleDateString("th-TH", {
                day: "numeric",
                month: "short",
                year: "2-digit",
              })}{" "}
              •{" "}
              {created.toLocaleTimeString("th-TH", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_BADGE[order.status]}`}
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

        <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100 pt-1">
          <DetailRow
            icon={IconBag}
            label="จำนวนรายการ"
            value={`${itemCount} รายการ`}
          />
          <DetailRow
            icon={IconMoney}
            label="ราคารวม"
            value={`฿${formatPrice(orderGrandTotal(order))}`}
            valueClassName="text-site-primary"
          />
          <DetailRow
            icon={IconPackage}
            label="ประเภทการรับ"
            value={FULFILLMENT_LABELS[order.fulfillmentType]}
            valueClassName="text-site-primary"
          />
          <DetailRow
            icon={IconCard}
            label="ช่องทางชำระเงิน"
            value={PAYMENT_METHOD_LABELS[order.paymentMethod]}
          />
          <DetailRow
            icon={IconNote}
            label="หมายเหตุ"
            value={order.note || "-"}
          />
        </div>
      </div>

      <div className="mx-4 mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <p className="mb-3 text-sm font-bold text-gray-900">รายการสินค้า</p>
        <div className="space-y-3">
          {order.items.map((it) => {
            const imageUrl = it.branchMenuItem?.imageUrl;
            const linePrice =
              (Number(it.unitPrice) + Number(it.optionsPrice)) * it.quantity;
            const unitLine = `฿${formatPrice(Number(it.unitPrice) + Number(it.optionsPrice))} x ${it.quantity}`;

            return (
              <div key={it.id} className="flex items-start gap-3">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={it.itemName}
                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-site-primary-soft">
                    <IconSkewerPlaceholder size={32} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {it.itemName}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                    {unitLine}
                    {it.optionsText && ` • ${it.optionsText}`}
                    {it.note && ` • ${it.note}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-gray-900">
                  ฿{formatPrice(linePrice)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mx-4 mt-3 rounded-2xl border border-gray-100 bg-white p-4 text-sm shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <p className="mb-2 font-bold text-gray-900">สรุปการสั่งซื้อ</p>
        <div className="flex justify-between py-1 text-gray-700">
          <span>รวมค่าสินค้า</span>
          <span>฿{formatPrice(orderItemsTotal(order.items))}</span>
        </div>
        <div className="flex justify-between py-1 text-gray-700">
          <span>ค่าส่ง</span>
          <span>฿{formatPrice(order.deliveryFee)}</span>
        </div>
        <div className="flex justify-between py-1 text-gray-700">
          <span>ส่วนลด</span>
          <span>-฿{formatPrice(order.discountAmount)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 font-bold text-gray-900">
          <span>รวมทั้งสิ้น</span>
          <span className="text-site-primary">
            ฿{formatPrice(orderGrandTotal(order))}
          </span>
        </div>
      </div>

      <div className="mx-4 mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <p className="mb-2 font-bold text-gray-900">ข้อมูลการสั่งซื้อ</p>
        <div className="space-y-1">
          <DetailRow
            icon={IconUser}
            label="ชื่อผู้สั่ง"
            value={order.customerName}
          />
          <DetailRow
            icon={IconPhone}
            label="เบอร์โทร"
            value={order.customerPhone}
            href={order.customerPhone ? telHref(order.customerPhone) : undefined}
            valueClassName="text-site-primary"
          />
          {order.deliveryLocation && (
            <DetailRow
              icon={IconPin}
              label="พื้นที่จัดส่ง"
              value={order.deliveryLocation.name}
            />
          )}
          {order.addressDetail && (
            <div className="flex items-start justify-between gap-3 py-2">
              <div className="flex shrink-0 items-center gap-2 text-gray-500">
                <IconHome size={14} />
                <span className="text-sm">ที่อยู่</span>
              </div>
              <span className="text-right text-sm font-medium text-gray-900">
                {order.addressDetail}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-3 text-center text-sm text-red-600">{error}</p>
      )}

      {hasFooter && (
        <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 space-y-2 border-t bg-white p-4">
          {cancellable && (
            <>
              <p className="rounded-xl bg-site-primary-soft px-3 py-2.5 text-center text-xs text-site-primary">
                สามารถยกเลิกออเดอร์ได้ก่อนร้านรับออเดอร์
              </p>
              <button
                type="button"
                onClick={cancelOrder}
                disabled={cancelling}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500 py-3 text-sm font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50"
              >
                {!cancelling && <IconClose size={16} />}
                {cancelling ? "กำลังยกเลิก..." : "ยกเลิกออเดอร์"}
              </button>
            </>
          )}
          {canReorder && (
            <button
              type="button"
              onClick={reorder}
              disabled={reordering}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-site-primary py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <IconRefresh size={16} />
              {reordering ? "กำลังเพิ่มสินค้า..." : "สั่งอีกครั้ง"}
            </button>
          )}
          {showContactStore && (
            <ContactStoreButton
              branchId={order.branch.id}
              phone={order.branch.phone}
            />
          )}
        </div>
      )}
    </main>
  );
}
