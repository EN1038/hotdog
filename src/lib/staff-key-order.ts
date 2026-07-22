import type { MenuItemData, MenuOptionGroupData } from "@/lib/customer-types";

export function isPromoMenuItem(
  item: Pick<MenuItemData, "optionGroups">,
): boolean {
  return (item.optionGroups ?? []).some((g) => g.mode === "FROM_MENU");
}

export function isRegularMenuItem(
  item: Pick<MenuItemData, "optionGroups">,
): boolean {
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
