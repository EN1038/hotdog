const KEY = "skillsale_menu_scroll_v1";

type MenuScrollRestore = {
  branchId: string;
  itemId: string;
};

export function menuItemDomId(itemId: string) {
  return `menu-item-${itemId}`;
}

/** Remember which menu row to restore after viewing item detail. */
export function markMenuItemScroll(branchId: string, itemId: string) {
  try {
    const payload: MenuScrollRestore = { branchId, itemId };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/** Read pending restore for this branch without clearing. */
export function readMenuItemScroll(branchId: string): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as MenuScrollRestore;
    if (data.branchId !== branchId || !data.itemId) return null;
    return data.itemId;
  } catch {
    return null;
  }
}

/** Drop pending restore (e.g. editing from checkout should not scroll the store). */
export function clearMenuItemScroll() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function scrollToMenuItem(itemId: string) {
  const el = document.getElementById(menuItemDomId(itemId));
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}
