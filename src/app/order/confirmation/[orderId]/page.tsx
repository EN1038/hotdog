"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FULFILLMENT_LABELS,
  PAYMENT_METHOD_LABELS,
  formatPrice,
} from "@/lib/constants";
import type { OrderData } from "@/lib/customer-types";
import { orderGrandTotal } from "@/lib/customer-types";
import { OrderConfirmationTimeline } from "@/components/customer/OrderConfirmationTimeline";
import { LoadingState } from "@/components/LoadingState";
import {
  IconBack,
  IconBank,
  IconBell,
  IconBranchPlaceholder,
  IconCash,
  IconCheck,
  IconClock,
  IconLock,
  IconPhone,
  IconPin,
  IconReceipt,
  IconSkewerPlaceholder,
  IconStore,
  IconUser,
} from "@/components/icons";

type ConfirmationOrder = OrderData & {
  branch: OrderData["branch"] & {
    address?: string | null;
    isOpen?: boolean;
    allowAdvanceOrder?: boolean;
    closesAt?: string | null;
    brand?: { name: string } | null;
  };
  items: Array<
    OrderData["items"][number] & {
      branchMenuItem?: { imageUrl?: string | null } | null;
    }
  >;
};

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return phone;
  return `${digits.slice(0, 2)}x-xxx-${digits.slice(-4)}`;
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-site-primary-soft text-site-primary">
          <Icon size={16} />
        </span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <span className="shrink-0 text-right text-sm font-medium text-gray-900">
        {value}
      </span>
    </div>
  );
}

