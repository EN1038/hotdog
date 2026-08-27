import { OptionGroupMode, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

export function generateShareCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let out = "HD-";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export type BranchImportResult = {
  categories: number;
  optionGroups: number;
  menuItems: number;
  locations: number;
  nonMenuItems: {
    created: number;
    updated: number;
  };
};

function nonMenuKey(stockType: string, name: string) {
  return `${stockType}::${name.trim()}`;
}

const optionGroupImportInclude = {
  options: { orderBy: { createdAt: "asc" as const } },
  menuItemSources: { orderBy: { sortOrder: "asc" as const } },
} as const;

type SourceOptionGroup = {
  id: string;
  name: string;
  mode: OptionGroupMode;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  allowDuplicateSelections: boolean;
  sortOrder?: number;
  options: Array<{ id: string; name: string; priceDelta: Prisma.Decimal }>;
  menuItemSources: Array<{
    menuItemId: string;
    sortOrder: number;
    isEnabled: boolean;
    priceDelta: Prisma.Decimal;
  }>;
};

function buildOptionGroupCreateData(
  src: SourceOptionGroup,
  targetBranchId: string,
  menuItemIdMap: Map<string, string>,
) {
  const fromMenu = src.mode === OptionGroupMode.FROM_MENU;
  const menuSources = fromMenu
    ? src.menuItemSources
        .map((s) => {
          const menuItemId = menuItemIdMap.get(s.menuItemId);
          if (!menuItemId) return null;
          return {
            menuItemId,
            sortOrder: s.sortOrder,
            isEnabled: s.isEnabled,
            priceDelta: s.priceDelta,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null)
    : [];

  return {
    branchId: targetBranchId,
    name: src.name,
    mode: src.mode,
    required: src.required,
    minSelect: src.minSelect,
    maxSelect: src.maxSelect,
    allowDuplicateSelections: src.allowDuplicateSelections,
    sortOrder: src.sortOrder ?? 0,
    ...(!fromMenu && src.options.length > 0
      ? {
          options: {
            create: src.options.map((o) => ({
              name: o.name,
              priceDelta: o.priceDelta,
            })),
          },
        }
      : {}),
    ...(fromMenu && menuSources.length > 0
      ? { menuItemSources: { create: menuSources } }
      : {}),
  };
}

/** Copy categories, option library, menu (and optional locations / non-menu stock) from source → target */
export async function importBranchCatalog(opts: {
  sourceBranchId: string;
  targetBranchId: string;
  overwriteMenu?: boolean;
  includeLocations?: boolean;
  includeNonMenuItems?: boolean;
}): Promise<BranchImportResult> {
  const {
    sourceBranchId,
    targetBranchId,
    overwriteMenu = false,
    includeLocations = false,
    includeNonMenuItems = false,
  } = opts;

  if (sourceBranchId === targetBranchId) {
    throw new Error("ไม่สามารถนำเข้าจากสาขาเดียวกัน");
  }

  const [
    sourceCategories,
    sourceOptionGroups,
    sourceItems,
    sourceLocations,
    sourceNonMenuItems,
  ] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { branchId: sourceBranchId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.branchOptionGroup.findMany({
      where: { branchId: sourceBranchId },
      include: optionGroupImportInclude,
      orderBy: { createdAt: "asc" },
    }),
    prisma.branchMenuItem.findMany({
      where: { branchId: sourceBranchId },
      include: {
        optionGroupLinks: {
          orderBy: { createdAt: "asc" },
          include: { group: true },
        },
      },
      orderBy: [
        { isHidden: "asc" },
        { sortOrder: "asc" },
        { createdAt: "desc" },
      ],
    }),
    includeLocations
      ? prisma.deliveryLocation.findMany({
          where: { branchId: sourceBranchId },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    includeNonMenuItems
      ? prisma.branchNonMenuItem.findMany({
          where: { branchId: sourceBranchId },
          orderBy: [{ stockType: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const targetCategories = await prisma.menuCategory.findMany({
    where: { branchId: targetBranchId },
  });
  const categoryByName = new Map(targetCategories.map((c) => [c.name, c]));
  const categoryIdMap = new Map<string, string>();

  let categoriesCreated = 0;
  for (const src of sourceCategories) {
    let dest = categoryByName.get(src.name);
    if (!dest) {
      dest = await prisma.menuCategory.create({
        data: {
          branchId: targetBranchId,
          name: src.name,
          sortOrder: src.sortOrder,
          stockExempt: src.stockExempt,
        },
      });
      categoryByName.set(dest.name, dest);
      categoriesCreated += 1;
    }
    categoryIdMap.set(src.id, dest.id);
  }

  if (overwriteMenu) {
    await prisma.branchMenuItem.deleteMany({
      where: { branchId: targetBranchId },
    });
  }

  const menuItemIdMap = new Map<string, string>();
  let menuItemsCreated = 0;
  for (const item of sourceItems) {
    const created = await prisma.branchMenuItem.create({
      data: {
        branchId: targetBranchId,
        name: item.name,
        price: item.price,
        pickupPrice: item.pickupPrice ?? item.price,
        storefrontPrice: item.storefrontPrice ?? item.price,
        sellDelivery: item.sellDelivery,
        sellPickup: item.sellPickup,
        sellStorefront: item.sellStorefront,
        promoEnabled: item.promoEnabled,
        promoType: item.promoType,
        promoValue: item.promoValue,
        promoContinuous: item.promoContinuous,
        promoStartsAt: item.promoStartsAt,
        promoEndsAt: item.promoEndsAt,
        description: item.description,
        categoryId: item.categoryId
          ? (categoryIdMap.get(item.categoryId) ?? null)
          : null,
        imageUrl: item.imageUrl,
        skewerImageUrl: item.skewerImageUrl,
        quantityUnit: item.quantityUnit,
        sticksPerUnit: item.sticksPerUnit ?? 1,
        countsAsSticks: item.countsAsSticks ?? true,
        skewerMinQty: item.skewerMinQty ?? 1,
        isHidden: item.isHidden,
        hideFromStaff: item.hideFromStaff,
        // Fresh import: never inherit sold-out flag
        isOutOfStock: false,
        sellPiece: item.sellPiece,
        sellByWeight: item.sellByWeight,
        pricePerKg: item.pricePerKg,
        sellSkewer: item.sellSkewer,
        sellGrill: item.sellGrill,
        sellFry: item.sellFry,
        sellShabu: item.sellShabu,
        brandProductId: item.brandProductId,
        sortOrder: item.sortOrder,
      },
    });
    menuItemIdMap.set(item.id, created.id);
    menuItemsCreated += 1;
  }

  const targetGroups = await prisma.branchOptionGroup.findMany({
    where: { branchId: targetBranchId },
  });
  const groupByName = new Map(targetGroups.map((g) => [g.name, g]));
  const groupIdMap = new Map<string, string>();
  let optionGroupsCreated = 0;

  async function ensureGroupMapped(src: SourceOptionGroup) {
    if (groupIdMap.has(src.id)) return;
    let dest = groupByName.get(src.name);
    if (!dest) {
      dest = await prisma.branchOptionGroup.create({
        data: buildOptionGroupCreateData(src, targetBranchId, menuItemIdMap),
      });
      groupByName.set(dest.name, dest);
      optionGroupsCreated += 1;
    }
    groupIdMap.set(src.id, dest.id);
  }

  for (const src of sourceOptionGroups) {
    await ensureGroupMapped(src);
  }

  for (const item of sourceItems) {
    for (const link of item.optionGroupLinks) {
      if (groupIdMap.has(link.group.id)) continue;
      const src = await prisma.branchOptionGroup.findUnique({
        where: { id: link.group.id },
        include: optionGroupImportInclude,
      });
      if (!src) continue;
      await ensureGroupMapped(src);
    }
  }

  for (const item of sourceItems) {
    const destMenuItemId = menuItemIdMap.get(item.id);
    if (!destMenuItemId) continue;
    const links = item.optionGroupLinks
      .map((link) => groupIdMap.get(link.group.id))
      .filter((id): id is string => Boolean(id))
      .map((groupId) => ({ menuItemId: destMenuItemId, groupId }));
    if (links.length === 0) continue;
    await prisma.branchMenuItemOptionGroup.createMany({
      data: links,
      skipDuplicates: true,
    });
  }

  let locationsCreated = 0;
  if (includeLocations) {
    const existingLocs = await prisma.deliveryLocation.findMany({
      where: { branchId: targetBranchId },
    });
    const locNames = new Set(existingLocs.map((l) => l.name));
    for (const loc of sourceLocations) {
      if (locNames.has(loc.name)) continue;
      await prisma.deliveryLocation.create({
        data: {
          branchId: targetBranchId,
          name: loc.name,
          deliveryFee: loc.deliveryFee,
          isCustomAddress: loc.isCustomAddress,
          address: loc.address,
          latitude: loc.latitude,
          longitude: loc.longitude,
        },
      });
      locNames.add(loc.name);
      locationsCreated += 1;
    }
  }

  let nonMenuCreated = 0;
  let nonMenuUpdated = 0;
  if (includeNonMenuItems) {
    const targetNonMenu = await prisma.branchNonMenuItem.findMany({
      where: { branchId: targetBranchId },
    });
    const targetByKey = new Map(
      targetNonMenu.map((item) => [nonMenuKey(item.stockType, item.name), item]),
    );

    for (const src of sourceNonMenuItems) {
      const key = nonMenuKey(src.stockType, src.name);
      const existing = targetByKey.get(key);
      if (!existing) {
        const created = await prisma.branchNonMenuItem.create({
          data: {
            branchId: targetBranchId,
            name: src.name,
            description: src.description,
            unit: src.unit,
            price: src.price,
            imageUrl: src.imageUrl,
            stockType: src.stockType,
            quantity: 0,
            showOnKeyOrder: src.showOnKeyOrder,
            keyOrderSortOrder: src.keyOrderSortOrder,
          },
        });
        targetByKey.set(key, created);
        nonMenuCreated += 1;
        continue;
      }

      await prisma.branchNonMenuItem.update({
        where: { id: existing.id },
        data: {
          description: src.description,
          unit: src.unit,
          price: src.price,
          imageUrl: src.imageUrl,
          showOnKeyOrder: src.showOnKeyOrder,
          keyOrderSortOrder: src.keyOrderSortOrder,
        },
      });
      nonMenuUpdated += 1;
    }
  }

  // Remap visibleWhenOptionIds by (group name + option name)
  const sourceGroupsWithWhen = await prisma.branchOptionGroup.findMany({
    where: {
      branchId: sourceBranchId,
      visibleWhenOptionIds: { isEmpty: false },
    },
    include: { options: true },
  });
  if (sourceGroupsWithWhen.length > 0) {
    const allSourceOptions = await prisma.branchOption.findMany({
      where: { group: { branchId: sourceBranchId } },
      include: { group: { select: { name: true } } },
    });
    const sourceOptMeta = new Map(
      allSourceOptions.map((o) => [
        o.id,
        { groupName: o.group.name, optionName: o.name },
      ]),
    );
    const targetOptions = await prisma.branchOption.findMany({
      where: { group: { branchId: targetBranchId } },
      include: { group: { select: { id: true, name: true } } },
    });
    const targetOptByKey = new Map(
      targetOptions.map((o) => [`${o.group.name}::${o.name}`, o.id]),
    );
    const targetGroupByName = new Map(
      (
        await prisma.branchOptionGroup.findMany({
          where: { branchId: targetBranchId },
          select: { id: true, name: true },
        })
      ).map((g) => [g.name, g.id]),
    );

    for (const src of sourceGroupsWithWhen) {
      const destGroupId = targetGroupByName.get(src.name);
      if (!destGroupId) continue;
      const mapped = src.visibleWhenOptionIds
        .map((oid) => {
          const meta = sourceOptMeta.get(oid);
          if (!meta) return null;
          return targetOptByKey.get(`${meta.groupName}::${meta.optionName}`) ?? null;
        })
        .filter((id): id is string => Boolean(id));
      await prisma.branchOptionGroup.update({
        where: { id: destGroupId },
        data: { visibleWhenOptionIds: mapped },
      });
    }
  }

  return {
    categories: categoriesCreated,
    optionGroups: optionGroupsCreated,
    menuItems: menuItemsCreated,
    locations: locationsCreated,
    nonMenuItems: {
      created: nonMenuCreated,
      updated: nonMenuUpdated,
    },
  };
}

export async function getBranchSharePreview(sourceBranchId: string) {
  const [
    categories,
    optionGroups,
    menuItems,
    locations,
    consumables,
    equipment,
    branch,
  ] = await Promise.all([
    prisma.menuCategory.count({ where: { branchId: sourceBranchId } }),
    prisma.branchOptionGroup.count({ where: { branchId: sourceBranchId } }),
    prisma.branchMenuItem.count({ where: { branchId: sourceBranchId } }),
    prisma.deliveryLocation.count({ where: { branchId: sourceBranchId } }),
    prisma.branchNonMenuItem.count({
      where: { branchId: sourceBranchId, stockType: "CONSUMABLE" },
    }),
    prisma.branchNonMenuItem.count({
      where: { branchId: sourceBranchId, stockType: "EQUIPMENT" },
    }),
    prisma.branch.findUnique({
      where: { id: sourceBranchId },
      select: { id: true, name: true, code: true },
    }),
  ]);
  return {
    branch,
    counts: {
      categories,
      optionGroups,
      menuItems,
      locations,
      consumables,
      equipment,
      nonMenuItems: consumables + equipment,
    },
  };
}
