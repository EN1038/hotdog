import type { BrandPlan, BranchOperatingMode } from "@prisma/client";

export const OWNER_REGISTER_TRIAL_DAYS = 30;

/** ช่วงทดลอง — เปิดทุกโมดูลให้ลองครบ (สต๊อก · ครัว · โต๊ะ · เสียบไม้) */
export const OWNER_TRIAL_FULL_MODULES = {
  stockEnabled: true,
  kitchenEnabled: true,
  bbqEnabled: true,
  skewerEnabled: true,
} as const;

export const OWNER_REGISTER_BILLING_NOTE = "owner_self_register";

export const OWNER_SHOP_CATEGORY_IDS = [
  "mala_hotpot",
  "fish_ball",
  "fried",
  "skewer",
  "weigh",
  "general",
] as const;

export type OwnerShopCategoryId = (typeof OWNER_SHOP_CATEGORY_IDS)[number];

export type OwnerShopCategoryDef = {
  id: OwnerShopCategoryId;
  label: string;
  hint: string;
  plan: BrandPlan;
  operatingMode: BranchOperatingMode;
  /** แสดงตัวเลือกนำเข้าเมนูตั้งต้นจากหม่าล่าไวไว */
  offersMasterImport: boolean;
};

export const OWNER_SHOP_CATEGORIES: readonly OwnerShopCategoryDef[] = [
  {
    id: "mala_hotpot",
    label: "หม่าล่า / ย่าง / ทอด / ชาบู / หมูกระทะ",
    hint: "คิวเคาน์เตอร์ · ครัว · โต๊ะ · เสียบไม้",
    plan: "MALA",
    operatingMode: "NORMAL",
    offersMasterImport: true,
  },
  {
    id: "fish_ball",
    label: "ลูกชิ้น",
    hint: "ขายทั่วไป · คิวหน้าร้าน",
    plan: "RETAIL",
    operatingMode: "NORMAL",
    offersMasterImport: true,
  },
  {
    id: "fried",
    label: "ร้านของทอด",
    hint: "ขายทั่วไป · เมนูทอด",
    plan: "RETAIL",
    operatingMode: "NORMAL",
    offersMasterImport: true,
  },
  {
    id: "skewer",
    label: "ของเสียบไม้",
    hint: "โฟกัสเสียบไม้ · เตรียมไม้",
    plan: "MALA",
    operatingMode: "SKEWER",
    offersMasterImport: false,
  },
  {
    id: "weigh",
    label: "ร้านชั่งกิโล",
    hint: "ชั่งกิโล · เปิดบิลโต๊ะ",
    plan: "WEIGH_TABLE",
    operatingMode: "BBQ_WEIGH",
    offersMasterImport: false,
  },
  {
    id: "general",
    label: "ร้านอาหารทั่วไป",
    hint: "เริ่มว่าง · ตั้งเมนูเอง",
    plan: "RETAIL",
    operatingMode: "NORMAL",
    offersMasterImport: false,
  },
] as const;

export const OWNER_REGISTER_IMPORT_OPTIONS = [
  {
    id: "none" as const,
    label: "เริ่มว่าง",
    hint: "เพิ่มเมนูเองทีหลัง",
  },
  {
    id: "menu" as const,
    label: "เมนูขาย",
    hint: "หมวด + รายการขาย + ตัวเลือก",
  },
  {
    id: "full" as const,
    label: "เมนู + สิ้นเปลือง + อุปกรณ์ (แนะนำ)",
    hint: "จากแม่แบบหม่าล่าไวไว — แก้ราคาได้ภายหลัง",
  },
];

export type OwnerRegisterImportLevel =
  (typeof OWNER_REGISTER_IMPORT_OPTIONS)[number]["id"];

export function resolveOwnerShopCategory(
  id: OwnerShopCategoryId,
): OwnerShopCategoryDef {
  const found = OWNER_SHOP_CATEGORIES.find((c) => c.id === id);
  if (!found) {
    return OWNER_SHOP_CATEGORIES.find((c) => c.id === "general")!;
  }
  return found;
}

export function categoryAllowsMasterImport(id: OwnerShopCategoryId): boolean {
  return resolveOwnerShopCategory(id).offersMasterImport;
}
