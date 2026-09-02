import { describe, expect, it } from "vitest";
import {
  OWNER_REGISTER_TRIAL_DAYS,
  OWNER_TRIAL_FULL_MODULES,
} from "@/lib/owner-register-shared";
import { categoryAllowsMasterImportFrom } from "@/lib/owner-register-category";

describe("owner register shared", () => {
  it("trial is 7 days", () => {
    expect(OWNER_REGISTER_TRIAL_DAYS).toBe(7);
  });

  it("categoryAllowsMasterImportFrom respects flag", () => {
    expect(
      categoryAllowsMasterImportFrom({
        code: "mala_hotpot",
        label: "ร้านหมาล่า/ย่าง/ทอด/ชาบู",
        hint: "",
        plan: "MALA",
        operatingMode: "NORMAL",
        offersMasterImport: true,
      }),
    ).toBe(true);
    expect(
      categoryAllowsMasterImportFrom({
        code: "made_to_order",
        label: "ร้านอาหารตามสั่ง",
        hint: "",
        plan: "RETAIL",
        operatingMode: "NORMAL",
        offersMasterImport: false,
      }),
    ).toBe(false);
  });

  it("trial enables all modules including stock", () => {
    expect(OWNER_TRIAL_FULL_MODULES.stockEnabled).toBe(true);
    expect(OWNER_TRIAL_FULL_MODULES.kitchenEnabled).toBe(true);
    expect(OWNER_TRIAL_FULL_MODULES.skewerEnabled).toBe(true);
  });
});
