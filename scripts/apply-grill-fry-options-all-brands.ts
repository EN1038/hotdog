import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BRAND_CODES = ["hmala-echaphraya", "hma-la-hna-pak-sxy-phed-lin-cha"] as const;

const EXCLUDED_BRANCH_NAMES = new Set([
  "สั่งเสียบไม้",
  "สต็อกสาขากลาง",
  "สต๊อกกลาง",
  "สต็อกกลาง",
]);

const COOK_GROUP_NAME = "ย่าง / ทอด";
const COOK_GROUP_ALIASES = [
  COOK_GROUP_NAME,
  "ปิ้ง / ทอด",
  "ปิ้ง / ทอด / ชาบู",
  "ย่าง / ทอด / ชาบู",
];

const COOK_OPTIONS = [
  { name: "ย่าง", priceDelta: 0 },
  { name: "ทอด", priceDelta: 0 },
] as const;

/** Categories that should not get cook-method choice. */
const SKIP_CATEGORY =
  /น้ำจิ้ม|เครื่องปรุง|สิ้นเปลือง|ถุง|แก้ว|โปร|ของทอด|เครื่องดื่ม|ไอศกรีม|ของหวาน/u;

function shouldExcludeBranch(name: string): boolean {
  if (EXCLUDED_BRANCH_NAMES.has(name.trim())) return true;
  if (name.trim().startsWith("สั่งเสียบไม้")) return true;
  return false;
}

async function ensureCookGroup(
  prisma: PrismaClient,
  branchId: string,
): Promise<{ id: string; name: string }> {
  const minSort = await prisma.branchOptionGroup.aggregate({
    where: { branchId },
    _min: { sortOrder: true },
  });
  const cookSortOrder = (minSort._min.sortOrder ?? 0) - 1;

  const existingGroups = await prisma.branchOptionGroup.findMany({
    where: {
      branchId,
      name: { in: [...COOK_GROUP_ALIASES] },
    },
    include: { options: true },
  });

  // Prefer a simple 2-option group; leave full shabu groups untouched.
  let group =
    existingGroups.find((g) => g.name === COOK_GROUP_NAME) ??
    existingGroups.find(
      (g) =>
        g.name === "ปิ้ง / ทอด" &&
        !g.options.some((o) => o.name === "ชาบู"),
    ) ??
    null;

  if (!group && existingGroups.some((g) => g.name.includes("ชาบู"))) {
    group = null;
  }

  if (!group) {
    group = await prisma.branchOptionGroup.create({
      data: {
        branchId,
        name: COOK_GROUP_NAME,
        mode: "MANUAL",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        sortOrder: cookSortOrder,
        options: {
          create: COOK_OPTIONS.map((o) => ({
            name: o.name,
            priceDelta: o.priceDelta,
          })),
        },
      },
      include: { options: true },
    });
    return { id: group.id, name: group.name };
  }

  await prisma.branchOptionGroup.update({
    where: { id: group.id },
    data: {
      name: COOK_GROUP_NAME,
      mode: "MANUAL",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: Math.min(group.sortOrder, cookSortOrder),
    },
  });

  for (const o of COOK_OPTIONS) {
    const existing = group.options.find((x) => x.name === o.name);
    if (existing) {
      await prisma.branchOption.update({
        where: { id: existing.id },
        data: { priceDelta: o.priceDelta },
      });
    } else {
      await prisma.branchOption.create({
        data: {
          groupId: group.id,
          name: o.name,
          priceDelta: o.priceDelta,
        },
      });
    }
  }

  return { id: group.id, name: COOK_GROUP_NAME };
}

async function main() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? "public" },
  );
  const prisma = new PrismaClient({ adapter });

  const summary: Array<Record<string, unknown>> = [];

  try {
    const brands = await prisma.brand.findMany({
      where: { code: { in: [...BRAND_CODES] } },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });

    if (brands.length === 0) {
      throw new Error(`ไม่พบแบรนด์: ${BRAND_CODES.join(", ")}`);
    }

    for (const brand of brands) {
      const branches = await prisma.branch.findMany({
        where: { brandId: brand.id },
        select: { id: true, name: true, operatingMode: true },
        orderBy: { name: "asc" },
      });

      for (const branch of branches) {
        if (shouldExcludeBranch(branch.name)) {
          summary.push({
            brand: brand.name,
            branch: branch.name,
            skipped: true,
            reason: "excluded by name",
          });
          continue;
        }

        if (branch.operatingMode !== "NORMAL") {
          summary.push({
            brand: brand.name,
            branch: branch.name,
            skipped: true,
            reason: `operatingMode=${branch.operatingMode}`,
          });
          continue;
        }

        const cookGroup = await ensureCookGroup(prisma, branch.id);

        const menus = await prisma.branchMenuItem.findMany({
          where: { branchId: branch.id, isHidden: false },
          select: {
            id: true,
            name: true,
            category: { select: { name: true } },
          },
        });

        let flagged = 0;
        let linked = 0;
        let skippedMenus = 0;

        for (const item of menus) {
          const cat = item.category?.name ?? "";
          if (SKIP_CATEGORY.test(cat) || SKIP_CATEGORY.test(item.name)) {
            skippedMenus += 1;
            continue;
          }

          await prisma.branchMenuItem.update({
            where: { id: item.id },
            data: {
              sellGrill: true,
              sellFry: true,
              sellPiece: true,
            },
          });
          flagged += 1;

          await prisma.branchMenuItemOptionGroup.upsert({
            where: {
              menuItemId_groupId: {
                menuItemId: item.id,
                groupId: cookGroup.id,
              },
            },
            update: {},
            create: { menuItemId: item.id, groupId: cookGroup.id },
          });
          linked += 1;
        }

        summary.push({
          brand: brand.name,
          branch: branch.name,
          cookGroup: cookGroup.name,
          menusTotal: menus.length,
          menusLinked: linked,
          menusSkipped: skippedMenus,
          menusFlagged: flagged,
        });
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
