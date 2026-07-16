import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Max bestseller badges per branch */
export const BESTSELLER_TOP_N = 5;

/** Minimum completed units sold to qualify as bestseller */
export const BESTSELLER_MIN_QTY = 3;

/**
 * Returns menu item IDs that are bestsellers per branch,
 * based on sum of quantities on COMPLETED orders.
 */
export async function getBestsellerMenuItemIdsByBranch(
  branchIds: string[],
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  for (const id of branchIds) {
    result.set(id, new Set());
  }
  if (branchIds.length === 0) return result;

  const rows = await prisma.orderItem.groupBy({
    by: ["branchMenuItemId"],
    where: {
      order: {
        branchId: { in: branchIds },
        status: OrderStatus.COMPLETED,
      },
    },
    _sum: { quantity: true },
  });

  if (rows.length === 0) return result;

  const itemIds = rows.map((r) => r.branchMenuItemId);

  const items = await prisma.branchMenuItem.findMany({
    where: { id: { in: itemIds }, branchId: { in: branchIds } },
    select: { id: true, branchId: true },
  });
  const branchByItem = new Map(items.map((i) => [i.id, i.branchId]));

  type RankRow = { menuItemId: string; qty: number };
  const byBranch = new Map<string, RankRow[]>();

  for (const row of rows) {
    const menuItemId = row.branchMenuItemId;
    const branchId = branchByItem.get(menuItemId);
    if (!branchId) continue;
    const qty = row._sum.quantity ?? 0;
    if (qty < BESTSELLER_MIN_QTY) continue;
    const list = byBranch.get(branchId) ?? [];
    list.push({ menuItemId, qty });
    byBranch.set(branchId, list);
  }

  for (const [branchId, list] of byBranch) {
    list.sort((a, b) => b.qty - a.qty || a.menuItemId.localeCompare(b.menuItemId));
    const top = list.slice(0, BESTSELLER_TOP_N);
    result.set(branchId, new Set(top.map((r) => r.menuItemId)));
  }

  return result;
}

export type MenuItemWithBestseller<T> = T & { isBestSeller: boolean };

export function attachBestsellerFlag<T extends { id: string }>(
  menuItems: T[],
  bestsellerIds: Set<string> | undefined,
): MenuItemWithBestseller<T>[] {
  const set = bestsellerIds ?? new Set<string>();
  return menuItems.map((item) => ({
    ...item,
    isBestSeller: set.has(item.id),
  }));
}
