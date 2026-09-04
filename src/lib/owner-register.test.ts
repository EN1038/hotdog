import { describe, expect, it } from "vitest";
import { OWNER_REGISTER_TRIAL_DAYS } from "@/lib/owner-register-shared";
import { categoryAllowsMasterImportFrom } from "@/lib/owner-register-category";
import { BRAND_PLAN_PRESETS } from "@/lib/brand-plan-shared";
import {
  adminHasLiveBrand,
  liveBrandIdsFromMemberships,
} from "@/lib/owner-register-phone";

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

  it("MALA trial modules follow plan preset not full unlock", () => {
    const mala = BRAND_PLAN_PRESETS.MALA;
    expect(mala.skewerEnabled).toBe(true);
    expect(mala.kitchenEnabled).toBe(true);
    expect(mala.bbqEnabled).toBe(false);
    expect(mala.stockEnabled).toBe(false);
  });

  it("soft-deleted-only admin may re-register", () => {
    expect(
      adminHasLiveBrand({
        brandMembers: [{ brand: { status: "DELETED" } }],
      }),
    ).toBe(false);
    expect(
      adminHasLiveBrand({
        brandMembers: [
          { brand: { status: "DELETED" } },
          { brand: { status: "TRIAL" } },
        ],
      }),
    ).toBe(true);
    expect(
      liveBrandIdsFromMemberships([
        { brandId: "a", brand: { status: "DELETED" } },
        { brandId: "b", brand: { status: "ACTIVE" } },
      ]),
    ).toEqual(["b"]);
  });
});
