import { prisma } from "@/lib/db";
import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";
import { barcodeDigitsOnly } from "@/lib/stock-barcode-format";

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
  if (value.toLowerCase() === scanned.toLowerCase()) return true;
  const scannedDigits = barcodeDigitsOnly(scanned);
  if (!scannedDigits) return false;
  return barcodeDigitsOnly(value) === scannedDigits;
}

function mapMenuItem(
  item: {
    id: string;
    name: string;
    itemCode: string | null;
    imageUrl: string | null;
    brandProduct: { sku: string | null; barcode: string | null } | null;
  },
): StockMenuLookupMatch {
  const productCode = resolveMenuItemProductCode({
    id: item.id,
    itemCode: item.itemCode,
    brandProduct: item.brandProduct,
  });
  return {
    kind: "menu",
    itemId: item.id,
    name: item.name,
    productCode,
    stockType: "SALE_ITEM",
    imageUrl: item.imageUrl,
  };
}

/** Resolve a branch menu / non-menu row by database id. */
export async function lookupStockItemById(input: {
  branchId: string;
  itemId: string;
}): Promise<StockMenuLookupMatch | null> {
  const itemId = input.itemId.trim();
  if (!itemId) return null;

  const menuItem = await prisma.branchMenuItem.findFirst({
    where: { branchId: input.branchId, id: itemId, isHidden: false },
    select: {
      id: true,
      name: true,
      itemCode: true,
      imageUrl: true,
      category: { select: { stockExempt: true } },
      brandProduct: { select: { sku: true, barcode: true } },
      optionGroupLinks: { select: { group: { select: { mode: true } } } },
    },
  });
  if (menuItem) {
    const isPromo = menuItem.optionGroupLinks.some(
      (link) => link.group.mode === "FROM_MENU",
    );
    if (!isPromo && !menuItem.category?.stockExempt) {
      return mapMenuItem(menuItem);
    }
  }

  const nonMenu = await prisma.branchNonMenuItem.findFirst({
    where: { branchId: input.branchId, id: itemId },
    select: {
      id: true,
      name: true,
      itemCode: true,
      imageUrl: true,
      stockType: true,
    },
  });
  if (!nonMenu) return null;

  const productCode =
    nonMenu.itemCode?.trim() || nonMenu.id.slice(-8).toUpperCase();
  const stockType: StockMenuLookupStockType =
    nonMenu.stockType === "EQUIPMENT" ? "EQUIPMENT" : "CONSUMABLE";
  return {
    kind: stockType === "EQUIPMENT" ? "equipment" : "consumable",
    itemId: nonMenu.id,
    name: nonMenu.name,
    productCode,
    stockType,
    imageUrl: nonMenu.imageUrl,
  };
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
      return mapMenuItem(item);
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
