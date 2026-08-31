/** Branch sale-item on-hand qty from BranchMenuItemStock (same source as จัดการสต๊อก tab). */
export function resolveMenuAvailableStock(
  stock: { quantity: number } | null | undefined,
): { availableStock: number; stockTracked: boolean } {
  return {
    availableStock: stock?.quantity ?? 0,
    stockTracked: stock != null,
  };
}
