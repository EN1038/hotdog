import type { FulfillmentType, OrderStatus } from "@prisma/client";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  getAllowedNextStatuses,
  type StaffRole,
} from "@/lib/constants";
import { IconArrowRight, IconLabel, IconNote } from "@/components/icons";

type OrderItem = {
  id: string;
  quantity: number;
  unitPrice: string | number;
  optionsPrice?: string | number;
  optionsText?: string | null;
  note?: string | null;
  itemName: string;
  branchMenuItem?: { name: string } | null;
};

export type OrderCardData = {
  id: string;
  orderNumber?: string;
  status: OrderStatus;
  fulfillmentType?: FulfillmentType;
  addressDetail: string | null;
  customerName?: string;
  note?: string | null;
  createdAt: string;
  customer?: { phone: string; name?: string | null } | null;
  deliveryLocation: { name: string } | null;
  items: OrderItem[];
};

type OrderCardProps = {
  order: OrderCardData;
  roles?: StaffRole[];
  onStatusChange?: (orderId: string, status: OrderStatus) => void;
  showActions?: boolean;
};

export function OrderCard({
  order,
  roles = [],
  onStatusChange,
  showActions = false,
}: OrderCardProps) {
  const colorClass = ORDER_STATUS_COLORS[order.status];
  const fulfillment = order.fulfillmentType ?? "DELIVERY";
  const allowed =
    showActions && roles.length > 0
      ? getAllowedNextStatuses(roles, order.status, fulfillment).filter(
          (s) => s !== order.status,
        )
      : [];

  const total = order.items.reduce(
    (sum, item) =>
      sum +
      (Number(item.unitPrice) + Number(item.optionsPrice ?? 0)) *
        item.quantity,
    0,
  );

  return (
    <div className={`rounded-lg border-2 p-4 ${colorClass}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">
            {order.orderNumber ? `#${order.orderNumber} • ` : ""}
            {fulfillment === "PICKUP"
              ? FULFILLMENT_LABELS.PICKUP
              : (order.deliveryLocation?.name ?? FULFILLMENT_LABELS.DELIVERY)}
          </p>
          {order.addressDetail && (
            <p className="text-sm text-gray-700">{order.addressDetail}</p>
          )}
          <p className="text-xs text-gray-500">
            ลูกค้า: {order.customerName || order.customer?.name || "-"}
            {order.customer?.phone ? ` (${order.customer.phone})` : ""}
          </p>
          {order.note && (
            <p className="text-xs text-orange-600">
              <IconLabel icon={IconNote} size={12} iconClassName="text-orange-600">
                {order.note}
              </IconLabel>
            </p>
          )}
        </div>
        <span className="rounded px-2 py-1 text-xs font-medium text-gray-800">
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>
      <ul className="mb-2 space-y-1 text-sm text-gray-800">
        {order.items.map((item) => (
          <li key={item.id}>
            {(item.itemName || item.branchMenuItem?.name) ?? "-"} x
            {item.quantity}
            {item.optionsText && (
              <span className="text-xs text-gray-500"> ({item.optionsText})</span>
            )}
            {item.note && (
              <span className="text-xs text-orange-600"> — {item.note}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium text-gray-900">
        รวม {total.toLocaleString("th-TH")} บาท
      </p>
      {showActions && allowed.length > 0 && onStatusChange && (
        <div className="mt-3 flex flex-wrap gap-2">
          {allowed.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(order.id, status)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:opacity-80 ${ORDER_STATUS_COLORS[status]}`}
            >
              <IconArrowRight size={12} />
              {ORDER_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
        <span
          key={status}
          className={`rounded border px-2 py-1 ${ORDER_STATUS_COLORS[status]}`}
        >
          {ORDER_STATUS_LABELS[status]}
        </span>
      ))}
    </div>
  );
}
