import { z } from "zod";
import { normalizeChannelPrices } from "@/lib/menu-pricing";

const optionalPositivePrice = z
  .number()
  .positive()
  .nullable()
  .optional();

export const menuPromoFieldsSchema = z.object({
  sellDelivery: z.boolean().optional(),
  sellPickup: z.boolean().optional(),
  sellStorefront: z.boolean().optional(),
  promoEnabled: z.boolean().optional(),
  promoType: z.enum(["AMOUNT", "PERCENT"]).nullable().optional(),
  promoValue: z.number().positive().nullable().optional(),
  promoContinuous: z.boolean().optional(),
  promoStartsAt: z.string().datetime().nullable().optional(),
  promoEndsAt: z.string().datetime().nullable().optional(),
});

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
    isOutOfStock: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    optionGroupIds: z.array(z.string()).optional(),
  })
  .merge(menuChannelPriceSchema)
  .merge(menuPromoFieldsSchema)
  .superRefine(validatePromoFields);

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
    isOutOfStock: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    optionGroupIds: z.array(z.string()).optional(),
  })
  .merge(menuPromoFieldsSchema)
  .superRefine((data, ctx) => {
    if (data.promoEnabled) {
      validatePromoFields(
        {
          promoEnabled: data.promoEnabled,
          promoType: data.promoType,
          promoValue: data.promoValue,
          promoContinuous: data.promoContinuous,
          promoStartsAt: data.promoStartsAt,
          promoEndsAt: data.promoEndsAt,
        },
        ctx,
      );
    }
  });

function validatePromoFields(
  data: {
    promoEnabled?: boolean;
    promoType?: "AMOUNT" | "PERCENT" | null;
    promoValue?: number | null;
    promoContinuous?: boolean;
    promoStartsAt?: string | null;
    promoEndsAt?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (!data.promoEnabled) return;
  if (!data.promoType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "เลือกประเภทส่วนลด",
      path: ["promoType"],
    });
  }
  if (data.promoValue == null || data.promoValue <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ใส่ค่าส่วนลด",
      path: ["promoValue"],
    });
  }
  if (data.promoType === "PERCENT" && (data.promoValue ?? 0) > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "เปอร์เซ็นต์ต้องไม่เกิน 100",
      path: ["promoValue"],
    });
  }
  if (!data.promoContinuous) {
    if (!data.promoStartsAt || !data.promoEndsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ระบุวันเริ่มและวันสิ้นสุดโปรโมชั่น",
        path: ["promoStartsAt"],
      });
    } else if (
      new Date(data.promoStartsAt).getTime() >
      new Date(data.promoEndsAt).getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "วันสิ้นสุดต้องหลังวันเริ่ม",
        path: ["promoEndsAt"],
      });
    }
  }
}

export function buildMenuPricingWriteData(
  body: {
    price?: number;
    pickupPrice?: number | null;
    storefrontPrice?: number | null;
    sellDelivery?: boolean;
    sellPickup?: boolean;
    sellStorefront?: boolean;
    promoEnabled?: boolean;
    promoType?: "AMOUNT" | "PERCENT" | null;
    promoValue?: number | null;
    promoContinuous?: boolean;
    promoStartsAt?: string | null;
    promoEndsAt?: string | null;
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

  // If patch only changes promo/channel flags without touching prices,
  // still rewrite normalized prices when price fields were in the body
  // or when creating. For patch without price keys, keep existing unless
  // delivery price was updated.
  const touchPrices =
    body.price !== undefined ||
    body.pickupPrice !== undefined ||
    body.storefrontPrice !== undefined ||
    !existing;

  const promoEnabled = body.promoEnabled ?? false;
  const promoContinuous = body.promoContinuous ?? false;

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
    ...(body.promoEnabled !== undefined && {
      promoEnabled: body.promoEnabled,
    }),
    ...(body.promoType !== undefined && {
      promoType: promoEnabled ? body.promoType : null,
    }),
    ...(body.promoValue !== undefined && {
      promoValue: promoEnabled ? body.promoValue : null,
    }),
    ...(body.promoContinuous !== undefined && {
      promoContinuous: body.promoContinuous,
    }),
    ...(body.promoStartsAt !== undefined || body.promoEnabled !== undefined
      ? {
          promoStartsAt:
            promoEnabled && !promoContinuous && body.promoStartsAt
              ? new Date(body.promoStartsAt)
              : null,
        }
      : {}),
    ...(body.promoEndsAt !== undefined || body.promoEnabled !== undefined
      ? {
          promoEndsAt:
            promoEnabled && !promoContinuous && body.promoEndsAt
              ? new Date(body.promoEndsAt)
              : null,
        }
      : {}),
  };
}
