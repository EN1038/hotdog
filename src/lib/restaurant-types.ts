/** Default store types — seeded into RestaurantType; kept for fallback labels. */
export const DEFAULT_RESTAURANT_TYPES = [
  { code: "thai", name: "อาหารไทย" },
  { code: "coffee", name: "ร้านกาแฟ" },
  { code: "single_dish", name: "อาหารจานเดียว" },
  { code: "isaan", name: "อาหารอีสาน" },
  { code: "japanese", name: "อาหารญี่ปุ่น" },
  { code: "chinese", name: "อาหารจีน" },
  { code: "korean", name: "อาหารเกาหลี" },
  { code: "western", name: "อาหารฝรั่ง" },
  { code: "seafood", name: "อาหารทะเล" },
  { code: "dessert", name: "ของหวาน / เบเกอรี่" },
  { code: "drink", name: "เครื่องดื่ม" },
  { code: "fast_food", name: "ฟาสต์ฟู้ด" },
  { code: "noodles", name: "ก๋วยเตี๋ยว" },
  { code: "bbq", name: "ปิ้งย่าง / หมูกระทะ" },
  { code: "vegetarian", name: "มังสวิรัติ / เจ" },
  { code: "other", name: "อื่นๆ" },
] as const;

export type RestaurantTypeRow = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
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
