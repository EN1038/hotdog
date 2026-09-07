import { describe, expect, it } from "vitest";
import {
  extractFilterableOptionTokens,
  lineMatchesOptionFilter,
  normalizeOptionToken,
  OPTION_FILTER_NONE,
} from "@/lib/order-option-tokens";

describe("extractFilterableOptionTokens", () => {
  it("keeps normal options and maps ปิ้ง to ย่าง", () => {
    expect(extractFilterableOptionTokens("ปิ้ง, เผ็ดกลาง")).toEqual([
      "ย่าง",
      "เผ็ดกลาง",
    ]);
    expect(extractFilterableOptionTokens("ย่าง · ทอด")).toEqual(["ย่าง", "ทอด"]);
  });

  it("skips pack sticks and keeps add-ons after separator", () => {
    expect(
      extractFilterableOptionTokens("ไม้A, ไม้B, ไม้C · เผ็ดกลาง"),
    ).toEqual(["เผ็ดกลาง"]);
    expect(extractFilterableOptionTokens("ไม้A, ไม้B, ไม้C")).toEqual([]);
  });

  it("returns empty for blank", () => {
    expect(extractFilterableOptionTokens(null)).toEqual([]);
    expect(extractFilterableOptionTokens("")).toEqual([]);
  });
});

describe("lineMatchesOptionFilter", () => {
  it("matches tokens and none", () => {
    expect(lineMatchesOptionFilter("ย่าง", "ย่าง")).toBe(true);
    expect(lineMatchesOptionFilter("ปิ้ง", "ย่าง")).toBe(true);
    expect(lineMatchesOptionFilter("ทอด", "ย่าง")).toBe(false);
    expect(lineMatchesOptionFilter(null, OPTION_FILTER_NONE)).toBe(true);
    expect(lineMatchesOptionFilter("ย่าง", OPTION_FILTER_NONE)).toBe(false);
    expect(lineMatchesOptionFilter("ย่าง", null)).toBe(true);
  });
});

describe("normalizeOptionToken", () => {
  it("maps grill aliases", () => {
    expect(normalizeOptionToken("ปิ้ง")).toBe("ย่าง");
    expect(normalizeOptionToken("ย่าง")).toBe("ย่าง");
  });
});
