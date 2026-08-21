import type { MenuItemData, MenuOptionGroupData } from "@/lib/customer-types";
import { parsePromoWoodGiftName } from "@/lib/order-item-display";
import { computeSelectedOptions } from "@/lib/option-selection";
import {
  getPromoScheduleStatus,
  isPromoScheduleSellable,
  isPromoScheduleVisibleOnShop,
  type PromoScheduleStatus,
} from "@/lib/promo-schedule";
import { sortMenuItemData } from "@/lib/staff-menu-order";

/** Minimal shape for promo / sold-out checks (API may only select `mode`). */
type StockCheckItem = {
  isOutOfStock?: boolean | null;
  stockQuantity?: number | null;
  optionGroups?: Array<{ mode?: MenuOptionGroupData["mode"] }> | null;
  category?: { stockExempt?: boolean | null } | null;
  promoContinuous?: boolean | null;
  promoStartsAt?: string | Date | null;
  promoEndsAt?: string | Date | null;
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

export function promoScheduleStatusOf(
  item: StockCheckItem,
  now = new Date(),
): PromoScheduleStatus {
  return getPromoScheduleStatus(item, now);
}

export function isPromoSellableOnShop(
  item: StockCheckItem,
  now = new Date(),
): boolean {
  return isPromoScheduleSellable(promoScheduleStatusOf(item, now));
}

/** โปรที่โชว์บนหน้าร้าน (รวมหมดอายุในระยะ 3 วัน) */
export function listVisiblePromoMenuItems(
  menuItems: MenuItemData[],
  now = new Date(),
): MenuItemData[] {
  return sortMenuItemData(
    menuItems.filter((item) => {
      if (!isPromoMenuItem(item)) return false;
      const status = promoScheduleStatusOf(item, now);
      if (!isPromoScheduleVisibleOnShop(status)) return false;
      if (status === "expired_grace") return true;
      return !isMenuItemSoldOut(item);
    }),
  );
}

/** Promo packs ที่ขายได้จริง (ไม่รวมหมดอายุ) */
export function listActivePromoMenuItems(
  menuItems: MenuItemData[],
  now = new Date(),
): MenuItemData[] {
  return listVisiblePromoMenuItems(menuItems, now).filter((item) =>
    isPromoSellableOnShop(item, now),
  );
}

/**
 * Short label for staff home / promo list — follows promo pack structure
 * (ชื่อโปร + FROM_MENU maxSelect จากหลังบ้าน).
 */
export function describePromoMenuItem(item: MenuItemData): string {
  const parsed = parsePromoWoodGiftName(item.name);
  if (parsed) {
    return `จ่าย ${parsed.paid} · แถม ${parsed.free}`;
  }
  const group = (item.optionGroups ?? []).find((g) => g.mode === "FROM_MENU");
  if (!group) return "คีย์โปรโมชั่น";
  const max = group.maxSelect ?? 0;
  const min = group.minSelect ?? 0;
  if (max <= 0) return "คีย์โปรโมชั่น";
  // Convention: gift ≈ 1 when min=max and name has no “แถม N”
  if (min === max && min > 1) {
    return `เลือก ${max} ไม้`;
  }
  if (min > 0) {
    return `เลือก ${min}–${max} ไม้`;
  }
  return `เลือกได้สูงสุด ${max} ไม้`;
}

export type StaffHomePromoButton = {
  key: string;
  href: string;
  label: string;
  description: string;
};

/**
 * Single home shortcut for promotions (original structure).
 * Opens promo picker; if only one pack exists, deep-links to it.
 */
export function resolveStaffHomePromoButton(
  menuItems: MenuItemData[],
): StaffHomePromoButton | null {
  const promos = listActivePromoMenuItems(menuItems);
  if (promos.length === 0) return null;
  if (promos.length === 1) {
    const only = promos[0]!;
    return {
      key: "promo",
      href: `/staff/key-order/promo/${only.id}`,
      label: "คีย์โปรโมชั่น",
      description: "เลือกเมนูเซ็ตโปร",
    };
  }
  return {
    key: "promo",
    href: "/staff/key-order/promo",
    label: "คีย์โปรโมชั่น",
    description: "เลือกเมนูเซ็ตโปร",
  };
}

/** @deprecated use resolveStaffHomePromoButton — home keeps one promo entry */
export function resolveStaffHomePromoButtons(
  menuItems: MenuItemData[],
): StaffHomePromoButton[] {
  const one = resolveStaffHomePromoButton(menuItems);
  return one ? [one] : [];
}

/** Unique MANUAL option groups across items.
 * When `onlySelected` is true (default), only items with qty > 0 contribute.
 * Pass `onlySelected: false` to show all groups linked to the item list (e.g. spice level before qty).
 */
export function collectSharedOptionGroups(
  items: MenuItemData[],
  qtyByItemId: Record<string, number>,
  options?: { onlySelected?: boolean },
): MenuOptionGroupData[] {
  const onlySelected = options?.onlySelected !== false;
  const map = new Map<string, MenuOptionGroupData>();
  for (const item of items) {
    if (onlySelected && (qtyByItemId[item.id] ?? 0) <= 0) continue;
    for (const group of item.optionGroups ?? []) {
      if (group.mode === "FROM_MENU") continue;
      if (!map.has(group.id)) map.set(group.id, group);
    }
  }
  return [...map.values()].sort((a, b) => {
    const req = Number(Boolean(b.required)) - Number(Boolean(a.required));
    if (req !== 0) return req;
    return (
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.name.localeCompare(b.name, "th")
    );
  });
}

export function optionIdsForMenuItem(
  item: MenuItemData,
  selectedByGroup: Record<string, string[]>,
): string[] {
  const groups = (item.optionGroups ?? []).filter((g) => g.mode !== "FROM_MENU");
  // Respect visibleWhenOptionIds (e.g. น้ำชาบู only when ชาบู is chosen)
  return computeSelectedOptions(groups, selectedByGroup).optionIds;
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
