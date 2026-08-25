import type { FulfillmentType } from "@prisma/client";

export type MenuPriceChannel = "delivery" | "pickup" | "storefront";

export type MenuPricingFields = {
  price: number | string | { toString(): string };
  pickupPrice?: number | string | { toString(): string } | null;
  storefrontPrice?: number | string | { toString(): string } | null;
  sellDelivery?: boolean;
  sellPickup?: boolean;
  sellStorefront?: boolean;
  promoEnabled?: boolean | null;
  promoType?: "AMOUNT" | "PERCENT" | string | null;
  promoValue?: number | string | { toString(): string } | null;
  promoContinuous?: boolean | null;
  promoStartsAt?: Date | string | null;
  promoEndsAt?: Date | string | null;
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

/** Sell price for a channel, applying active item-level promo when set. */
export function resolveSellPrice(
  item: MenuPricingFields,
  channel: MenuPriceChannel,
  now = new Date(),
): PromoResult {
  const base = resolveChannelPrice(item, channel);
  if (!item.promoEnabled || !item.promoType || item.promoValue == null) {
    return {
      final: base,
      original: base,
      discounted: false,
      label: null,
      savings: 0,
    };
  }

  const continuous = item.promoContinuous === true;
  if (!continuous) {
    const start =
      item.promoStartsAt != null ? new Date(item.promoStartsAt) : null;
    const end = item.promoEndsAt != null ? new Date(item.promoEndsAt) : null;
    if (start && !Number.isNaN(start.getTime()) && now < start) {
      return {
        final: base,
        original: base,
        discounted: false,
        label: null,
        savings: 0,
      };
    }
    if (end && !Number.isNaN(end.getTime()) && now > end) {
      return {
        final: base,
        original: base,
        discounted: false,
        label: null,
        savings: 0,
      };
    }
  }

  const value = toNumber(item.promoValue) ?? 0;
  let final = base;
  let label: string | null = null;
  if (item.promoType === "PERCENT") {
    const pct = Math.min(90, Math.max(0, value));
    final = roundMoney(base * (1 - pct / 100));
    label = `ลด ${pct}%`;
  } else if (item.promoType === "AMOUNT") {
    final = roundMoney(Math.max(0, base - value));
    label = `ลด ฿${roundMoney(value)}`;
  } else {
    return {
      final: base,
      original: base,
      discounted: false,
      label: null,
      savings: 0,
    };
  }

  const savings = roundMoney(Math.max(0, base - final));
  return {
    final,
    original: base,
    discounted: savings > 0,
    label,
    savings,
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
