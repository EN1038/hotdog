import { prisma } from "@/lib/db";

/**
 * ดึงลำดับจากเมนูสาขาอ้างอิง (สาขาขายแรก) มาใส่ BrandProduct
 * — สต๊อกกลางไม่มี sortOrder ของตัวเอง ใช้ลำดับที่สาขากำหนด
 * Server-only: do not import from client components.
 */
export async function loadBrandProductMenuOrderMap(
  brandId: string,
): Promise<
  Map<
    string,
    { sortOrder: number; categorySortOrder: number; category: string | null }
  >
> {
  const store = await prisma.branch.findFirst({
    where: { brandId, kind: "STORE", isTest: false },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const branchId =
    store?.id ??
    (
      await prisma.branch.findFirst({
        where: { brandId, kind: "STORE" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    )?.id;
  if (!branchId) return new Map();

  const rows = await prisma.branchMenuItem.findMany({
    where: {
      branchId,
      brandProductId: { not: null },
      isHidden: false,
    },
    select: {
      brandProductId: true,
      sortOrder: true,
      category: { select: { name: true, sortOrder: true } },
    },
  });

  const map = new Map<
    string,
    { sortOrder: number; categorySortOrder: number; category: string | null }
  >();
  for (const row of rows) {
    const pid = row.brandProductId;
    if (!pid) continue;
    const next = {
      sortOrder: row.sortOrder,
      categorySortOrder: row.category?.sortOrder ?? 999,
      category: row.category?.name ?? null,
    };
    const prev = map.get(pid);
    if (!prev || next.sortOrder < prev.sortOrder) {
      map.set(pid, next);
    }
  }
  return map;
}
