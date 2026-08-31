import { describe, expect, it } from "vitest";
import { computeSuggestedRefill } from "@/lib/inventory/inventory-calculations";
import { deriveParComparison } from "@/lib/inventory/inventory-tomorrow-plan-shared";
import { compareThaiText } from "@/lib/thai-sort";

describe("tomorrow plan mode TO_PAR", () => {
  it("refills exactly to Par when stock is below", () => {
    const par = 40;
    const stock = 12;
    expect(computeSuggestedRefill(par, stock)).toBe(28);
    expect(deriveParComparison(stock, par).belowParQty).toBe(28);
  });

  it("suggests 0 when stock meets or exceeds Par", () => {
    expect(computeSuggestedRefill(40, 40)).toBe(0);
    expect(computeSuggestedRefill(40, 55)).toBe(0);
  });

  it("suggests 0 when Par is not set", () => {
    expect(computeSuggestedRefill(0, 5)).toBe(0);
    expect(deriveParComparison(5, 0).kind).toBe("NO_PAR");
  });

  it("sorts displayed product codes numerically", () => {
    const codes = ["10828", "10816", "10819", "1082"];
    codes.sort(compareThaiText);
    expect(codes).toEqual(["1082", "10816", "10819", "10828"]);
  });
});
