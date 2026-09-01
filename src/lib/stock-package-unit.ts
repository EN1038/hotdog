import { resolveSkewerQtyUnit } from "@/lib/skewer-order";

/** Unit snapshotted on package labels for menu (sale) items. */
export function resolveMenuItemPackageUnit(item: {
  quantityUnit?: string | null;
  sticksPerUnit?: number | null;
  countsAsSticks?: boolean | null;
}): string {
  const custom = item.quantityUnit?.trim();
  if (custom) return custom;
  if (item.countsAsSticks === false) return "ชิ้น";
  return resolveSkewerQtyUnit(item);
}

export function formatPackageQtyLabel(quantity: number, unit: string): string {
  const u = unit.trim() || "ชิ้น";
  return `${quantity} ${u}`;
}
