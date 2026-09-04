/**
 * Remove duplicate BranchMenuItem rows per branch.
 *
 * Groups by (branchId, categoryId, name) — itemCode often differs after
 * re-import / code assignment, so name+category is the user-visible duplicate.
 *
 * Usage:
 *   npx tsx scripts/dedupe-branch-menu-items.ts
 *   npx tsx scripts/dedupe-branch-menu-items.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");

function groupKey(item: {
  branchId: string;
  categoryId: string | null;
  name: string;
}): string {
  return `${item.branchId}::${item.categoryId ?? ""}::${item.name.trim().toLocaleLowerCase("th")}`;
}

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
    brand: { name: string; code: string };
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

  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

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
    const key = groupKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const dupGroups = [...groups.entries()].filter(([, list]) => list.length > 1);
  if (dupGroups.length === 0) {
    console.log("No duplicates found.");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  let totalRemove = 0;
  const plan: Array<{
    brand: string;
    branch: string;
    name: string;
    keep: ItemRow;
    remove: ItemRow[];
  }> = [];

  for (const [, list] of dupGroups) {
    const sorted = [...list].sort((a, b) => {
      const ds = score(b) - score(a);
      if (ds !== 0) return ds;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const keep = sorted[0]!;
    const remove = sorted.slice(1);
    totalRemove += remove.length;
    plan.push({
      brand: keep.branch.brand
        ? `${keep.branch.brand.name} (${keep.branch.brand.code})`
        : "(no brand)",
      branch: `${keep.branch.name}${keep.branch.code ? ` /${keep.branch.code}` : ""}`,
      name: keep.name,
      keep,
      remove,
    });
  }

  // Summary by brand
  const byBrand = new Map<string, { groups: number; remove: number }>();
  for (const g of plan) {
    const cur = byBrand.get(g.brand) ?? { groups: 0, remove: 0 };
    cur.groups += 1;
    cur.remove += g.remove.length;
    byBrand.set(g.brand, cur);
  }
  console.log(`\nDuplicate groups: ${plan.length}`);
  console.log(`Rows to remove: ${totalRemove}`);
  console.log("\nBy brand:");
  for (const [brand, s] of [...byBrand.entries()].sort((a, b) => b[1].remove - a[1].remove)) {
    console.log(`  ${brand}: ${s.groups} names, remove ${s.remove}`);
  }

  // Sample
  console.log("\nSample (first 25):");
  for (const g of plan.slice(0, 25)) {
    const keepVis = g.keep.isHidden ? "hidden" : "visible";
    console.log(
      `• ${g.brand} › ${g.branch} › ${g.name} (keep ${keepVis} ${g.keep.itemCode ?? "no-code"}, drop ${g.remove.length})`,
    );
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to clean.");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < plan.length; i += 1) {
    const g = plan[i]!;
    const keepId = g.keep.id;
    const removeIds = g.remove.map((r) => r.id);

    try {
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

      deleted += removeIds.length;
      if ((i + 1) % 50 === 0 || i === plan.length - 1) {
        console.log(`progress ${i + 1}/${plan.length} (deleted ${deleted})`);
      }
    } catch (err) {
      failed += 1;
      console.error(
        `FAILED ${g.brand} › ${g.branch} › ${g.name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `\nDone. Deleted ${deleted} duplicate menu rows across ${plan.length - failed} groups (${failed} failed).`,
  );
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
