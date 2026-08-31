/** Resolve display / print code for branch menu items. */
export function resolveMenuItemProductCode(input: {
  id: string;
  itemCode?: string | null;
  brandProduct?: { sku?: string | null; barcode?: string | null } | null;
}): string {
  const manual = input.itemCode?.trim();
  if (manual) return manual;

  const sku = input.brandProduct?.sku?.trim();
  if (sku) return sku;

  const barcode = input.brandProduct?.barcode?.trim();
  if (barcode) return barcode;

  return input.id.slice(-8).toUpperCase();
}

export function isManualMenuItemCode(input: {
  itemCode?: string | null;
}): boolean {
  return Boolean(input.itemCode?.trim());
}
