/**
 * Second-pass: merge same display name within a branch even if category differs.
 * Only runs for leftover cases after name+category dedupe.
 *
 *   npx tsx scripts/dedupe-branch-menu-items-by-name.ts
 *   npx tsx scripts/dedupe-branch-menu-items-by-name.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");

type ItemRow = {
  id: string;
  branchId: string;
  itemCode: string | null;
  name: string;
  categoryId: string | null;
  isHidden: boolean;
  hideFromStaff: boolean;
  createdAt: Date;
  branch: {
    name: string;
    code: string | null;
    brand: { name: string; code: string } | null;
  };
  _count: {
    orderItems: number;
    skewerOrderItems: number;
    tableSessionLines: number;
    optionGroupLinks: number;
    optionGroupMenuSources: number;
  };
  stock: { quantity: number } | null;
};

function score(item: ItemRow): number {
  let s = 0;
  if (!item.isHidden) s += 10_000;
  if (!item.hideFromStaff) s += 1_000;
  if (item.itemCode?.trim()) s += 100;
  if (item.stock) s += 50 + Math.max(0, item.stock.quantity);
  s += item._count.orderItems * 20;
  s += item._count.skewerOrderItems * 10;
  s += item._count.tableSessionLines * 5;
  s += item._count.optionGroupLinks;
  s += item._count.optionGroupMenuSources;
  return s;
}

async function mergeGroup(
  prisma: PrismaClient,
  keep: ItemRow,
  remove: ItemRow[],
) {
  const keepId = keep.id;
  const removeIds = remove.map((r) => r.id);

  await prisma.$transaction(async (tx) => {
    const stocks = await tx.branchMenuItemStock.findMany({
      where: { menuItemId: { in: [keepId, ...removeIds] } },
    });
    if (stocks.length > 0) {
      const totalQty = stocks.reduce((s, row) => s + row.quantity, 0);
      const keepStock = stocks.find((s) => s.menuItemId === keepId);
      if (keepStock) {
        await tx.branchMenuItemStock.update({
          where: { menuItemId: keepId },
          data: { quantity: totalQty },
        });
      } else {
        await tx.branchMenuItemStock.create({
          data: { menuItemId: keepId, quantity: totalQty },
        });
      }
      await tx.branchMenuItemStock.deleteMany({
        where: { menuItemId: { in: removeIds } },
      });
    }

    await tx.orderItem.updateMany({
      where: { branchMenuItemId: { in: removeIds } },
      data: { branchMenuItemId: keepId },
    });
    await tx.skewerOrderItem.updateMany({
      where: { branchMenuItemId: { in: removeIds } },
      data: { branchMenuItemId: keepId },
    });
    await tx.tableSessionLine.updateMany({
      where: { branchMenuItemId: { in: removeIds } },
      data: { branchMenuItemId: keepId },
    });
    await tx.branchMenuItemStockHistory.updateMany({
      where: { menuItemId: { in: removeIds } },
      data: { menuItemId: keepId },
    });
    await tx.stockLabel.updateMany({
      where: { menuItemId: { in: removeIds } },
      data: { menuItemId: keepId },
    });
    await tx.branchMenuItemParStockHistory.updateMany({
      where: { menuItemId: { in: removeIds } },
      data: { menuItemId: keepId },
    });

    const tomorrowDupes = await tx.branchTomorrowPlanLine.findMany({
      where: { menuItemId: { in: removeIds } },
    });
    for (const line of tomorrowDupes) {
      const clash = await tx.branchTomorrowPlanLine.findFirst({
        where: {
          branchId: line.branchId,
          menuItemId: keepId,
          planDate: line.planDate,
        },
      });
      if (clash) {
        await tx.branchTomorrowPlanLine.delete({ where: { id: line.id } });
      } else {
        await tx.branchTomorrowPlanLine.update({
          where: { id: line.id },
          data: { menuItemId: keepId },
        });
      }
    }

    await tx.branchMenuItemParStock.deleteMany({
      where: { menuItemId: { in: removeIds } },
    });

    const links = await tx.branchMenuItemOptionGroup.findMany({
      where: { menuItemId: { in: removeIds } },
    });
    for (const link of links) {
      const exists = await tx.branchMenuItemOptionGroup.findFirst({
        where: { menuItemId: keepId, groupId: link.groupId },
      });
      if (!exists) {
        await tx.branchMenuItemOptionGroup.update({
          where: { id: link.id },
          data: { menuItemId: keepId },
        });
      }
    }
    await tx.branchMenuItemOptionGroup.deleteMany({
      where: { menuItemId: { in: removeIds } },
    });

    const sources = await tx.branchOptionGroupMenuItem.findMany({
      where: { menuItemId: { in: removeIds } },
    });
    for (const src of sources) {
      const exists = await tx.branchOptionGroupMenuItem.findFirst({
        where: { menuItemId: keepId, groupId: src.groupId },
      });
      if (!exists) {
        await tx.branchOptionGroupMenuItem.update({
          where: { id: src.id },
          data: { menuItemId: keepId },
        });
      }
    }
    await tx.branchOptionGroupMenuItem.deleteMany({
      where: { menuItemId: { in: removeIds } },
    });

    await tx.branchMenuItem.deleteMany({
      where: { id: { in: removeIds } },
    });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool, {
      schema: process.env.DATABASE_SCHEMA ?? "public",
      disposeExternalPool: false,
    }),
  });

  console.log(APPLY ? "MODE: APPLY (by name)" : "MODE: dry-run (by name)");

  const items = (await prisma.branchMenuItem.findMany({
    select: {
      id: true,
      branchId: true,
      itemCode: true,
      name: true,
      categoryId: true,
      isHidden: true,
      hideFromStaff: true,
      createdAt: true,
      branch: {
        select: {
          name: true,
          code: true,
          brand: { select: { name: true, code: true } },
        },
      },
      _count: {
        select: {
          orderItems: true,
          skewerOrderItems: true,
          tableSessionLines: true,
          optionGroupLinks: true,
          optionGroupMenuSources: true,
        },
      },
      stock: { select: { quantity: true } },
    },
    orderBy: { createdAt: "asc" },
  })) as ItemRow[];

  const groups = new Map<string, ItemRow[]>();
  for (const item of items) {
    const key = `${item.branchId}::${item.name.trim().toLocaleLowerCase("th")}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const dupGroups = [...groups.values()].filter((list) => list.length > 1);
  if (dupGroups.length === 0) {
    console.log("No same-name duplicates left.");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  let totalRemove = 0;
  for (const list of dupGroups) {
    const sorted = [...list].sort((a, b) => {
      const ds = score(b) - score(a);
      if (ds !== 0) return ds;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const keep = sorted[0]!;
    const remove = sorted.slice(1);
    totalRemove += remove.length;
    const brand = keep.branch.brand
      ? `${keep.branch.brand.name} (${keep.branch.brand.code})`
      : "(no brand)";
    console.log(
      `• ${brand} › ${keep.branch.name} › ${keep.name} (cats: ${[
        ...new Set(list.map((i) => i.categoryId ?? "null")),
      ].join(",")}) keep ${keep.isHidden ? "hidden" : "visible"}, drop ${remove.length}`,
    );

    if (APPLY) {
      await mergeGroup(prisma, keep, remove);
    }
  }

  console.log(
    `\n${APPLY ? "Deleted" : "Would remove"} ${totalRemove} rows in ${dupGroups.length} name groups.`,
  );
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
