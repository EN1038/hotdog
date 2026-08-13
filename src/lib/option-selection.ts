import type { MenuOptionGroupData } from "@/lib/customer-types";

export type SelectedByGroup = Record<string, string[]>;

export function selectionCount(ids: string[]): number {
  return ids.length;
}

export function effectiveMinSelect(group: MenuOptionGroupData): number {
  if (group.minSelect != null && group.minSelect > 0) return group.minSelect;
  return group.required ? 1 : 0;
}

/**
 * Groups with empty visibleWhenOptionIds are always shown.
 * Others appear only when one of those option IDs is selected in a currently visible group.
 *
 * Fallback: groups named like "น้ำชาบู" without visibleWhenOptionIds (stale API/Prisma)
 * gate on any option named "ชาบู" in the same option set.
 */
export function filterVisibleOptionGroups(
  optionGroups: MenuOptionGroupData[],
  selectedByGroup: SelectedByGroup,
): MenuOptionGroupData[] {
  if (optionGroups.length === 0) return [];

  const shabuOptionIds = optionGroups
    .flatMap((g) => g.options)
    .filter((o) => o.name === "ชาบู")
    .map((o) => o.id);

  const groups = optionGroups.map((g) => {
    if (g.visibleWhenOptionIds?.length) return g;
    if (/น้ำ\s*ชาบู/u.test(g.name) && shabuOptionIds.length > 0) {
      return { ...g, visibleWhenOptionIds: shabuOptionIds };
    }
    return g;
  });

  let visibleIds = new Set(
    groups
      .filter((g) => !(g.visibleWhenOptionIds?.length))
      .map((g) => g.id),
  );
  for (let i = 0; i < groups.length + 1; i += 1) {
    const selectedIds = new Set<string>();
    for (const g of groups) {
      if (!visibleIds.has(g.id)) continue;
      for (const id of selectedByGroup[g.id] ?? []) selectedIds.add(id);
    }
    const next = new Set<string>();
    for (const g of groups) {
      const when = g.visibleWhenOptionIds ?? [];
      if (when.length === 0 || when.some((id) => selectedIds.has(id))) {
        next.add(g.id);
      }
    }
    if (
      next.size === visibleIds.size &&
      [...next].every((id) => visibleIds.has(id))
    ) {
      break;
    }
    visibleIds = next;
  }
  return groups.filter((g) => visibleIds.has(g.id));
}

/** Drop selections for groups that are currently hidden. */
export function pruneHiddenGroupSelections(
  optionGroups: MenuOptionGroupData[],
  selectedByGroup: SelectedByGroup,
): SelectedByGroup {
  const visible = new Set(
    filterVisibleOptionGroups(optionGroups, selectedByGroup).map((g) => g.id),
  );
  const next: SelectedByGroup = {};
  for (const [gid, ids] of Object.entries(selectedByGroup)) {
    if (visible.has(gid) && ids.length > 0) next[gid] = ids;
  }
  return next;
}

export function validateOptionGroupSelections(
  optionGroups: MenuOptionGroupData[],
  selectedByGroup: SelectedByGroup,
): { error: string; groupId: string } | null {
  const visible = filterVisibleOptionGroups(optionGroups, selectedByGroup);
  for (const group of visible) {
    const selected = selectedByGroup[group.id] ?? [];
    const count = selectionCount(selected);
    const min = effectiveMinSelect(group);
    if (count < min) {
      const msg =
        min === group.maxSelect && min > 1
          ? `กรุณาเลือก "${group.name}" ให้ครบ ${min} รายการ`
          : count === 0
            ? `กรุณาเลือก "${group.name}"`
            : `กรุณาเลือก "${group.name}" อีก ${min - count} รายการ`;
      return { error: msg, groupId: group.id };
    }
    if (count > group.maxSelect) {
      return {
        error: `"${group.name}" เลือกได้สูงสุด ${group.maxSelect} รายการ`,
        groupId: group.id,
      };
    }
  }
  return null;
}

