"use client";

import Link from "next/link";
import { OrderStatus } from "@prisma/client";
import { FULFILLMENT_LABELS, formatPrice } from "@/lib/constants";
import type { OrderData } from "@/lib/customer-types";
import { orderGrandTotal } from "@/lib/customer-types";
import { formatQueueNumber } from "@/lib/order-queue";
import {
  IconBag,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconClose,
  IconDelivery,
  IconStore,
} from "@/components/icons";

export type OrderHistoryFilter =
  | "ALL"
  | "WAITING"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

export const ORDER_HISTORY_FILTERS: { id: OrderHistoryFilter; label: string }[] =
  [
    { id: "ALL", label: "ทั้งหมด" },
    { id: "WAITING", label: "รอรับออเดอร์" },
    { id: "ACTIVE", label: "กำลังจัดส่ง" },
    { id: "COMPLETED", label: "เสร็จสิ้น" },
    { id: "CANCELLED", label: "ยกเลิก" },
  ];

export function pillTabButtonClass(active: boolean) {
  return `shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
    active
      ? "bg-site-primary text-white"
      : "border border-gray-200 bg-white text-gray-600"
  }`;
}

export function matchesOrderHistoryFilter(
  status: OrderStatus,
  filter: OrderHistoryFilter,
): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "WAITING":
      return status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE;
    case "ACTIVE":
      return (
        [
          OrderStatus.PREPARING,
          OrderStatus.READY_FOR_PICKUP,
          OrderStatus.READY_FOR_DELIVERY,
          OrderStatus.DELIVERING,
        ] as OrderStatus[]
      ).includes(status);
    case "COMPLETED":
      return status === OrderStatus.COMPLETED;
    case "CANCELLED":
      return status === OrderStatus.CANCELLED;
  }
}

function getStatusDisplay(status: OrderStatus) {
  switch (status) {
    case OrderStatus.WAITING_FOR_STORE_ACCEPTANCE:
      return {
        label: "รอรับออเดอร์",
        badgeClass: "bg-amber-50 text-amber-600",
        Icon: IconClock,
      };
    case OrderStatus.PREPARING:
    case OrderStatus.READY_FOR_PICKUP:
      return {
        label: "กำลังจัดเตรียม",
        badgeClass: "bg-blue-50 text-blue-600",
        Icon: IconStore,
      };
    case OrderStatus.READY_FOR_DELIVERY:
    case OrderStatus.DELIVERING:
      return {
        label: "กำลังจัดส่ง",
        badgeClass: "bg-blue-50 text-blue-600",
        Icon: IconDelivery,
      };
    case OrderStatus.COMPLETED:
      return {
        label: "เสร็จสิ้น",
        badgeClass: "bg-green-50 text-green-600",
        Icon: IconCheck,
      };
    case OrderStatus.CANCELLED:
      return {
        label: "ยกเลิก",
        badgeClass: "bg-gray-100 text-gray-500",
        Icon: IconClose,
      };
  }
}

export function OrderHistoryFilterBar({
  filter,
  onFilterChange,
}: {
  filter: OrderHistoryFilter;
  onFilterChange: (filter: OrderHistoryFilter) => void;
}) {
  return (
    <div className="border-b border-gray-100 bg-white px-4 pb-3 pt-1">
      <div className="filter-scroll-row flex gap-2 overflow-x-auto">
        {ORDER_HISTORY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={pillTabButtonClass(filter === f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CustomerOrderHistoryList({
  orders,
  emptyMessage = "ไม่มีคำสั่งซื้อ",
}: {
  orders: OrderData[];
  emptyMessage?: string;
}) {
  if (orders.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-sm text-gray-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-3 px-4 pb-4 pt-3">
      {orders.map((o) => {
        const created = new Date(o.createdAt);
        const status = getStatusDisplay(o.status);
        const StatusIcon = status.Icon;
        const itemCount = o.items.reduce((s, it) => s + it.quantity, 0);

        return (
          <Link
            key={o.id}
            href={`/order/history/${o.id}`}
            className="block rounded-2xl border border-gray-100 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-gray-900">
                  คิว {formatQueueNumber(o.queueNumber)}
                  <span className="ml-2 text-sm font-medium text-gray-500">
                    #{o.orderNumber}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {created.toLocaleDateString("th-TH", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  •{" "}
                  {created.toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-medium ${status.badgeClass}`}
                >
                  <StatusIcon size={12} />
                  {status.label}
                </span>
                <IconChevronRight size={18} className="text-gray-300" />
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1 text-gray-500">
                <IconBag size={14} />
                {itemCount} รายการ
              </span>
              <span className="font-bold text-gray-900">
                ฿{formatPrice(orderGrandTotal(o))}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium ${
                  o.fulfillmentType === "DELIVERY"
                    ? "text-emerald-600"
                    : "text-site-primary"
                }`}
              >
                {o.fulfillmentType === "DELIVERY" ? (
                  <IconDelivery size={14} />
                ) : (
                  <IconStore size={14} />
                )}
                {FULFILLMENT_LABELS[o.fulfillmentType]}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
