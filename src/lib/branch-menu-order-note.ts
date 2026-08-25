/** Client-safe helpers for BranchMenuItemStockHistory.note on SALE rows */

export const BRANCH_MENU_ORDER_NOTE_PREFIX = "ORDER:";

export function branchMenuOrderNote(orderId: string, orderNumber: string) {
  return `${BRANCH_MENU_ORDER_NOTE_PREFIX}${orderId}|${orderNumber}`;
}

/** Parse `ORDER:{orderId}|{orderNumber}` from BranchMenuItemStockHistory.note */
export function parseBranchMenuOrderNote(
  note: string | null | undefined,
): { orderId: string; orderNumber: string } | null {
  if (!note || !note.startsWith(BRANCH_MENU_ORDER_NOTE_PREFIX)) return null;
  const rest = note.slice(BRANCH_MENU_ORDER_NOTE_PREFIX.length);
  const pipe = rest.indexOf("|");
  if (pipe < 0) {
    const orderId = rest.trim();
    return orderId ? { orderId, orderNumber: "" } : null;
  }
  const orderId = rest.slice(0, pipe).trim();
  if (!orderId) return null;
  return { orderId, orderNumber: rest.slice(pipe + 1).trim() };
}
