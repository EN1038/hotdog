/** Prisma include shape for attached branch option groups on a menu item */
export const menuItemOptionGroupInclude = {
  optionGroupLinks: {
    orderBy: { createdAt: "asc" as const },
    include: {
      group: {
        include: {
          options: { orderBy: { createdAt: "asc" as const } },
        },
      },
    },
  },
} as const;

export const branchOptionGroupInclude = {
  options: { orderBy: { createdAt: "asc" as const } },
  _count: { select: { menuItemLinks: true } },
  menuItemLinks: {
    include: {
      menuItem: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type LinkedGroup = {
  createdAt: Date | string;
  group: {
    id: string;
    name: string;
    required: boolean;
    maxSelect: number;
    createdAt?: Date | string;
    options: Array<{
      id: string;
      name: string;
      priceDelta: unknown;
      createdAt?: Date | string;
    }>;
  };
};

/** Flatten junction → optionGroups for admin/customer APIs */
export function flattenMenuItemOptionGroups<T extends { optionGroupLinks: LinkedGroup[] }>(
  item: T,
) {
  const { optionGroupLinks, ...rest } = item;
  return {
    ...rest,
    optionGroups: optionGroupLinks.map((link) => ({
      id: link.group.id,
      name: link.group.name,
      required: link.group.required,
      maxSelect: link.group.maxSelect,
      createdAt: link.group.createdAt,
      options: link.group.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: o.priceDelta,
        createdAt: o.createdAt,
      })),
    })),
    optionGroupIds: optionGroupLinks.map((link) => link.group.id),
  };
}
