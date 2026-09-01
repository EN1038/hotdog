import { describe, expect, it } from "vitest";
import {
  OWNER_REGISTER_TRIAL_DAYS,
  OWNER_TRIAL_FULL_MODULES,
  categoryAllowsMasterImport,
  resolveOwnerShopCategory,
} from "@/lib/owner-register-shared";

describe("owner register shared", () => {
  it("trial is 30 days", () => {
    expect(OWNER_REGISTER_TRIAL_DAYS).toBe(30);
  });

  it("maps mala category to MALA plan", () => {
    const cat = resolveOwnerShopCategory("mala_hotpot");
    expect(cat.plan).toBe("MALA");
    expect(cat.operatingMode).toBe("NORMAL");
    expect(categoryAllowsMasterImport("mala_hotpot")).toBe(true);
  });

  it("skewer category disables master import", () => {
    const cat = resolveOwnerShopCategory("skewer");
    expect(cat.operatingMode).toBe("SKEWER");
    expect(categoryAllowsMasterImport("skewer")).toBe(false);
  });

  it("trial enables all modules including stock", () => {
    expect(OWNER_TRIAL_FULL_MODULES.stockEnabled).toBe(true);
    expect(OWNER_TRIAL_FULL_MODULES.kitchenEnabled).toBe(true);
    expect(OWNER_TRIAL_FULL_MODULES.skewerEnabled).toBe(true);
  });
});
