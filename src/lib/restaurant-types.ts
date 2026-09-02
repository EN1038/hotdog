/** Default store types — seeded into RestaurantType; kept for fallback labels. */
export const DEFAULT_RESTAURANT_TYPES = [
  {
    code: "mala_hotpot",
    name: "ร้านหมาล่า/ย่าง/ทอด",
    sortOrder: 1,
    showInOwnerRegister: true,
    ownerRegisterHint: "คิวเคาน์เตอร์ · ครัว · เสียบไม้",
    ownerRegisterPlan: "MALA" as const,
    ownerRegisterOperatingMode: "NORMAL" as const,
    offersMasterImport: true,
  },
  {
    code: "fish_ball",
    name: "ร้านลูกชิ้น/ย่าง/ทอด",
    sortOrder: 2,
    showInOwnerRegister: true,
    ownerRegisterHint: "ขายทั่วไป · คิวหน้าร้าน",
    ownerRegisterPlan: "RETAIL" as const,
    ownerRegisterOperatingMode: "NORMAL" as const,
    offersMasterImport: true,
  },
  {
    code: "weigh_bbq",
    name: "ร้านหมูกระทะชั่งกิโล",
    sortOrder: 3,
    showInOwnerRegister: true,
    ownerRegisterHint: "ชั่งกิโล · เปิดบิลโต๊ะ",
    ownerRegisterPlan: "WEIGH_TABLE" as const,
    ownerRegisterOperatingMode: "BBQ_WEIGH" as const,
    offersMasterImport: false,
  },
  {
    code: "made_to_order",
    name: "ร้านอาหารตามสั่ง",
    sortOrder: 4,
    showInOwnerRegister: true,
    ownerRegisterHint: "เริ่มว่าง · ตั้งเมนูเอง",
    ownerRegisterPlan: "RETAIL" as const,
    ownerRegisterOperatingMode: "NORMAL" as const,
    offersMasterImport: false,
  },
] as const;

export type RestaurantTypeRow = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  showInOwnerRegister?: boolean;
  ownerRegisterHint?: string | null;
  ownerRegisterPlan?: string;
  ownerRegisterOperatingMode?: string;
  offersMasterImport?: boolean;
};

export function restaurantTypeLabel(
  code: string | null | undefined,
  types?: Array<{ code: string; name: string }>,
): string {
  if (!code) return "";
  const fromList = types?.find((t) => t.code === code)?.name;
  if (fromList) return fromList;
  return (
    DEFAULT_RESTAURANT_TYPES.find((t) => t.code === code)?.name ?? code
  );
}
