/**
 * Add menu item "ไส้กรอกหัวใจ" (10฿) to every branch, same category as other sausages,
 * and attach to FROM_MENU promo pick lists that already include sausages.
 *
 * Run: node scripts/add-menu-sausage-heart-all-branches.mjs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ITEM_NAME = "ไส้กรอกหัวใจ";
const TEMPLATE_NAME = "ไส้กรอกชีส";
const PRICE = 10;

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA ?? "public" },
);
const prisma = new PrismaClient({ adapter });

async function main() {
  const branches = await prisma.branch.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let created = 0;
  let skipped = 0;
  let linked = 0;

  for (const branch of branches) {
    const existing = await prisma.branchMenuItem.findFirst({
      where: { branchId: branch.id, name: ITEM_NAME },
      select: { id: true },
    });
    if (existing) {
      console.log(`skip ${branch.name}: already has ${ITEM_NAME}`);
      skipped++;
      continue;
    }

    const template = await prisma.branchMenuItem.findFirst({
      where: { branchId: branch.id, name: TEMPLATE_NAME },
      select: {
        id: true,
        categoryId: true,
        sellDelivery: true,
        sellPickup: true,
        sellStorefront: true,
        sortOrder: true,
      },
    });

    let categoryId = template?.categoryId ?? null;
    if (!categoryId) {
      const cat = await prisma.menuCategory.findFirst({
        where: { branchId: branch.id, name: "ลูกชิ้น" },
        select: { id: true },
      });
      categoryId = cat?.id ?? null;
    }

    const maxSort = await prisma.branchMenuItem.aggregate({
      where: { branchId: branch.id },
      _max: { sortOrder: true },
    });
    const sortOrder =
      template?.sortOrder != null
        ? template.sortOrder + 1
        : (maxSort._max.sortOrder ?? 0) + 1;

    const item = await prisma.branchMenuItem.create({
      data: {
        branchId: branch.id,
        name: ITEM_NAME,
        price: PRICE,
        pickupPrice: PRICE,
        storefrontPrice: PRICE,
        sellDelivery: template?.sellDelivery ?? true,
        sellPickup: template?.sellPickup ?? true,
        sellStorefront: template?.sellStorefront ?? true,
        categoryId,
        sortOrder,
        isHidden: false,
        hideFromStaff: false,
      },
    });

    // Attach to FROM_MENU groups that already list the template sausage
    const groupIds = new Set();
    if (template) {
      const links = await prisma.branchOptionGroupMenuItem.findMany({
        where: { menuItemId: template.id },
        select: { groupId: true },
      });
      for (const l of links) groupIds.add(l.groupId);
    }
    // Also all promo FROM_MENU groups on this branch
    const promoGroups = await prisma.branchOptionGroup.findMany({
      where: {
        branchId: branch.id,
        mode: "FROM_MENU",
        name: { contains: "โปร" },
      },
      select: { id: true },
    });
    for (const g of promoGroups) groupIds.add(g.id);

    for (const groupId of groupIds) {
      const maxSrc = await prisma.branchOptionGroupMenuItem.aggregate({
        where: { groupId },
        _max: { sortOrder: true },
      });
      await prisma.branchOptionGroupMenuItem.upsert({
        where: {
          groupId_menuItemId: { groupId, menuItemId: item.id },
        },
        create: {
          groupId,
          menuItemId: item.id,
          sortOrder: (maxSrc._max.sortOrder ?? 0) + 1,
          isEnabled: true,
          priceDelta: 0,
        },
        update: { isEnabled: true },
      });
      linked++;
    }

    console.log(
      `ok ${branch.name}: created ${ITEM_NAME} @${PRICE}฿ · linked ${groupIds.size} groups`,
    );
    created++;
  }

  console.log(
    `\nDone: created=${created}, skipped=${skipped}, groupLinks=${linked}, branches=${branches.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
