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
};

/** Copy categories, option library, menu (and optional locations) from source → target */
export async function importBranchCatalog(opts: {
  sourceBranchId: string;
  targetBranchId: string;
  overwriteMenu?: boolean;
  includeLocations?: boolean;
}): Promise<BranchImportResult> {
  const {
    sourceBranchId,
    targetBranchId,
    overwriteMenu = false,
    includeLocations = false,
  } = opts;

  if (sourceBranchId === targetBranchId) {
    throw new Error("ไม่สามารถนำเข้าจากสาขาเดียวกัน");
  }

  const [sourceCategories, sourceOptionGroups, sourceItems, sourceLocations] =
    await Promise.all([
      prisma.menuCategory.findMany({
        where: { branchId: sourceBranchId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.branchOptionGroup.findMany({
        where: { branchId: sourceBranchId },
        include: { options: { orderBy: { createdAt: "asc" } } },
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
        },
      });
      categoryByName.set(dest.name, dest);
      categoriesCreated += 1;
    }
    categoryIdMap.set(src.id, dest.id);
  }

  const targetGroups = await prisma.branchOptionGroup.findMany({
    where: { branchId: targetBranchId },
  });
  const groupByName = new Map(targetGroups.map((g) => [g.name, g]));
  const groupIdMap = new Map<string, string>();

  let optionGroupsCreated = 0;
  for (const src of sourceOptionGroups) {
    let dest = groupByName.get(src.name);
    if (!dest) {
      dest = await prisma.branchOptionGroup.create({
        data: {
          branchId: targetBranchId,
          name: src.name,
          required: src.required,
          maxSelect: src.maxSelect,
          options: {
            create: src.options.map((o) => ({
              name: o.name,
              priceDelta: o.priceDelta,
            })),
          },
        },
      });
      groupByName.set(dest.name, dest);
      optionGroupsCreated += 1;
    }
    groupIdMap.set(src.id, dest.id);
  }

  // Also map groups referenced by items that might not be in library loop (same)
  for (const item of sourceItems) {
    for (const link of item.optionGroupLinks) {
      if (groupIdMap.has(link.group.id)) continue;
      const src = await prisma.branchOptionGroup.findUnique({
        where: { id: link.group.id },
        include: { options: true },
      });
      if (!src) continue;
      let dest = groupByName.get(src.name);
      if (!dest) {
        dest = await prisma.branchOptionGroup.create({
          data: {
            branchId: targetBranchId,
            name: src.name,
            required: src.required,
            maxSelect: src.maxSelect,
            options: {
              create: src.options.map((o) => ({
                name: o.name,
                priceDelta: o.priceDelta,
              })),
            },
          },
        });
        groupByName.set(dest.name, dest);
        optionGroupsCreated += 1;
      }
      groupIdMap.set(src.id, dest.id);
    }
  }

  if (overwriteMenu) {
    await prisma.branchMenuItem.deleteMany({
      where: { branchId: targetBranchId },
    });
  }

  let menuItemsCreated = 0;
  for (const item of sourceItems) {
    await prisma.branchMenuItem.create({
      data: {
        branchId: targetBranchId,
        name: item.name,
        price: item.price,
        description: item.description,
        categoryId: item.categoryId
          ? (categoryIdMap.get(item.categoryId) ?? null)
          : null,
        imageUrl: item.imageUrl,
        isHidden: item.isHidden,
        isOutOfStock: item.isOutOfStock,
        sortOrder: item.sortOrder,
        optionGroupLinks: {
          create: item.optionGroupLinks
            .map((link) => groupIdMap.get(link.group.id))
            .filter((id): id is string => Boolean(id))
            .map((groupId) => ({ groupId })),
        },
      },
    });
    menuItemsCreated += 1;
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
        data: { branchId: targetBranchId, name: loc.name },
      });
      locNames.add(loc.name);
      locationsCreated += 1;
    }
  }

  return {
    categories: categoriesCreated,
    optionGroups: optionGroupsCreated,
    menuItems: menuItemsCreated,
    locations: locationsCreated,
  };
}

export async function getBranchSharePreview(sourceBranchId: string) {
  const [categories, optionGroups, menuItems, locations, branch] =
    await Promise.all([
      prisma.menuCategory.count({ where: { branchId: sourceBranchId } }),
      prisma.branchOptionGroup.count({ where: { branchId: sourceBranchId } }),
      prisma.branchMenuItem.count({ where: { branchId: sourceBranchId } }),
      prisma.deliveryLocation.count({ where: { branchId: sourceBranchId } }),
      prisma.branch.findUnique({
        where: { id: sourceBranchId },
        select: { id: true, name: true, code: true },
      }),
    ]);
  return {
    branch,
    counts: { categories, optionGroups, menuItems, locations },
  };
}