export default function ConfirmationPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<ConfirmationOrder | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

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
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!authRequired) return;
    const returnTo = `/order/confirmation/${orderId}`;
    router.replace(
      `/order/login?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [authRequired, orderId, router]);

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
        <Link href="/order/history" className="text-sm text-site-primary hover:underline">
          ไปประวัติการสั่ง
        </Link>
        <Link href="/order" className="text-site-primary underline">
          กลับหน้าเมนู
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

  const scheduled = order.scheduledAt
    ? new Date(order.scheduledAt).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const branch = order.branch;
  const shopName = branch.brand?.name ?? branch.name;
  const shopClosedHint =
    !branch.isOpen && branch.closesAt
      ? `ร้านจะเปิดอีกครั้ง ${branch.closesAt}`
      : !branch.isOpen
        ? "รอร้านเปิดเพื่อยืนยันออเดอร์"
        : null;

  const PaymentIcon =
    order.paymentMethod === "CASH"
      ? IconCash
      : order.paymentMethod === "TRANSFER"
        ? IconBank
        : IconBank;

  return (
    <main className="min-h-screen bg-[#f5f5f6] pb-28">
      <header className="sticky top-0 z-10 border-b bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/order/store/${branch.id}`}
            className="flex h-9 w-9 items-center justify-center text-gray-600"
            aria-label="กลับ"
          >
            <IconBack size={22} />
          </Link>
          <h1 className="font-bold text-gray-900">ยืนยันคำสั่งซื้อสำเร็จ</h1>
        </div>
      </header>

      <div className="flex flex-col items-center px-4 pt-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white">
            <IconCheck size={30} />
          </div>
        </div>
        <h2 className="mt-3 text-xl font-bold text-green-600">สั่งซื้อสำเร็จ</h2>
        <p className="mt-1 text-center text-sm leading-relaxed text-gray-500">
          ออเดอร์ของคุณถูกบันทึกแล้ว
          <br />
          ระบบจะเริ่มทำออเดอร์เมื่อร้านเปิด
        </p>
      </div>

      <div className="mx-4 mt-5 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-site-primary text-white">
          <IconReceipt size={22} />
        </span>
        <div>
          <p className="text-xs text-gray-500">เลขที่ออเดอร์</p>
          <p className="text-2xl font-bold text-site-primary">#{order.orderNumber}</p>
        </div>
      </div>

      <div className="mx-4 mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex gap-3">
          {branch.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branch.imageUrl}
              alt={shopName}
              className="h-16 w-16 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-site-primary-soft">
              <IconBranchPlaceholder size={36} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900">{shopName}</p>
            {branch.address && (
              <p className="mt-0.5 flex items-start gap-1 text-xs text-gray-500">
                <IconPin size={12} className="mt-0.5 shrink-0 text-gray-400" />
                <span className="line-clamp-2">{branch.address}</span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {!branch.isOpen && (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <IconLock size={10} />
                  ร้านปิด
                </span>
              )}
              {!branch.isOpen && branch.allowAdvanceOrder && (
                <span className="rounded-md bg-site-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-site-primary">
                  สั่งล่วงหน้าได้
                </span>
              )}
              {branch.isOpen && (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                  ร้านเปิด
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-3 text-sm font-bold text-gray-900">สถานะออเดอร์</p>
          <OrderConfirmationTimeline
            status={order.status}
            fulfillmentType={order.fulfillmentType}
            shopClosedHint={shopClosedHint}
          />
        </div>
      </div>

      <div className="mx-4 mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white px-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <InfoRow
          icon={IconStore}
          label="วิธีรับสินค้า"
          value={FULFILLMENT_LABELS[order.fulfillmentType]}
        />
        {scheduled && (
          <InfoRow
            icon={IconClock}
            label="เวลารับสินค้า"
            value={`${scheduled} เป็นต้นไป`}
          />
        )}
        <InfoRow
          icon={PaymentIcon}
          label="วิธีชำระเงิน"
          value={PAYMENT_METHOD_LABELS[order.paymentMethod]}
        />
        <InfoRow
          icon={IconUser}
          label="ชื่อผู้สั่ง"
          value={order.customerName}
        />
        <InfoRow
          icon={IconPhone}
          label="เบอร์โทร"
          value={maskPhone(order.customerPhone)}
        />
      </div>

      <div className="mx-4 mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">รายการสั่งซื้อ</p>
          <Link
            href={`/order/history/${order.id}`}
            className="text-xs font-medium text-site-primary"
          >
            ดูรายละเอียด
          </Link>
        </div>
        <div className="space-y-3">
          {order.items.map((it) => {
            const imageUrl = it.branchMenuItem?.imageUrl;
            return (
              <div key={it.id} className="flex items-center gap-3">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={it.itemName}
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-site-primary-soft">
                    <IconSkewerPlaceholder size={28} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {it.itemName}{" "}
                    <span className="text-gray-400">x{it.quantity}</span>
                  </p>
                  {it.optionsText && (
                    <p className="text-xs text-gray-400">{it.optionsText}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold text-gray-900">
                  ฿
                  {formatPrice(
                    (Number(it.unitPrice) + Number(it.optionsPrice)) *
                      it.quantity,
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-sm font-medium text-gray-700">รวมทั้งสิ้น</span>
          <span className="text-lg font-bold text-site-primary">
            ฿{formatPrice(orderGrandTotal(order))}
          </span>
        </div>
      </div>

      <p className="mx-4 mt-3 flex items-center gap-2 rounded-2xl bg-site-primary-soft px-4 py-3 text-xs leading-relaxed text-site-primary">
        <IconBell size={16} className="shrink-0" />
        เมื่อร้านเปิด ระบบจะแจ้งสถานะออเดอร์ให้โดยอัตโนมัติ
      </p>

      <div className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 gap-2 border-t bg-white p-4">
        <Link
          href="/order/history"
          className="flex flex-1 items-center justify-center rounded-xl border border-site-primary py-3 text-center text-sm font-semibold text-site-primary"
        >
          ดูประวัติคำสั่งซื้อ
        </Link>
        <Link
          href={`/order/store/${branch.id}`}
          className="flex flex-1 items-center justify-center rounded-xl bg-site-primary py-3 text-center text-sm font-semibold text-white hover:opacity-90"
        >
          กลับหน้าเมนู
        </Link>
      </div>
    </main>
  );
}
