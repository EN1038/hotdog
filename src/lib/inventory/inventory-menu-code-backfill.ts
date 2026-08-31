import { BranchKind, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assignSequentialMenuItemCodes,
  formatSequentialMenuItemCode,
  isMenuItemEligibleForProductCode,
  MENU_ITEM_CODE_START,
} from "@/lib/inventory/inventory-menu-code-assign";

export type ProductCodeBackfillSample = {
  kind: "menu" | "non_menu";
  id: string;
  name: string;
  itemCode: string;
  previousCode: string | null;
};

export type ProductCodeBackfillBranchResult = {
  branchId: string;
  branchName: string;
  updated: number;
  menuUpdated: number;
  nonMenuUpdated: number;
  startCode: string | null;
  endCode: string | null;
  samples: ProductCodeBackfillSample[];
};

export type ProductCodeBackfillOptions = {
  dryRun?: boolean;
  /** Reassign all eligible menu items from 10001 (legacy). Default: fill missing only. */
  reassignEligibleMenu?: boolean;
};

const menuInclude = {
  category: { select: { sortOrder: true, stockExempt: true } },
  optionGroupLinks: {
    include: { group: { select: { mode: true } } },
  },
} satisfies Prisma.BranchMenuItemInclude;

type MenuRow = Prisma.BranchMenuItemGetPayload<{ include: typeof menuInclude }>;

function parseBranchProductCodeNum(code: string | null | undefined): number | null {
  const trimmed = code?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= MENU_ITEM_CODE_START ? n : null;
}

async function maxAssignedBranchProductCodeNum(
  branchId: string,
): Promise<number> {
  const [menuCodes, nonMenuCodes] = await Promise.all([
    prisma.branchMenuItem.findMany({
      where: { branchId, itemCode: { not: null } },
      select: { itemCode: true },
    }),
    prisma.branchNonMenuItem.findMany({
      where: { branchId, itemCode: { not: null } },
      select: { itemCode: true },
    }),
  ]);

  let max = MENU_ITEM_CODE_START - 1;
  for (const row of [...menuCodes, ...nonMenuCodes]) {
    const n = parseBranchProductCodeNum(row.itemCode);
    if (n != null && n > max) max = n;
  }
  return max;
}

function menuEligibleRank(item: MenuRow): number {
  return isMenuItemEligibleForProductCode(item) ? 0 : 1;
}

function sortMissingMenuItems(items: MenuRow[]): MenuRow[] {
  return [...items].sort(
    (a, b) =>
      menuEligibleRank(a) - menuEligibleRank(b) ||
      (a.category?.sortOrder ?? 999) - (b.category?.sortOrder ?? 999) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name, "th"),
  );
}

type MissingTarget =
  | { kind: "menu"; id: string; name: string }
  | { kind: "non_menu"; id: string; name: string };

async function collectMissingProductCodeTargets(
  branchId: string,
): Promise<MissingTarget[]> {
  const [menuItems, nonMenuItems] = await Promise.all([
    prisma.branchMenuItem.findMany({
      where: { branchId, itemCode: null },
      include: menuInclude,
    }),
    prisma.branchNonMenuItem.findMany({
      where: { branchId, itemCode: null },
      orderBy: [
        { stockType: "asc" },
        { keyOrderSortOrder: "asc" },
        { name: "asc" },
      ],
    }),
  ]);

  const targets: MissingTarget[] = [];

  for (const item of sortMissingMenuItems(menuItems)) {
    targets.push({ kind: "menu", id: item.id, name: item.name });
  }

  for (const item of nonMenuItems) {
    targets.push({ kind: "non_menu", id: item.id, name: item.name });
  }

  return targets;
}

function assignCodesFromStart(
  targets: MissingTarget[],
  startIndex: number,
): Array<MissingTarget & { itemCode: string }> {
  return targets.map((target, index) => ({
    ...target,
    itemCode: formatSequentialMenuItemCode(startIndex + index),
  }));
}

async function applyProductCodeAssignments(
  assignments: Array<MissingTarget & { itemCode: string }>,
) {
  const chunkSize = 30;
  for (let i = 0; i < assignments.length; i += chunkSize) {
    const chunk = assignments.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(({ kind, id, itemCode }) =>
        kind === "menu"
          ? prisma.branchMenuItem.update({ where: { id }, data: { itemCode } })
          : prisma.branchNonMenuItem.update({
              where: { id },
              data: { itemCode },
            }),
      ),
    );
  }
}

