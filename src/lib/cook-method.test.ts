import { describe, expect, it } from "vitest";
import { parseCookMethod, splitOptionTokens } from "@/lib/cook-method";

describe("parseCookMethod", () => {
  it("detects grill and ปิ้ง as grill", () => {
    expect(parseCookMethod("ย่าง")).toBe("grill");
    expect(parseCookMethod("ปิ้ง")).toBe("grill");
    expect(parseCookMethod("เผ็ดกลาง, ย่าง")).toBe("grill");
  });

  it("detects fry", () => {
    expect(parseCookMethod("ทอด")).toBe("fry");
    expect(parseCookMethod("ทอด · เผ็ด")).toBe("fry");
  });

  it("returns unknown when no cook token", () => {
    expect(parseCookMethod(null)).toBe("unknown");
    expect(parseCookMethod("")).toBe("unknown");
    expect(parseCookMethod("เผ็ดกลาง")).toBe("unknown");
    expect(parseCookMethod("ไม้1, ไม้2")).toBe("unknown");
  });

  it("prefers fry when both present", () => {
    expect(parseCookMethod("ย่าง, ทอด")).toBe("fry");
  });
});

describe("splitOptionTokens", () => {
  it("splits comma and middle-dot", () => {
    expect(splitOptionTokens("ย่าง · เผ็ด")).toEqual(["ย่าง", "เผ็ด"]);
    expect(splitOptionTokens("a, b")).toEqual(["a", "b"]);
  });
});
