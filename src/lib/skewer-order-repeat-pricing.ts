import { prisma } from "@/lib/db";

/** Map key: `${customerId}:m:${menuItemId}` or `${customerId}:n:${normalizedName}` */
export function repeatSkewerPriceKey(
  customerId: string,
  branchMenuItemId: string | null,
  itemName: string,
): string {
  if (branchMenuItemId) return `${customerId}:m:${branchMenuItemId}`;
  const name = itemName.trim().toLowerCase();
  return `${customerId}:n:${name}`;
}

export function lookupRepeatSkewerUnitPrice(
  priceMap: Map<string, number>,
  customerId: string,
  branchMenuItemId: string | null,
  itemName: string,
): number | null {
  if (branchMenuItemId) {
    const byMenu = priceMap.get(
      repeatSkewerPriceKey(customerId, branchMenuItemId, itemName),
    );
    if (byMenu != null) return byMenu;
  }
  return (
    priceMap.get(repeatSkewerPriceKey(customerId, null, itemName)) ?? null
  );
}

/**
 * Latest unitPriceBaht per customer + menu item from prior priced skewer orders
 * at the same branch (most recent confirm/update first).
 */
export async function loadLatestRepeatCustomerUnitPrices(
  branchId: string,
): Promise<Map<string, number>> {
  const rows = await prisma.skewerOrderItem.findMany({
    where: {
      unitPriceBaht: { not: null },
      skewerOrder: {
        branchId,
        status: { in: ["CONFIRMED", "DELIVERED"] },
      },
    },
    select: {
      branchMenuItemId: true,
      itemName: true,
      unitPriceBaht: true,
      skewerOrder: {
        select: {
          customerId: true,
          confirmedAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [
      { skewerOrder: { confirmedAt: "desc" } },
      { skewerOrder: { updatedAt: "desc" } },
    ],
    take: 800,
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    const price = Number(row.unitPriceBaht);
    if (!Number.isFinite(price) || price < 0) continue;
    const customerId = row.skewerOrder.customerId;

    if (row.branchMenuItemId) {
      const menuKey = repeatSkewerPriceKey(
        customerId,
        row.branchMenuItemId,
        row.itemName,
      );
      if (!map.has(menuKey)) map.set(menuKey, price);
    }
    const nameKey = repeatSkewerPriceKey(customerId, null, row.itemName);
    if (!map.has(nameKey)) map.set(nameKey, price);
  }
  return map;
}
