import { describe, expect, it } from "vitest";
import {
  computeOrderGrandTotal,
  computeSkewerOrderGrandTotal,
  resolveOrderDiscountReasonLabel,
  validateOrderDiscount,
} from "@/lib/order-discount";

describe("validateOrderDiscount", () => {
  it("allows zero discount without reason", () => {
    const r = validateOrderDiscount({
      itemsSubtotal: 100,
      deliveryFee: 20,
      discountAmount: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discountAmount).toBe(0);
      expect(r.discountReason).toBeNull();
    }
  });

  it("requires reason when discount > 0", () => {
    const r = validateOrderDiscount({
      itemsSubtotal: 100,
      discountAmount: 10,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/เหตุผล/);
  });

  it("rejects discount over pre-discount total", () => {
    const r = validateOrderDiscount({
      itemsSubtotal: 90,
      deliveryFee: 10,
      discountAmount: 101,
      discountReason: "negotiation",
    });
    expect(r.ok).toBe(false);
  });

  it("accepts valid discount with reason", () => {
    const r = validateOrderDiscount({
      itemsSubtotal: 100,
      discountAmount: 10,
      discountReason: "bundle_promo",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discountAmount).toBe(10);
      expect(r.discountReason).toBe("bundle_promo");
    }
  });

  it("requires note for other reason", () => {
    const r = validateOrderDiscount({
      itemsSubtotal: 50,
      discountAmount: 5,
      discountReason: "other",
      discountReasonNote: "x",
    });
    expect(r.ok).toBe(false);
  });
});

describe("computeOrderGrandTotal", () => {
  it("subtracts discount from items + delivery", () => {
    expect(
      computeOrderGrandTotal({
        itemsSubtotal: 95,
        deliveryFee: 0,
        discountAmount: 5,
      }),
    ).toBe(90);
  });

  it("skewer helper includes shipping", () => {
    expect(
      computeSkewerOrderGrandTotal({
        itemsSubtotal: 80,
        shippingCostBaht: 10,
        discountAmount: 0,
      }),
    ).toBe(90);
  });
});

describe("resolveOrderDiscountReasonLabel", () => {
  it("maps preset ids", () => {
    expect(resolveOrderDiscountReasonLabel("aged_stock")).toMatch(/ค้าง/);
  });

  it("uses note for other", () => {
    expect(resolveOrderDiscountReasonLabel("other", "ลูกค้า VIP")).toBe(
      "ลูกค้า VIP",
    );
  });
});
