/** First sequential branch menu item code (per branch). */
export const MENU_ITEM_CODE_START = 10_001;

export function formatSequentialMenuItemCode(
  index: number,
  start = MENU_ITEM_CODE_START,
): string {
  return String(start + index);
}

export function assignSequentialMenuItemCodes<T extends { id: string }>(
  items: T[],
  start = MENU_ITEM_CODE_START,
): Array<{ id: string; itemCode: string }> {
  return items.map((item, index) => ({
    id: item.id,
    itemCode: formatSequentialMenuItemCode(index, start),
  }));
}

/** Sale/menu rows that participate in branch stock & barcode labels. */
export function isMenuItemEligibleForProductCode(item: {
  isHidden: boolean;
  category?: { stockExempt: boolean } | null;
  optionGroupLinks?: Array<{ group: { mode: string } }>;
}): boolean {
  if (item.isHidden) return false;
  if (item.category?.stockExempt) return false;
  if (
    item.optionGroupLinks?.some((link) => link.group.mode === "FROM_MENU")
  ) {
    return false;
  }
  return true;
}
