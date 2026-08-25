/**
 * Add "โปร 18 ไม้แถม 2" to every branch, mirroring the visible "โปร 10 ไม้แถม 1" setup.
 * Run: node scripts/add-promo-18-2-all-branches.mjs
 */
import "dotenv/config";
import { PrismaClient, OptionGroupMode } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const PROMO_10_NAME = "โปร 10 ไม้แถม 1";
const PROMO_18_NAME = "โปร 18 ไม้แถม 2";
const PROMO_18_TOTAL = 20; // 18 paid + 2 free
const PROMO_18_PRICE = 180; // 10-pack = 100 → 18-pack = 180

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA ?? "public" },
);
const prisma = new PrismaClient({ adapter });

function pickTemplatePromo(items) {
  const withFromMenu = items.filter((item) =>
    item.optionGroupLinks.some((l) => l.group.mode === "FROM_MENU"),
  );
  if (withFromMenu.length === 0) return null;
  return (
    withFromMenu.find((item) => !item.isHidden && !item.hideFromStaff) ??
    withFromMenu[0]
  );
}

async function main() {
  const branches = await prisma.branch.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let created = 0;
  let skipped = 0;

  for (const branch of branches) {
    const existing18 = await prisma.branchMenuItem.findFirst({
      where: { branchId: branch.id, name: PROMO_18_NAME },
      select: { id: true },
    });
    if (existing18) {
      console.log(`skip ${branch.name}: already has ${PROMO_18_NAME}`);
      skipped++;
      continue;
    }

    const promos10 = await prisma.branchMenuItem.findMany({
      where: { branchId: branch.id, name: PROMO_10_NAME },
      include: {
        optionGroupLinks: {
          include: {
            group: {
              include: {
                menuItemSources: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
        },
      },
    });

    const template = pickTemplatePromo(promos10);
    if (!template) {
      console.warn(`skip ${branch.name}: no ${PROMO_10_NAME} template`);
      skipped++;
      continue;
    }

    const fromMenu10 = template.optionGroupLinks.find(
      (l) => l.group.mode === OptionGroupMode.FROM_MENU,
    )?.group;
    if (!fromMenu10) {
      console.warn(`skip ${branch.name}: no FROM_MENU group on template`);
      skipped++;
      continue;
    }

    const manualGroupIds = template.optionGroupLinks
      .filter((l) => l.group.mode === OptionGroupMode.MANUAL)
      .map((l) => l.groupId);

    const maxSort = await prisma.branchMenuItem.aggregate({
      where: { branchId: branch.id },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? template.sortOrder) + 1;

    await prisma.$transaction(async (tx) => {
      const fromMenu18 = await tx.branchOptionGroup.create({
        data: {
          branchId: branch.id,
          name: PROMO_18_NAME,
          mode: OptionGroupMode.FROM_MENU,
          required: true,
          minSelect: PROMO_18_TOTAL,
          maxSelect: PROMO_18_TOTAL,
          allowDuplicateSelections: true,
          sortOrder: fromMenu10.sortOrder,
          menuItemSources: {
            create: fromMenu10.menuItemSources.map((src) => ({
              menuItemId: src.menuItemId,
              sortOrder: src.sortOrder,
              isEnabled: src.isEnabled,
              priceDelta: src.priceDelta,
            })),
          },
        },
      });

      const menuItem = await tx.branchMenuItem.create({
        data: {
          branchId: branch.id,
          name: PROMO_18_NAME,
          price: PROMO_18_PRICE,
          pickupPrice: PROMO_18_PRICE,
          storefrontPrice: PROMO_18_PRICE,
          sellDelivery: template.sellDelivery,
          sellPickup: template.sellPickup,
          sellStorefront: template.sellStorefront,
          categoryId: template.categoryId,
          isHidden: template.isHidden,
          hideFromStaff: template.hideFromStaff,
          sortOrder,
        },
      });

      for (const groupId of manualGroupIds) {
        await tx.branchMenuItemOptionGroup.create({
          data: { menuItemId: menuItem.id, groupId },
        });
      }
      await tx.branchMenuItemOptionGroup.create({
        data: { menuItemId: menuItem.id, groupId: fromMenu18.id },
      });
    });

    console.log(`ok ${branch.name}: created ${PROMO_18_NAME}`);
    created++;
  }

  console.log(`\nDone: created=${created}, skipped=${skipped}, branches=${branches.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
