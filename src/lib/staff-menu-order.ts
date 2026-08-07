import { compareThaiText } from "@/lib/thai-sort";

/** Minimal shape for staff menu / stock list ordering. */
export type StaffMenuOrderFields = {
  id: string;
  name: string;
  sortOrder?: number | null;
  categorySortOrder?: number | null;
};

function categorySortOf(item: StaffMenuOrderFields): number {
  return item.categorySortOrder ?? 999;
}

function itemSortOf(item: StaffMenuOrderFields): number {
  return item.sortOrder ?? 0;
}

/** sortOrder → categorySortOrder → Thai name */
export function compareStaffMenuItems(
  a: StaffMenuOrderFields,
  b: StaffMenuOrderFields,
): number {
  const ord = itemSortOf(a) - itemSortOf(b);
  if (ord !== 0) return ord;
  const cat = categorySortOf(a) - categorySortOf(b);
  if (cat !== 0) return cat;
  return compareThaiText(a.name, b.name);
}

export function sortStaffMenuItems<T extends StaffMenuOrderFields>(
  items: T[],
): T[] {
  return [...items].sort(compareStaffMenuItems);
}

/** 1-based sequence from a fully sorted catalog (stable across category filters). */
export function assignStableMenuSequence<T extends { id: string }>(
  fullSortedList: T[],
): Map<string, number> {
  const map = new Map<string, number>();
  fullSortedList.forEach((item, index) => {
    map.set(item.id, index + 1);
  });
  return map;
}

/** Attach categorySortOrder from nested category for MenuItemData-like objects. */
export function withMenuOrderFields<
  T extends {
    id: string;
    name: string;
    sortOrder?: number | null;
    category?: { sortOrder?: number | null } | null;
  },
>(item: T): T & StaffMenuOrderFields {
  return {
    ...item,
    categorySortOrder: item.category?.sortOrder ?? 999,
  };
}

export function sortMenuItemData<
  T extends {
    id: string;
    name: string;
    sortOrder?: number | null;
    category?: { sortOrder?: number | null } | null;
  },
>(items: T[]): T[] {
  return sortStaffMenuItems(items.map(withMenuOrderFields));
}
