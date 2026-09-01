export const ORDER_DISCOUNT_REASONS = [
  { id: "aged_stock", label: "ของค้าง / clearance" },
  { id: "bundle_promo", label: "โปรแพ็ก / 10+1" },
  { id: "regular_customer", label: "ลูกค้าประจำ" },
  { id: "negotiation", label: "ต่อรอง" },
  { id: "other", label: "อื่นๆ" },
] as const;

export type OrderDiscountReasonId =
  (typeof ORDER_DISCOUNT_REASONS)[number]["id"];

const REASON_IDS = new Set<string>(
  ORDER_DISCOUNT_REASONS.map((r) => r.id),
);

export function resolveOrderDiscountReasonLabel(
  reasonId: string | null | undefined,
  note?: string | null,
): string | null {
  if (!reasonId?.trim()) return null;
  const id = reasonId.trim();
  if (id === "other") {
    const t = note?.trim();
    return t || "อื่นๆ";
  }
  const found = ORDER_DISCOUNT_REASONS.find((r) => r.id === id);
  return found?.label ?? id;
}

export function roundDiscountBaht(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

export type ValidateOrderDiscountInput = {
  itemsSubtotal: number;
  deliveryFee?: number;
  discountAmount: number;
  discountReason?: string | null;
  discountReasonNote?: string | null;
};

export type ValidateOrderDiscountResult =
  | { ok: true; discountAmount: number; discountReason: string | null }
  | { ok: false; error: string };

/** Validate order-level discount (Phase 1 — staff / skewer). */
export function validateOrderDiscount(
  input: ValidateOrderDiscountInput,
): ValidateOrderDiscountResult {
  const itemsSubtotal = Math.max(0, Number(input.itemsSubtotal) || 0);
  const deliveryFee = Math.max(0, Number(input.deliveryFee) || 0);
  const preDiscountTotal = itemsSubtotal + deliveryFee;
  const discountAmount = roundDiscountBaht(Number(input.discountAmount) || 0);

  if (!Number.isFinite(discountAmount)) {
    return { ok: false, error: "ส่วนลดไม่ถูกต้อง" };
  }
  if (discountAmount > preDiscountTotal + 0.001) {
    return {
      ok: false,
      error: "ส่วนลดต้องไม่เกินยอดก่อนหักส่วนลด",
    };
  }

  if (discountAmount <= 0) {
    return { ok: true, discountAmount: 0, discountReason: null };
  }

  const reason = input.discountReason?.trim() ?? "";
  if (!reason || !REASON_IDS.has(reason)) {
    return { ok: false, error: "กรุณาเลือกเหตุผลส่วนลด" };
  }
  if (reason === "other") {
    const note = input.discountReasonNote?.trim() ?? "";
    if (note.length < 2) {
      return { ok: false, error: "กรุณาระบุเหตุผลส่วนลด (อย่างน้อย 2 ตัวอักษร)" };
    }
  }

  return { ok: true, discountAmount, discountReason: reason };
}

export function computeOrderGrandTotal(input: {
  itemsSubtotal: number;
  deliveryFee?: number;
  discountAmount?: number;
}): number {
  const itemsSubtotal = Math.max(0, Number(input.itemsSubtotal) || 0);
  const deliveryFee = Math.max(0, Number(input.deliveryFee) || 0);
  const discountAmount = roundDiscountBaht(Number(input.discountAmount) || 0);
  return Math.max(0, Math.round((itemsSubtotal + deliveryFee - discountAmount) * 100) / 100);
}

/** Skewer billing: items + shipping − discount */
export function computeSkewerOrderGrandTotal(input: {
  itemsSubtotal: number;
  shippingCostBaht?: number;
  discountAmount?: number;
}): number {
  return computeOrderGrandTotal({
    itemsSubtotal: input.itemsSubtotal,
    deliveryFee: input.shippingCostBaht ?? 0,
    discountAmount: input.discountAmount,
  });
}