export async function backfillBranchMissingProductCodes(
  branchId: string,
  options: ProductCodeBackfillOptions = {},
): Promise<ProductCodeBackfillBranchResult> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, kind: true },
  });
  if (!branch) throw new Error("NOT_FOUND");
  if (branch.kind === BranchKind.WAREHOUSE) {
    throw new Error("WAREHOUSE_BRANCH");
  }

  if (options.reassignEligibleMenu) {
    return backfillBranchEligibleMenuReassign(branchId, branch.name, options);
  }

  const targets = await collectMissingProductCodeTargets(branchId);
  const maxCode = await maxAssignedBranchProductCodeNum(branchId);
  const startIndex = Math.max(maxCode + 1 - MENU_ITEM_CODE_START, 0);
  const assignments = assignCodesFromStart(targets, startIndex);

  const samples: ProductCodeBackfillSample[] = assignments
    .slice(0, 10)
    .map(({ kind, id, name, itemCode }) => ({
      kind,
      id,
      name,
      itemCode,
      previousCode: null,
    }));

  const result: ProductCodeBackfillBranchResult = {
    branchId: branch.id,
    branchName: branch.name,
    updated: assignments.length,
    menuUpdated: assignments.filter((a) => a.kind === "menu").length,
    nonMenuUpdated: assignments.filter((a) => a.kind === "non_menu").length,
    startCode: assignments[0]?.itemCode ?? null,
    endCode: assignments.at(-1)?.itemCode ?? null,
    samples,
  };

  if (options.dryRun || assignments.length === 0) {
    return result;
  }

  await applyProductCodeAssignments(assignments);
  return result;
}

async function backfillBranchEligibleMenuReassign(
  branchId: string,
  branchName: string,
  options: ProductCodeBackfillOptions,
): Promise<ProductCodeBackfillBranchResult> {
  const menuItems = await prisma.branchMenuItem.findMany({
    where: { branchId },
    include: menuInclude,
    orderBy: [
      { category: { sortOrder: "asc" } },
      { sortOrder: "asc" },
      { name: "asc" },
    ],
  });

  const eligible = menuItems.filter(isMenuItemEligibleForProductCode);
  const assignments = assignSequentialMenuItemCodes(eligible);
  const byId = new Map(eligible.map((item) => [item.id, item]));

  const samples: ProductCodeBackfillSample[] = assignments
    .slice(0, 8)
    .map(({ id, itemCode }) => {
      const item = byId.get(id)!;
      return {
        kind: "menu" as const,
        id,
        name: item.name,
        itemCode,
        previousCode: item.itemCode?.trim() || null,
      };
    });

  const result: ProductCodeBackfillBranchResult = {
    branchId,
    branchName,
    updated: assignments.length,
    menuUpdated: assignments.length,
    nonMenuUpdated: 0,
    startCode: assignments[0]?.itemCode ?? null,
    endCode: assignments.at(-1)?.itemCode ?? null,
    samples,
  };

  if (options.dryRun || assignments.length === 0) {
    return result;
  }

  const ids = assignments.map((a) => a.id);
  await prisma.branchMenuItem.updateMany({
    where: { branchId, id: { in: ids } },
    data: { itemCode: null },
  });

  await applyProductCodeAssignments(
    assignments.map(({ id, itemCode }) => ({
      kind: "menu" as const,
      id,
      name: byId.get(id)!.name,
      itemCode,
    })),
  );

  return result;
}

export async function backfillAllStoreMissingProductCodes(
  options: ProductCodeBackfillOptions & {
    branchId?: string;
    brandId?: string;
  } = {},
): Promise<{
  branches: ProductCodeBackfillBranchResult[];
  totalUpdated: number;
  totalMenuUpdated: number;
  totalNonMenuUpdated: number;
}> {
  const branches = await prisma.branch.findMany({
    where: {
      kind: BranchKind.STORE,
      ...(options.branchId ? { id: options.branchId } : {}),
      ...(options.brandId ? { brandId: options.brandId } : {}),
    },
    select: { id: true },
    orderBy: [{ brandId: "asc" }, { name: "asc" }],
  });

  const results: ProductCodeBackfillBranchResult[] = [];
  let totalUpdated = 0;
  let totalMenuUpdated = 0;
  let totalNonMenuUpdated = 0;

  for (const branch of branches) {
    const result = await backfillBranchMissingProductCodes(branch.id, options);
    if (result.updated > 0) {
      results.push(result);
      if (!options.dryRun) {
        totalUpdated += result.updated;
        totalMenuUpdated += result.menuUpdated;
        totalNonMenuUpdated += result.nonMenuUpdated;
      }
    }
  }

  return { branches: results, totalUpdated, totalMenuUpdated, totalNonMenuUpdated };
}

export { MENU_ITEM_CODE_START };
