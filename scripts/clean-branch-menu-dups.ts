/**
 * Find & remove duplicate BranchMenuItem names on one branch.
 * Keeps one visible/best row; deletes the rest.
 *
 *   npx tsx scripts/clean-branch-menu-dups.ts
 *   npx tsx scripts/clean-branch-menu-dups.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });
config({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BRANCH_ID = "cmsiu0mbw0006z4uqj4ksddoc";
const APPLY = process.argv.includes("--apply");

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

type ItemRow = {
  id: string;
  name: string;
  isHidden: boolean;
  hideFromStaff: boolean;
  isOutOfStock: boolean;
  imageUrl: string | null;
  skewerImageUrl: string | null;
  createdAt: Date;
  sortOrder: number;
  stockQty: number | null;
  orderItemCount: number;
  skewerOrderItemCount: number;
};

function score(item: ItemRow) {
  let s = 0;
  if (!item.isHidden) s += 1000;
  if (!item.hideFromStaff) s += 100;
  if ((item.stockQty ?? 0) > 0) s += 50;
  if (item.imageUrl) s += 20;
  if (item.skewerImageUrl) s += 20;
  if (!item.isOutOfStock) s += 10;
  s += item.orderItemCount + item.skewerOrderItemCount;
  // Prefer older (first imported) when otherwise equal
  s -= item.createdAt.getTime() / 1e15;
  return s;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: process.env.DATABASE_URL },
      { schema: process.env.DATABASE_SCHEMA ?? "public" },
    ),
  });

  try {
    const branch = await prisma.branch.findUnique({
      where: { id: BRANCH_ID },
      select: { id: true, name: true },
    });
    if (!branch) throw new Error(`ไม่พบสาขา ${BRANCH_ID}`);

    const items = await prisma.branchMenuItem.findMany({
      where: { branchId: BRANCH_ID },
      select: {
        id: true,
        name: true,
        isHidden: true,
        hideFromStaff: true,
        isOutOfStock: true,
        imageUrl: true,
        skewerImageUrl: true,
        createdAt: true,
        sortOrder: true,
        stock: { select: { quantity: true } },
        _count: {
          select: { orderItems: true, skewerOrderItems: true },
        },
      },
    });

    const rows: ItemRow[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      isHidden: i.isHidden,
      hideFromStaff: i.hideFromStaff,
      isOutOfStock: i.isOutOfStock,
      imageUrl: i.imageUrl,
      skewerImageUrl: i.skewerImageUrl,
      createdAt: i.createdAt,
      sortOrder: i.sortOrder,
      stockQty: i.stock?.quantity ?? null,
      orderItemCount: i._count.orderItems,
      skewerOrderItemCount: i._count.skewerOrderItems,
    }));

    const groups = new Map<string, ItemRow[]>();
    for (const row of rows) {
      const key = normalizeName(row.name);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    const plans: Array<{
      name: string;
      keep: ItemRow;
      remove: ItemRow[];
    }> = [];

    for (const [name, list] of groups) {
      if (list.length < 2) continue;
      const ranked = [...list].sort((a, b) => score(b) - score(a));
      const keep = ranked[0]!;
      const remove = ranked.slice(1);
      plans.push({ name, keep, remove });
    }

    const visibleDupGroups = plans.filter(
      (p) => p.remove.some((r) => !r.isHidden) || !p.keep.isHidden,
    ).filter((p) => {
      const visible = [p.keep, ...p.remove].filter((x) => !x.isHidden);
      return visible.length > 1;
    });

    console.log(`branch=${branch.name} (${branch.id})`);
    console.log(`mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
    console.log(`total items=${rows.length}`);
    console.log(`duplicate name groups=${plans.length}`);
    console.log(
      `groups with 2+ visible rows=${visibleDupGroups.length}`,
    );
    console.log(
      `rows to remove=${plans.reduce((s, p) => s + p.remove.length, 0)}`,
    );

    for (const p of plans.slice(0, 15)) {
      console.log(
        `\n[${p.name}] keep ${p.keep.id} hidden=${p.keep.isHidden} stock=${p.keep.stockQty ?? "-"} orders=${p.keep.orderItemCount + p.keep.skewerOrderItemCount}`,
      );
      for (const r of p.remove) {
        console.log(
          `  remove ${r.id} hidden=${r.isHidden} stock=${r.stockQty ?? "-"} orders=${r.orderItemCount + r.skewerOrderItemCount}`,
        );
      }
    }
    if (plans.length > 15) console.log(`\n... +${plans.length - 15} more groups`);

    if (!APPLY) {
      console.log("\nRe-run with --apply to delete duplicate rows.");
      return;
    }

    let deleted = 0;
    for (const p of plans) {
      for (const r of p.remove) {
        // Detach option-group source links that Restrict might block, then delete
        await prisma.branchOptionGroupMenuItem.deleteMany({
          where: { menuItemId: r.id },
        });
        await prisma.branchMenuItemOptionGroup.deleteMany({
          where: { menuItemId: r.id },
        });
        await prisma.branchMenuItem.delete({ where: { id: r.id } });
        deleted += 1;
      }
    }

    const after = await prisma.branchMenuItem.count({
      where: { branchId: BRANCH_ID },
    });
    const afterVisible = await prisma.branchMenuItem.count({
      where: { branchId: BRANCH_ID, isHidden: false },
    });
    console.log(`\nDeleted ${deleted} duplicate rows.`);
    console.log(`Remaining items=${after} (visible=${afterVisible})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
