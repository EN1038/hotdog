import type { OptionGroupMode, Prisma } from "@prisma/client";
import { validateOrderItemOptionIds } from "@/lib/option-selection";

export const optionGroupDetailInclude = {
  options: { orderBy: { createdAt: "asc" } },
  menuItemSources: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      menuItem: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
          isHidden: true,
          isOutOfStock: true,
          category: { select: { id: true, name: true, sortOrder: true } },
        },
      },
    },
  },
} satisfies Prisma.BranchOptionGroupInclude;

/** Prisma include shape for attached branch option groups on a menu item */
export const menuItemOptionGroupInclude = {
  optionGroupLinks: {
    orderBy: { createdAt: "asc" },
    include: {
      group: {
        include: optionGroupDetailInclude,
      },
    },
  },
} satisfies Prisma.BranchMenuItemInclude;

export const branchOptionGroupInclude = {
  ...optionGroupDetailInclude,
  _count: { select: { menuItemLinks: true } },
  menuItemLinks: {
    include: {
      menuItem: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.BranchOptionGroupInclude;

type GroupWithSources = {
  id: string;
  name: string;
  mode: OptionGroupMode;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  allowDuplicateSelections: boolean;
  sortOrder?: number;
  createdAt?: Date | string;
  options: Array<{
    id: string;
    name: string;
    priceDelta: unknown;
    createdAt?: Date | string;
  }>;
  menuItemSources: Array<{
    menuItemId: string;
    sortOrder: number;
    isEnabled: boolean;
    priceDelta: unknown;
    menuItem: {
      id: string;
      name: string;
      imageUrl: string | null;
      isHidden: boolean;
      isOutOfStock: boolean;
      category: { id: string; name: string; sortOrder: number } | null;
    } | null;
  }>;
};

type ExpandedMenuSourceOption = {
  id: string;
  name: string;
  priceDelta: unknown;
  isOutOfStock: boolean;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySortOrder: number;
};

type ExpandedManualOption = {
  id: string;
  name: string;
  priceDelta: unknown;
  isOutOfStock: boolean;
};

type ExpandedGroupOption = ExpandedMenuSourceOption | ExpandedManualOption;

function isExpandedMenuSourceOption(
  option: ExpandedGroupOption,
): option is ExpandedMenuSourceOption {
  return "imageUrl" in option;
}

export function expandGroupOptions(group: GroupWithSources): ExpandedGroupOption[] {
  if (group.mode === "FROM_MENU") {
    return group.menuItemSources
      .filter((s) => s.isEnabled && s.menuItem && !s.menuItem.isHidden)
      .map((s) => ({
        id: s.menuItemId,
        name: s.menuItem!.name,
        priceDelta:
          typeof s.priceDelta === "object" && s.priceDelta != null && "toString" in s.priceDelta
            ? s.priceDelta
            : s.priceDelta,
        isOutOfStock: s.menuItem!.isOutOfStock,
        imageUrl: s.menuItem!.imageUrl,
        categoryId: s.menuItem!.category?.id ?? null,
        categoryName: s.menuItem!.category?.name ?? "อื่นๆ",
        categorySortOrder: s.menuItem!.category?.sortOrder ?? 999,
      }));
  }
  return group.options.map((o) => ({
    id: o.id,
    name: o.name,
    priceDelta: o.priceDelta,
    isOutOfStock: false,
  }));
}

export function serializeOptionGroup(group: GroupWithSources) {
  return {
    id: group.id,
    name: group.name,
    mode: group.mode,
    required: group.required,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    allowDuplicateSelections: group.allowDuplicateSelections,
    sortOrder: group.sortOrder ?? 0,
    createdAt: group.createdAt,
    options: expandGroupOptions(group).map((o) => {
      const base = {
        id: o.id,
        name: o.name,
        priceDelta:
          typeof o.priceDelta === "number"
            ? String(o.priceDelta)
            : o.priceDelta != null
              ? String(o.priceDelta)
              : "0",
        isOutOfStock: o.isOutOfStock,
      };
      if (isExpandedMenuSourceOption(o)) {
        return {
          ...base,
          imageUrl: o.imageUrl ?? null,
          categoryId: o.categoryId ?? null,
          categoryName: o.categoryName ?? null,
          categorySortOrder: o.categorySortOrder,
        };
      }
      return base;
    }),
  };
}

type LinkedGroup = {
  createdAt: Date | string;
  group: GroupWithSources;
};

function linkSortKey(link: LinkedGroup) {
  const sortOrder = link.group.sortOrder ?? 0;
  const created =
    link.group.createdAt != null
      ? new Date(link.group.createdAt).getTime()
      : new Date(link.createdAt).getTime();
  return { sortOrder, created };
}

/** Flatten junction → optionGroups for admin/customer APIs */
export function flattenMenuItemOptionGroups<T extends { optionGroupLinks: LinkedGroup[] }>(
  item: T,
) {
  const { optionGroupLinks, ...rest } = item;
  const links = [...optionGroupLinks].sort((a, b) => {
    const ka = linkSortKey(a);
    const kb = linkSortKey(b);
    return ka.sortOrder - kb.sortOrder || ka.created - kb.created;
  });
  return {
    ...rest,
    optionGroups: links.map((link) => serializeOptionGroup(link.group)),
    optionGroupIds: links.map((link) => link.group.id),
  };
}

import { giftQuantityForFromMenuPack } from "@/lib/order-item-display";

/** Validate and resolve option picks for order creation (supports duplicate ids). */
export function resolveOrderItemOptionsFromPrisma(
  groups: GroupWithSources[],
  optionIds: string[],
):
  | {
      ok: true;
      chosen: Array<{ name: string; priceDelta: number }>;
    }
  | { ok: false; error: string } {
  const serialized = groups.map(serializeOptionGroup);
  const validationError = validateOrderItemOptionIds(serialized, optionIds);
  if (validationError) return { ok: false, error: validationError };
  const all = serialized.flatMap((g) => g.options);
  const chosen: Array<{ name: string; priceDelta: number }> = [];
  for (const id of optionIds) {
    const o = all.find((x) => x.id === id);
    if (!o) return { ok: false, error: "ตัวเลือกไม่ถูกต้อง" };
    chosen.push({ name: o.name, priceDelta: Number(o.priceDelta) });
  }
  return { ok: true, chosen };
}

/**
 * Free pieces for FROM_MENU promo packs on a line
 * (e.g. maxSelect 11 with 11 picks → 1 gift × quantity).
 */
export function computeLineGiftQuantity(
  groups: GroupWithSources[],
  optionIds: string[],
  lineQuantity: number,
): number {
  let total = 0;
  for (const group of groups) {
    if (group.mode !== "FROM_MENU") continue;
    const allowed = new Set(expandGroupOptions(group).map((o) => o.id));
    const selectedCount = optionIds.filter((id) => allowed.has(id)).length;
    total += giftQuantityForFromMenuPack({
      lineQuantity,
      selectedFromMenuCount: selectedCount,
      maxSelect: group.maxSelect,
    });
  }
  return total;
}
