/** Best-effort map of persisted optionsText names → option ids. */
export function reconstructOptionIdsFromText(
  groups: Array<{
    mode?: string;
    options?: Array<{ id: string; name: string }>;
    menuItemSources?: Array<{
      isEnabled: boolean;
      menuItemId: string;
      menuItem: { name: string; isHidden: boolean } | null;
    }>;
  }>,
  optionsText: string | null | undefined,
): string[] {
  if (!optionsText?.trim()) return [];
  const names = optionsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const flat: Array<{ id: string; name: string }> = [];
  for (const g of groups) {
    if (g.options && g.options.length > 0) {
      for (const o of g.options) flat.push({ id: o.id, name: o.name });
      continue;
    }
    if (g.mode === "FROM_MENU" && g.menuItemSources) {
      for (const s of g.menuItemSources) {
        if (!s.isEnabled || !s.menuItem || s.menuItem.isHidden) continue;
        flat.push({ id: s.menuItemId, name: s.menuItem.name });
      }
    }
  }

  const ids: string[] = [];
  for (const name of names) {
    const match = flat.find((o) => o.name === name);
    if (match) ids.push(match.id);
  }
  return ids;
}
