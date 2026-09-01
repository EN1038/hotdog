import { describe, expect, it } from "vitest";
import {
  parseStockMenuQrPayload,
  stockMenuQrPayload,
} from "@/lib/stock-menu-qr";

describe("stockMenuQrPayload", () => {
  it("falls back to skillsale scheme with numeric product code", () => {
    expect(
      stockMenuQrPayload({ itemId: "item-1", productCode: "M10001" }),
    ).toBe("skillsale:menu:item-1:10001");
    expect(stockMenuQrPayload({ productCode: "10002" })).toBe(
      "skillsale:product:10002",
    );
  });
});

describe("parseStockMenuQrPayload", () => {
  it("parses menu and product scheme payloads", () => {
    expect(parseStockMenuQrPayload("skillsale:menu:abc:10001")).toEqual({
      itemId: "abc",
      productCode: "10001",
    });
    expect(parseStockMenuQrPayload("skillsale:product:10002")).toEqual({
      productCode: "10002",
    });
  });

  it("parses menu scheme without product code", () => {
    expect(parseStockMenuQrPayload("skillsale:menu:abc")).toEqual({
      itemId: "abc",
      productCode: "",
    });
  });

  it("rejects plain barcode digits without QR wrapper", () => {
    expect(parseStockMenuQrPayload("10001")).toBeNull();
  });
});
