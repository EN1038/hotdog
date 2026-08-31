import { describe, expect, it } from "vitest";
import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";

describe("resolveMenuItemProductCode", () => {
  it("prefers manual itemCode", () => {
    expect(
      resolveMenuItemProductCode({
        id: "cmabc123xyz",
        itemCode: "M001",
        brandProduct: { sku: "SKU-1", barcode: "8850001" },
      }),
    ).toBe("M001");
  });

  it("falls back to brand sku then barcode then id suffix", () => {
    expect(
      resolveMenuItemProductCode({
        id: "cmabc123xyz",
        brandProduct: { sku: "SKU-1", barcode: "8850001" },
      }),
    ).toBe("SKU-1");

    expect(
      resolveMenuItemProductCode({
        id: "cmabc123xyz",
        brandProduct: { sku: null, barcode: "8850001" },
      }),
    ).toBe("8850001");

    expect(
      resolveMenuItemProductCode({
        id: "cmabc123xyz",
        brandProduct: null,
      }),
    ).toBe("BC123XYZ");
  });
});
