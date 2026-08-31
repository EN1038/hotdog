import { describe, expect, it } from "vitest";
import {
  assignSequentialMenuItemCodes,
  formatSequentialMenuItemCode,
  isMenuItemEligibleForProductCode,
  MENU_ITEM_CODE_START,
} from "@/lib/inventory/inventory-menu-code-assign";

describe("inventory-menu-code-assign", () => {
  it("formats sequential codes from 10001", () => {
    expect(formatSequentialMenuItemCode(0)).toBe("10001");
    expect(formatSequentialMenuItemCode(1)).toBe("10002");
    expect(formatSequentialMenuItemCode(2, MENU_ITEM_CODE_START)).toBe("10003");
  });

  it("assigns codes in list order", () => {
    expect(
      assignSequentialMenuItemCodes([
        { id: "a" },
        { id: "b" },
        { id: "c" },
      ]),
    ).toEqual([
      { id: "a", itemCode: "10001" },
      { id: "b", itemCode: "10002" },
      { id: "c", itemCode: "10003" },
    ]);
  });

  it("skips promo packs and stock-exempt categories", () => {
    expect(
      isMenuItemEligibleForProductCode({
        isHidden: false,
        category: { stockExempt: true },
        optionGroupLinks: [],
      }),
    ).toBe(false);

    expect(
      isMenuItemEligibleForProductCode({
        isHidden: false,
        category: null,
        optionGroupLinks: [{ group: { mode: "FROM_MENU" } }],
      }),
    ).toBe(false);

    expect(
      isMenuItemEligibleForProductCode({
        isHidden: false,
        category: null,
        optionGroupLinks: [{ group: { mode: "MANUAL" } }],
      }),
    ).toBe(true);
  });
});
