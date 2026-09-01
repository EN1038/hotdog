import { prisma } from "@/lib/db";
import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";

export type StockMenuLookupStockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

export type StockMenuLookupMatch = {
  kind: "menu" | "consumable" | "equipment";
  itemId: string;
  name: string;
  productCode: string;
  stockType: StockMenuLookupStockType;
  imageUrl: string | null;
};

function normalizeCode(code: string): string {
  return code.trim();
}

function codesMatch(stored: string | null | undefined, scanned: string): boolean {
  const value = stored?.trim();
  if (!value) return false;
  return value.toLowerCase() === scanned.toLowerCase();
}

/** Resolve branch menu / non-menu stock row by product barcode or item code. */
export async function lookupStockItemByCode(input: {
  branchId: string;
  code: string;
}): Promise<StockMenuLookupMatch | null> {
  const code = normalizeCode(input.code);
  if (!code) return null;

  const menuItems = await prisma.branchMenuItem.findMany({
    where: { branchId: input.branchId, isHidden: false },
    select: {
      id: true,
      name: true,
      itemCode: true,
      imageUrl: true,
      category: { select: { stockExempt: true } },
      brandProduct: { select: { sku: true, barcode: true } },
      optionGroupLinks: { select: { group: { select: { mode: true } } } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  for (const item of menuItems) {
    const isPromo = item.optionGroupLinks.some(
      (link) => link.group.mode === "FROM_MENU",
    );
    if (isPromo || item.category?.stockExempt) continue;

    const productCode = resolveMenuItemProductCode({
      id: item.id,
      itemCode: item.itemCode,
      brandProduct: item.brandProduct,
    });
    if (
      codesMatch(item.itemCode, code) ||
      codesMatch(item.brandProduct?.sku, code) ||
      codesMatch(item.brandProduct?.barcode, code) ||
      codesMatch(productCode, code)
    ) {
      return {
        kind: "menu",
        itemId: item.id,
        name: item.name,
        productCode,
        stockType: "SALE_ITEM",
        imageUrl: item.imageUrl,
      };
    }
  }

  const nonMenuItems = await prisma.branchNonMenuItem.findMany({
    where: { branchId: input.branchId },
    select: {
      id: true,
      name: true,
      itemCode: true,
      imageUrl: true,
      stockType: true,
    },
    orderBy: { name: "asc" },
  });

  for (const item of nonMenuItems) {
    const productCode =
      item.itemCode?.trim() || item.id.slice(-8).toUpperCase();
    if (codesMatch(item.itemCode, code) || codesMatch(productCode, code)) {
      const stockType: StockMenuLookupStockType =
        item.stockType === "EQUIPMENT" ? "EQUIPMENT" : "CONSUMABLE";
      return {
        kind: stockType === "EQUIPMENT" ? "equipment" : "consumable",
        itemId: item.id,
        name: item.name,
        productCode,
        stockType,
        imageUrl: item.imageUrl,
      };
    }
  }

  return null;
}
