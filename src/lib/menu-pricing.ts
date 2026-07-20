import type { FulfillmentType } from "@prisma/client";

export type MenuPriceChannel = "delivery" | "pickup" | "storefront";

export type MenuPricingFields = {
  price: number | string | { toString(): string };
  pickupPrice?: number | string | { toString(): string } | null;
  storefrontPrice?: number | string | { toString(): string } | null;
  sellDelivery?: boolean;
  sellPickup?: boolean;
  sellStorefront?: boolean;
};

export type PromoResult = {
  final: number;
  original: number;
  discounted: boolean;
  label: string | null;
  savings: number;
};

function toNumber(
  value: number | string | { toString(): string } | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : Number(typeof value === "string" ? value : value.toString());
  if (!Number.isFinite(n)) return null;
  return n;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fulfillmentToChannel(
  fulfillment: FulfillmentType,
): Exclude<MenuPriceChannel, "storefront"> {
  return fulfillment === "PICKUP" ? "pickup" : "delivery";
}

export function isChannelSellEnabled(
  item: MenuPricingFields,
  channel: MenuPriceChannel,
): boolean {
  if (channel === "delivery") return item.sellDelivery !== false;
  if (channel === "pickup") return item.sellPickup !== false;
  return item.sellStorefront !== false;
}

/** Resolve list price for a channel. Empty pickup/storefront falls back to delivery. */
export function resolveChannelPrice(
  item: MenuPricingFields,
  channel: MenuPriceChannel,
): number {
  const delivery = toNumber(item.price) ?? 0;
  if (channel === "delivery") return roundMoney(delivery);
  if (channel === "pickup") {
    return roundMoney(toNumber(item.pickupPrice) ?? delivery);
  }
  return roundMoney(toNumber(item.storefrontPrice) ?? delivery);
}

/** Sell price for a channel (no item-level promos). */
export function resolveSellPrice(
  item: MenuPricingFields,
  channel: MenuPriceChannel,
): PromoResult {
  const base = resolveChannelPrice(item, channel);
  return {
    final: base,
    original: base,
    discounted: false,
    label: null,
    savings: 0,
  };
}

/** Normalize optional channel prices: empty → delivery price. */
export function normalizeChannelPrices(input: {
  price: number;
  pickupPrice?: number | null;
  storefrontPrice?: number | null;
}): {
  price: number;
  pickupPrice: number;
  storefrontPrice: number;
} {
  const price = roundMoney(input.price);
  return {
    price,
    pickupPrice: roundMoney(
      input.pickupPrice != null && input.pickupPrice > 0
        ? input.pickupPrice
        : price,
    ),
    storefrontPrice: roundMoney(
      input.storefrontPrice != null && input.storefrontPrice > 0
        ? input.storefrontPrice
        : price,
    ),
  };
}
