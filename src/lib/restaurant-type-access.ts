import { prisma } from "@/lib/db";

export async function getActiveRestaurantTypeCodes(): Promise<string[]> {
  const rows = await prisma.restaurantType.findMany({
    where: { isActive: true },
    select: { code: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((r) => r.code);
}

export async function assertValidRestaurantCategories(
  primary: string | null | undefined,
  secondary: string[] | undefined,
): Promise<string | null> {
  const codes = await getActiveRestaurantTypeCodes();
  const set = new Set(codes);

  if (primary && !set.has(primary)) {
    return "ประเภทหลักไม่ถูกต้องหรือถูกปิดใช้งาน";
  }

  const secs = (secondary ?? []).filter(Boolean);
  for (const code of secs) {
    if (!set.has(code)) {
      return "ประเภทรองไม่ถูกต้องหรือถูกปิดใช้งาน";
    }
  }

  if (primary && secs.includes(primary)) {
    return "ประเภทรองต้องไม่ซ้ำกับประเภทหลัก";
  }

  if (new Set(secs).size !== secs.length) {
    return "ประเภทรองต้องไม่ซ้ำกัน";
  }

  if (secs.length > 2) {
    return "ประเภทรองเลือกได้สูงสุด 2";
  }

  return null;
}
