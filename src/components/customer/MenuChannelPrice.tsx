"use client";

import { formatPrice } from "@/lib/constants";
import type { MenuItemData } from "@/lib/customer-types";
import {
  fulfillmentToChannel,
  isChannelSellEnabled,
  resolveSellPrice,
  type PromoResult,
} from "@/lib/menu-pricing";
import type { FulfillmentType } from "@prisma/client";

export function menuItemVisibleForFulfillment(
  item: MenuItemData,
  fulfillment: FulfillmentType,
): boolean {
  const channel = fulfillmentToChannel(fulfillment);
  return isChannelSellEnabled(item, channel);
}

export function menuItemSellPrice(
  item: MenuItemData,
  fulfillment: FulfillmentType,
): PromoResult {
  return resolveSellPrice(item, fulfillmentToChannel(fulfillment));
}

export function MenuPromoPrice({
  priced,
  className = "",
}: {
  priced: PromoResult;
  className?: string;
}) {
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-1.5 ${className}`}>
      <span className="font-bold text-site-primary">
        ฿{formatPrice(priced.final)}
      </span>
      {priced.discounted && (
        <span className="text-xs font-normal text-gray-400 line-through">
          ฿{formatPrice(priced.original)}
        </span>
      )}
    </span>
  );
}

export function MenuPromoBadge({
  label,
  className = "",
}: {
  label: string | null | undefined;
  className?: string;
}) {
  if (!label) return null;
  return (
    <span
      className={`absolute left-1 top-1 z-[1] rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm ${className}`}
    >
      {label}
    </span>
  );
}

export function MenuBestSellerTag({
  show,
  className = "",
}: {
  show?: boolean;
  className?: string;
}) {
  if (!show) return null;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 ${className}`}
    >
      ขายดี
    </span>
  );
}
