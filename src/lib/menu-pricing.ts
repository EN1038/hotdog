import type { FulfillmentType, MenuPromoType } from "@prisma/client";

export type MenuPriceChannel = "delivery" | "pickup" | "storefront";

export type MenuPricingFields = {
  price: number | string | { toString(): string };
  pickupPrice?: number | string | { toString(): string } | null;
  storefrontPrice?: number | string | { toString(): string } | null;
  sellDelivery?: boolean;
  sellPickup?: boolean;
  sellStorefront?: boolean;
  promoEnabled?: boolean;
  promoType?: MenuPromoType | null;
  promoValue?: number | string | { toString(): string } | null;
  promoContinuous?: boolean;
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

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isPromoActive(
  item: MenuPricingFields,
  now: Date = new Date(),
): boolean {
  if (!item.promoEnabled) return false;
  if (!item.promoType) return false;
  const value = toNumber(item.promoValue);
  if (value == null || value <= 0) return false;
  if (item.promoContinuous) return true;
  const start = asDate(item.promoStartsAt);
  const end = asDate(item.promoEndsAt);
  if (!start || !end) return false;
  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
}

export function formatPromoLabel(
  promoType: MenuPromoType,
  promoValue: number,
): string {
  if (promoType === "PERCENT") {
    const pct = Number.isInteger(promoValue)
      ? String(promoValue)
      : String(roundMoney(promoValue));
    return `ลด ${pct}%`;
  }
  const amount = Number.isInteger(promoValue)
    ? String(promoValue)
    : promoValue.toLocaleString("th-TH", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
  return `ลด ฿${amount}`;
}

/**
 * Apply promo to a base channel price.
 * Does not apply to storefront (caller should skip) or options.
 */
export function applyPromo(
  basePrice: number,
  item: MenuPricingFields,
  now: Date = new Date(),
): PromoResult {
  const original = roundMoney(basePrice);
  if (!isPromoActive(item, now) || !item.promoType) {
    return {
      final: original,
      original,
      discounted: false,
      label: null,
      savings: 0,
    };
  }
  const promoValue = toNumber(item.promoValue) ?? 0;
  let final = original;
  if (item.promoType === "PERCENT") {
    final = original * (1 - promoValue / 100);
  } else {
    final = original - promoValue;
  }
  final = roundMoney(Math.max(0, final));
  const savings = roundMoney(Math.max(0, original - final));
  if (savings <= 0) {
    return {
      final: original,
      original,
      discounted: false,
      label: null,
      savings: 0,
    };
  }
  return {
    final,
    original,
    discounted: true,
    label: formatPromoLabel(item.promoType, promoValue),
    savings,
  };
}

/** Price for online order channels (delivery/pickup) including active promo. */
export function resolveSellPrice(
  item: MenuPricingFields,
  channel: Exclude<MenuPriceChannel, "storefront">,
  now: Date = new Date(),
): PromoResult {
  const base = resolveChannelPrice(item, channel);
  return applyPromo(base, item, now);
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
