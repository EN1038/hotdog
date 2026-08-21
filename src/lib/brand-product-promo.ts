import { prisma } from "@/lib/db";

/** BrandProduct ids linked from promo packs (FROM_MENU option group). */
export async function loadPromoBrandProductIds(
  brandId: string,
): Promise<Set<string>> {
  const rows = await prisma.branchMenuItem.findMany({
    where: {
      branch: { brandId },
      brandProductId: { not: null },
      optionGroupLinks: { some: { group: { mode: "FROM_MENU" } } },
    },
    select: { brandProductId: true },
  });
  return new Set(
    rows.map((r) => r.brandProductId).filter((id): id is string => Boolean(id)),
  );
}

export function excludePromoBrandProducts<T extends { id: string }>(
  products: T[],
  promoIds: Set<string>,
): T[] {
  if (promoIds.size === 0) return products;
  return products.filter((p) => !promoIds.has(p.id));
}
