import type { MenuOptionGroupData } from "@/lib/customer-types";
import type { SelectedByGroup } from "@/lib/option-selection";

const STORAGE_PREFIX = "skillsale-option-defaults:v1:";

type GroupRemembered = {
  ids: string[];
  names: string[];
};

type BranchOptionDefaults = {
  groups: Record<string, GroupRemembered>;
};

function storageKey(branchId: string) {
  return `${STORAGE_PREFIX}${branchId}`;
}

export function loadBranchOptionDefaults(
  branchId: string,
): BranchOptionDefaults | null {
  if (typeof window === "undefined" || !branchId) return null;
  try {
    const raw = localStorage.getItem(storageKey(branchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BranchOptionDefaults;
    if (!parsed?.groups || typeof parsed.groups !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function rememberGroupSelection(
  branchId: string,
  group: MenuOptionGroupData,
  optionIds: string[],
) {
  if (typeof window === "undefined" || !branchId) return;
  const names = optionIds
    .map((id) => group.options.find((o) => o.id === id)?.name)
    .filter((n): n is string => Boolean(n));

  const prev = loadBranchOptionDefaults(branchId) ?? { groups: {} };
  prev.groups[group.id] = { ids: optionIds, names };
  try {
    localStorage.setItem(storageKey(branchId), JSON.stringify(prev));
  } catch {
    /* quota / private mode */
  }
}

/** Apply last choices per option-group id (and match by option name when ids differ). */
export function applyOptionDefaultsToGroups(
  groups: MenuOptionGroupData[],
  defaults: BranchOptionDefaults | null,
): SelectedByGroup {
  const initial: SelectedByGroup = {};
  for (const group of groups) {
    const entry = defaults?.groups[group.id];
    if (!entry) {
      initial[group.id] = [];
      continue;
    }

    const validIds = new Set(group.options.map((o) => o.id));
    let ids = entry.ids.filter((id) => validIds.has(id));

    if (ids.length === 0 && entry.names.length > 0) {
      for (const name of entry.names) {
        const opt = group.options.find((o) => o.name === name);
        if (opt) ids.push(opt.id);
      }
    }

    if (ids.length > group.maxSelect) {
      ids = ids.slice(0, group.maxSelect);
    }

    initial[group.id] = ids;
  }
  return initial;
}
