import { OrderStatus, type FulfillmentType } from "@prisma/client";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_COLORS,
  canStaffCancel,
  getAllowedNextStatuses,
  getStaffLegendStatuses,
  getStaffStatusLabel,
  type StaffRole,
} from "@/lib/constants";
import { IconArrowRight, IconLabel, IconNote } from "@/components/icons";
import { CustomerTypeBadge } from "@/components/CustomerTypeBadge";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { distanceKm, formatDistanceKm, hasMapPin } from "@/lib/geo";

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
  customerPhone?: string;
  isNewCustomer?: boolean;
  note?: string | null;
  cancelReason?: string | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  createdAt: string;
  createdByStaffId?: string | null;
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
  /** Branch pin — used to show delivery distance */
  branchPin?: { latitude: number; longitude: number } | null;
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

export function OrderCard({
  order,
  roles = [],
  onStatusChange,
  onRequestCancel,
  showActions = false,
  branchPin = null,
}: OrderCardProps) {
  const colorClass = ORDER_STATUS_COLORS[order.status];
  const fulfillment = order.fulfillmentType ?? "DELIVERY";
  const allowed =
    showActions && roles.length > 0
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
      className={`flex flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-sm ${colorClass}`}
    >
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-bold tracking-tight text-gray-900">
              {order.orderNumber ? `#${order.orderNumber}` : "ออเดอร์"}
            </p>
            <p className="mt-0.5 text-sm font-medium text-gray-700">
              {locationLabel}
            </p>
            {order.createdByStaffId ? (
              <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
                คีย์โดยพนักงาน
              </span>
            ) : null}
            {order.deliveryLocation?.isCustomAddress ? (
              <span className="mt-1 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                ที่อยู่ลูกค้า
              </span>
            ) : null}
            {deliveryDistanceLabel ? (
              <p className="mt-1.5 text-sm font-bold text-sky-800">
                ห่างจากร้าน ~{deliveryDistanceLabel}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-gray-800 ring-1 ring-black/5">
            {getStaffStatusLabel(order.status, roles)}
          </span>
        </div>

        {order.addressDetail ? (
          <p
            className={`mt-2 text-base text-gray-800 ${
              order.deliveryLocation?.isCustomAddress
                ? "rounded-xl bg-sky-50 px-3 py-2 font-medium text-sky-950"
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-sm text-gray-600">
            {order.customerName || order.customer?.name || "-"}
          </p>
          {typeof order.isNewCustomer === "boolean" && (
            <CustomerTypeBadge isNewCustomer={order.isNewCustomer} />
          )}
        </div>

        {contactPhone && !contactPhone.startsWith("walkin:") ? (
          <div className="mt-2">
            <PhoneCallButton
              phone={contactPhone}
              showNumber
              size={18}
              className="min-h-11 px-3.5 py-2.5 text-base"
            />
          </div>
        ) : null}

        {order.note ? (
          <p className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-800">
            <IconLabel
              icon={IconNote}
              size={14}
              iconClassName="text-orange-600"
            >
              {order.note}
            </IconLabel>
          </p>
        ) : null}

        {order.status === OrderStatus.CANCELLED && order.cancelReason ? (
          <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            เหตุผลยกเลิก: {order.cancelReason}
          </p>
        ) : null}

        <ul className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-xl bg-white/70 ring-1 ring-black/5">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 px-3 py-2.5 text-sm text-gray-900"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-800">
                {item.quantity}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-medium leading-snug">
                  {(item.itemName || item.branchMenuItem?.name) ?? "-"}
                </p>
                {item.optionsText ? (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {item.optionsText}
                  </p>
                ) : null}
                {item.note ? (
                  <p className="mt-0.5 text-xs text-orange-600">{item.note}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-right text-base font-bold text-gray-900">
          รวม {total.toLocaleString("th-TH")} บาท
        </p>
      </div>

      {showActions && hasActions ? (
        <div className="border-t border-black/10 bg-white/90 p-3">
          {primary ? (
            <button
              type="button"
              onClick={() => onStatusChange?.(order.id, primary)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-site-primary px-4 text-base font-bold text-white shadow-sm active:scale-[0.98] hover:opacity-95"
            >
              {getStaffStatusLabel(primary, roles)}
              <IconArrowRight size={18} />
            </button>
          ) : null}

          {(secondary.length > 0 || showCancel) && (
            <div
              className={`grid gap-2 ${primary ? "mt-2" : ""} ${
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
                  className="flex min-h-11 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 active:bg-gray-50"
                >
                  {getStaffStatusLabel(status, roles)}
                </button>
              ))}
              {showCancel && onRequestCancel ? (
                <button
                  type="button"
                  onClick={() => onRequestCancel(order.id)}
                  className={`flex min-h-11 items-center justify-center rounded-xl border-2 border-red-300 bg-red-50 px-3 text-sm font-semibold text-red-700 active:bg-red-100 ${
                    secondary.length === 0 ? "col-span-full" : ""
                  }`}
                >
                  ยกเลิก
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function StatusLegend({
  roles = [],
  autoAcceptOrders = false,
  value,
  onChange,
}: {
  roles?: StaffRole[];
  autoAcceptOrders?: boolean;
  value?: OrderStatus | null;
  onChange?: (status: OrderStatus) => void;
}) {
  const statuses = getStaffLegendStatuses(roles, { autoAcceptOrders });
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
          return (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange?.(status)}
              className={`min-h-11 min-w-0 flex-1 cursor-pointer border-b-2 px-1 py-2.5 text-center text-xs font-semibold leading-tight transition-colors sm:text-sm ${
                selected
                  ? "-mb-px border-site-primary text-site-primary"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <span className="block truncate">
                {getStaffStatusLabel(status, roles)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
