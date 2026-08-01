import type { MenuItemData, MenuOptionGroupData } from "@/lib/customer-types";

/** Minimal shape for promo / sold-out checks (API may only select `mode`). */
type StockCheckItem = {
  isOutOfStock?: boolean | null;
  stockQuantity?: number | null;
  optionGroups?: Array<{ mode?: MenuOptionGroupData["mode"] }> | null;
  category?: { stockExempt?: boolean | null } | null;
};

export function isPromoMenuItem(item: StockCheckItem): boolean {
  return (item.optionGroups ?? []).some((g) => g.mode === "FROM_MENU");
}

/** Pack/promo or category marked stock-exempt: ignore stock qty, use manual flag only. */
export function isStockExemptMenuItem(item: StockCheckItem): boolean {
  if (isPromoMenuItem(item)) return true;
  return Boolean(item.category?.stockExempt);
}

/** Sold-out: stock qty when tracked; promo/exempt packs use manual isOutOfStock only. */
export function isMenuItemSoldOut(item: StockCheckItem): boolean {
  if (isStockExemptMenuItem(item)) return Boolean(item.isOutOfStock);
  if (item.stockQuantity != null) return item.stockQuantity <= 0;
  return Boolean(item.isOutOfStock);
}

/**
 * Max qty staff can add for a tracked menu line.
 * `null` stockQuantity = not tracked yet → no cap (matches API / isMenuItemSoldOut).
 */
export function stockQuantityCap(item: StockCheckItem): number {
  if (isStockExemptMenuItem(item)) return Number.POSITIVE_INFINITY;
  if (item.stockQuantity == null) return Number.POSITIVE_INFINITY;
  return Math.max(0, item.stockQuantity);
}

export function isRegularMenuItem(item: StockCheckItem): boolean {
  return !isPromoMenuItem(item);
}

/** Unique MANUAL option groups across items with qty > 0 (shared once). */
export function collectSharedOptionGroups(
  items: MenuItemData[],
  qtyByItemId: Record<string, number>,
): MenuOptionGroupData[] {
  const map = new Map<string, MenuOptionGroupData>();
  for (const item of items) {
    if ((qtyByItemId[item.id] ?? 0) <= 0) continue;
    for (const group of item.optionGroups ?? []) {
      if (group.mode === "FROM_MENU") continue;
      if (!map.has(group.id)) map.set(group.id, group);
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.name.localeCompare(b.name, "th"),
  );
}

export function optionIdsForMenuItem(
  item: MenuItemData,
  selectedByGroup: Record<string, string[]>,
): string[] {
  const ids: string[] = [];
  for (const group of item.optionGroups ?? []) {
    ids.push(...(selectedByGroup[group.id] ?? []));
  }
  return ids;
}

/** Staff promo: FROM_MENU first, then other groups by sortOrder. */
export function orderOptionGroupsForStaffPromo(
  groups: MenuOptionGroupData[],
): MenuOptionGroupData[] {
  const sorted = [...groups].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.name.localeCompare(b.name, "th"),
  );
  const fromMenu = sorted.filter((g) => g.mode === "FROM_MENU");
  const rest = sorted.filter((g) => g.mode !== "FROM_MENU");
  return [...fromMenu, ...rest];
}

export type StaffDeliveryLocation = {
  id: string;
  name: string;
  deliveryFee: string | number;
  isCustomAddress?: boolean;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
