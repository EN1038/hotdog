import { describe, expect, it } from "vitest";
import { resolveMenuAvailableStock } from "@/lib/inventory/inventory-stock-quantity";

describe("resolveMenuAvailableStock", () => {
  it("reads BranchMenuItemStock quantity", () => {
    expect(resolveMenuAvailableStock({ quantity: 12 })).toEqual({
      availableStock: 12,
      stockTracked: true,
    });
  });

  it("returns zero when stock row missing", () => {
    expect(resolveMenuAvailableStock(null)).toEqual({
      availableStock: 0,
      stockTracked: false,
    });
  });
});