export function computeSelectedOptions(
  optionGroups: MenuOptionGroupData[],
  selectedByGroup: SelectedByGroup,
): { optionIds: string[]; optionNames: string[]; optionsPrice: number } {
  const visible = filterVisibleOptionGroups(optionGroups, selectedByGroup);
  const optionIds = visible.flatMap((g) => selectedByGroup[g.id] ?? []);
  const allOptions = visible.flatMap((g) => g.options);
  const chosen = optionIds
    .map((id) => allOptions.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o));
  return {
    optionIds: chosen.map((o) => o.id),
    optionNames: chosen.map((o) => o.name),
    optionsPrice: chosen.reduce((s, o) => s + Number(o.priceDelta), 0),
  };
}

/** Expand qty map to flat option id list (for duplicate selections). */
export function qtyMapToOptionIds(qtyByOptionId: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [id, qty] of Object.entries(qtyByOptionId)) {
    const n = Math.max(0, Math.floor(qty));
    for (let i = 0; i < n; i++) out.push(id);
  }
  return out;
}

export function optionIdsToQtyMap(optionIds: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const id of optionIds) {
    map[id] = (map[id] ?? 0) + 1;
  }
  return map;
}

export function adjustOptionQty(
  current: Record<string, number>,
  optionId: string,
  delta: number,
  maxTotal: number,
): Record<string, number> {
  const total = Object.values(current).reduce((s, n) => s + n, 0);
  const cur = current[optionId] ?? 0;
  const nextQty = cur + delta;
  if (nextQty < 0) return current;
  if (delta > 0 && total >= maxTotal) return current;
  const next = { ...current };
  if (nextQty === 0) delete next[optionId];
  else next[optionId] = nextQty;
  return next;
}

export function groupUsesQuantityPicker(group: MenuOptionGroupData): boolean {
  return (
    group.mode === "FROM_MENU" ||
    group.allowDuplicateSelections === true ||
    (group.minSelect > 1 && group.minSelect === group.maxSelect)
  );
}

/** Server-side validation for order item optionIds (supports duplicates). */
export function validateOrderItemOptionIds(
  groups: Array<{
    id: string;
    name: string;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    visibleWhenOptionIds?: string[];
    options: Array<{ id: string; name: string }>;
  }>,
  optionIds: string[],
): string | null {
  const byGroup: SelectedByGroup = {};
  for (const g of groups) byGroup[g.id] = [];
  const optionToGroup = new Map<string, string>();
  for (const g of groups) {
    for (const o of g.options) optionToGroup.set(o.id, g.id);
  }
  for (const id of optionIds) {
    const gid = optionToGroup.get(id);
    if (!gid) return "ตัวเลือกไม่ถูกต้อง";
    byGroup[gid]!.push(id);
  }

  const asMenuGroups: MenuOptionGroupData[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    required: g.required,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    visibleWhenOptionIds: g.visibleWhenOptionIds ?? [],
    options: g.options.map((o) => ({
      id: o.id,
      name: o.name,
      priceDelta: "0",
    })),
  }));
  const visible = filterVisibleOptionGroups(asMenuGroups, byGroup);
  const visibleIds = new Set(visible.map((g) => g.id));

  for (const id of optionIds) {
    const gid = optionToGroup.get(id)!;
    if (!visibleIds.has(gid)) {
      return "มีตัวเลือกที่ไม่ตรงกับเงื่อนไขที่เลือก";
    }
  }

  for (const g of visible) {
    const selected = byGroup[g.id] ?? [];
    const min =
      g.minSelect > 0 ? g.minSelect : g.required ? 1 : 0;
    if (selected.length < min) {
      return `กรุณาเลือก "${g.name}" ให้ครบตามเงื่อนไข`;
    }
    if (selected.length > g.maxSelect) {
      return `"${g.name}" เลือกได้สูงสุด ${g.maxSelect} รายการ`;
    }
  }
  return null;
}
