import type { PrismaClient } from "@prisma/client";
import { resolveSkewerMenuImageUrl } from "@/lib/skewer-order";

export type BrandSkewerImageLookup = {
  byProductId: Map<string, string>;
  byItemCode: Map<string, string>;
};

type MenuImageSource = {
  skewerImageUrl?: string | null;
  imageUrl?: string | null;
  brandProductId?: string | null;
  itemCode?: string | null;
};

/** Load skewer photos from any branch in the brand (for stock hubs missing skewerImageUrl). */
export async function loadBrandSkewerImageLookup(
  prisma: PrismaClient,
  brandId: string,
): Promise<BrandSkewerImageLookup> {
  const rows = await prisma.branchMenuItem.findMany({
    where: {
      branch: { brandId },
      skewerImageUrl: { not: null },
      NOT: { skewerImageUrl: "" },
    },
    select: {
      brandProductId: true,
      itemCode: true,
      skewerImageUrl: true,
    },
  });

  const byProductId = new Map<string, string>();
  const byItemCode = new Map<string, string>();

  for (const row of rows) {
    const url = row.skewerImageUrl?.trim();
    if (!url) continue;
    if (row.brandProductId && !byProductId.has(row.brandProductId)) {
      byProductId.set(row.brandProductId, url);
    }
    const code = row.itemCode?.trim();
    if (code && !byItemCode.has(code)) {
      byItemCode.set(code, url);
    }
  }

  return { byProductId, byItemCode };
}

export function resolveMenuItemSkewerImageUrl(
  item: MenuImageSource,
  lookup?: BrandSkewerImageLookup | null,
): string | null {
  const own = item.skewerImageUrl?.trim();
  if (own) return own;

  if (lookup) {
    if (item.brandProductId) {
      const fromProduct = lookup.byProductId.get(item.brandProductId);
      if (fromProduct) return fromProduct;
    }
    const code = item.itemCode?.trim();
    if (code) {
      const fromCode = lookup.byItemCode.get(code);
      if (fromCode) return fromCode;
    }
  }

  return resolveSkewerMenuImageUrl(item);
}

export function withBrandSkewerImages<T extends MenuImageSource>(
  items: T[],
  lookup: BrandSkewerImageLookup,
): Array<T & { skewerImageUrl: string | null }> {
  return items.map((item) => {
    const skewerImageUrl = resolveMenuItemSkewerImageUrl(item, lookup);
    return {
      ...item,
      skewerImageUrl,
    };
  });
}
