import { z } from "zod";
import { normalizeChannelPrices } from "@/lib/menu-pricing";

const optionalPositivePrice = z
  .number()
  .positive()
  .nullable()
  .optional();

export const menuChannelPriceSchema = z.object({
  price: z.number().positive(),
  pickupPrice: optionalPositivePrice,
  storefrontPrice: optionalPositivePrice,
});

export const menuItemCreateSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    categoryId: z.string().nullable().optional(),
    imageUrl: z.string().optional().nullable(),
    isHidden: z.boolean().optional(),
    hideFromStaff: z.boolean().optional(),
    isOutOfStock: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    optionGroupIds: z.array(z.string()).optional(),
    sellDelivery: z.boolean().optional(),
    sellPickup: z.boolean().optional(),
    sellStorefront: z.boolean().optional(),
  })
  .merge(menuChannelPriceSchema);

export const menuItemPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    price: z.number().positive().optional(),
    pickupPrice: optionalPositivePrice,
    storefrontPrice: optionalPositivePrice,
    description: z.string().optional().nullable(),
    categoryId: z.string().nullable().optional(),
    imageUrl: z.string().optional().nullable(),
    isHidden: z.boolean().optional(),
    hideFromStaff: z.boolean().optional(),
    isOutOfStock: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    optionGroupIds: z.array(z.string()).optional(),
    sellDelivery: z.boolean().optional(),
    sellPickup: z.boolean().optional(),
    sellStorefront: z.boolean().optional(),
  })
  .merge(menuChannelPriceSchema.partial());

export function buildMenuPricingWriteData(
  body: {
    price?: number;
    pickupPrice?: number | null;
    storefrontPrice?: number | null;
    sellDelivery?: boolean;
    sellPickup?: boolean;
    sellStorefront?: boolean;
  },
  existing?: {
    price: { toString(): string } | number | string;
    pickupPrice?: { toString(): string } | number | string | null;
    storefrontPrice?: { toString(): string } | number | string | null;
  },
) {
  const deliveryPrice =
    body.price ??
    (existing ? Number(existing.price) : undefined);
  if (deliveryPrice == null || !Number.isFinite(deliveryPrice)) {
    return null;
  }

  const pickupRaw =
    body.pickupPrice !== undefined
      ? body.pickupPrice
      : existing?.pickupPrice != null
        ? Number(existing.pickupPrice)
        : null;
  const storefrontRaw =
    body.storefrontPrice !== undefined
      ? body.storefrontPrice
      : existing?.storefrontPrice != null
        ? Number(existing.storefrontPrice)
        : null;

  const prices = normalizeChannelPrices({
    price: deliveryPrice,
    pickupPrice:
      body.pickupPrice === null
        ? null
        : pickupRaw != null && Number.isFinite(pickupRaw)
          ? pickupRaw
          : null,
    storefrontPrice:
      body.storefrontPrice === null
        ? null
        : storefrontRaw != null && Number.isFinite(storefrontRaw)
          ? storefrontRaw
          : null,
  });

  const touchPrices =
    body.price !== undefined ||
    body.pickupPrice !== undefined ||
    body.storefrontPrice !== undefined ||
    !existing;

  return {
    ...(touchPrices
      ? {
          price: prices.price,
          pickupPrice: prices.pickupPrice,
          storefrontPrice: prices.storefrontPrice,
        }
      : {}),
    ...(body.sellDelivery !== undefined && {
      sellDelivery: body.sellDelivery,
    }),
    ...(body.sellPickup !== undefined && { sellPickup: body.sellPickup }),
    ...(body.sellStorefront !== undefined && {
      sellStorefront: body.sellStorefront,
    }),
  };
}
