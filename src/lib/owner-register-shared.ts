import type { BrandPlan, BranchOperatingMode } from "@prisma/client";

export const OWNER_REGISTER_TRIAL_DAYS = 7;

export const OWNER_REGISTER_BILLING_NOTE = "owner_self_register";

export const OWNER_REGISTER_IMPORT_OPTIONS = [
  {
    id: "full" as const,
    label: "เมนู + สิ้นเปลือง + อุปกรณ์",
    hint: "รายการจากแม่แบบหมาล่าไวไว สามารถแก้ภายหลังได้",
    recommended: true,
  },
  {
    id: "none" as const,
    label: "เริ่มว่าง",
    hint: "เพิ่มเมนูเองทีหลัง",
    recommended: false,
  },
];

export type OwnerRegisterImportLevel =
  (typeof OWNER_REGISTER_IMPORT_OPTIONS)[number]["id"];

/** @deprecated Categories come from RestaurantType (admin → ประเภทร้าน). */
export type OwnerShopCategoryId = string;

export type OwnerShopCategoryDef = {
  id: string;
  label: string;
  hint: string;
  plan: BrandPlan;
  operatingMode: BranchOperatingMode;
  offersMasterImport: boolean;
};
