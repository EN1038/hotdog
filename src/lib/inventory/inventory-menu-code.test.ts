import { describe, expect, it } from "vitest";
import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";

describe("resolveMenuItemProductCode", () => {
  it("prefers manual itemCode", () => {
    expect(
      resolveMenuItemProductCode({
        id: "cmabc123xyz",
        itemCode: "M001",
      }),
    ).toBe("M001");
  });

  it("falls back to id suffix when itemCode is empty", () => {
    expect(
      resolveMenuItemProductCode({
        id: "cmabc123xyz",
      }),
    ).toBe("BC123XYZ");
  });
});
