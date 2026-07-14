export type AppLocale = "th" | "en";

/** Matches Prisma `PriceRange` — keep as string constants for client bundles. */
export type PriceRangeId =
  | "UNDER_100"
  | "FROM_101_250"
  | "FROM_251_500"
  | "FROM_501_1000"
  | "OVER_1000";

/** If locale-specific name is empty, fall back to the main name. */
export function localizedName(
  name: string,
  nameTh: string | null | undefined,
  nameEn: string | null | undefined,
  locale: AppLocale = "th",
): string {
  if (locale === "en") {
    const en = nameEn?.trim();
    if (en) return en;
  } else {
    const th = nameTh?.trim();
    if (th) return th;
  }
  return name;
}

export const RESTAURANT_CATEGORIES = [
  { id: "thai", label: "อาหารไทย" },
  { id: "coffee", label: "ร้านกาแฟ" },
  { id: "single_dish", label: "อาหารจานเดียว" },
  { id: "isaan", label: "อาหารอีสาน" },
  { id: "japanese", label: "อาหารญี่ปุ่น" },
  { id: "chinese", label: "อาหารจีน" },
  { id: "korean", label: "อาหารเกาหลี" },
  { id: "western", label: "อาหารฝรั่ง" },
  { id: "seafood", label: "อาหารทะเล" },
  { id: "dessert", label: "ของหวาน / เบเกอรี่" },
  { id: "drink", label: "เครื่องดื่ม" },
  { id: "fast_food", label: "ฟาสต์ฟู้ด" },
  { id: "noodles", label: "ก๋วยเตี๋ยว" },
  { id: "bbq", label: "ปิ้งย่าง / หมูกระทะ" },
  { id: "vegetarian", label: "มังสวิรัติ / เจ" },
  { id: "other", label: "อื่นๆ" },
] as const;

export type RestaurantCategoryId =
  (typeof RESTAURANT_CATEGORIES)[number]["id"];

export function restaurantCategoryLabel(id: string | null | undefined): string {
  if (!id) return "";
  return RESTAURANT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export const PRICE_RANGE_OPTIONS: {
  id: PriceRangeId;
  label: string;
}[] = [
  { id: "UNDER_100", label: "< 100" },
  { id: "FROM_101_250", label: "101 – 250" },
  { id: "FROM_251_500", label: "251 – 500" },
  { id: "FROM_501_1000", label: "501 – 1,000" },
  { id: "OVER_1000", label: "> 1,000" },
];

export const PRICE_RANGE_IDS = PRICE_RANGE_OPTIONS.map((o) => o.id) as [
  PriceRangeId,
  ...PriceRangeId[],
];

export function priceRangeLabel(
  range: string | null | undefined,
): string {
  if (!range) return "";
  return PRICE_RANGE_OPTIONS.find((o) => o.id === range)?.label ?? String(range);
}

export function emptyToNull(v: string | null | undefined): string | null {
  const t = v?.trim() ?? "";
  return t ? t : null;
}
