/**
 * Add sales menu item "เห็ดหนูแครอท" (10฿) to every STORE branch
 * (หม่าล่า ไวไว + Demo และสาขาอื่นในระบบ),
 * category เห็ด, attach to FROM_MENU promo lists, BrandProduct + stock row.
 *
 * Run: node scripts/add-menu-mouse-carrot-mushroom-all-branches.mjs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ITEM_NAME = "เห็ดหนูแครอท";
const ITEM_CODE = "1353MOQD";
const PRICE = 10;
const CATEGORY_NAME = "เห็ด";
const TEMPLATE_NAMES = [
  "เห็ดออริน",
  "เห็ดหอม",
  "เห็ดฟาง",
  "เห็ดเข็มทองพันเบคอน",
  "เห็ดชิมิจิขาวพันเบคอน",
  "เห็ดหอมยัดไส้หมูสับ",
];

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA ?? "public" },
);
const prisma = new PrismaClient({ adapter });

async function ensureBrandProduct(brandId) {
  const existing = await prisma.brandProduct.findFirst({
    where: { brandId, name: ITEM_NAME, stockType: "SALE_ITEM" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.brandProduct.create({
    data: {
      brandId,
      name: ITEM_NAME,
      stockType: "SALE_ITEM",
      unit: "ชิ้น",
      sellingPrice: PRICE,
      trackStock: true,
      isActive: true,
      category: CATEGORY_NAME,
    },
    select: { id: true },
  });
  console.log(`brandProduct created ${ITEM_NAME} (${created.id})`);
  return created.id;
}

async function findTemplate(branchId) {
  for (const name of TEMPLATE_NAMES) {
    const row = await prisma.branchMenuItem.findFirst({
      where: {
        branchId,
        name,
        isHidden: false,
      },
      select: {
        id: true,
        categoryId: true,
        sellDelivery: true,
        sellPickup: true,
        sellStorefront: true,
        sellPiece: true,
        sellSkewer: true,
        sortOrder: true,
        defaultShelfLifeDays: true,
      },
    });
    if (row) return row;
  }
  return null;
}

async function main() {
  const branches = await prisma.branch.findMany({
    where: { kind: "STORE" },
    select: {
      id: true,
      name: true,
      brandId: true,
      stockEnabled: true,
      brand: { select: { code: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const brandIds = [...new Set(branches.map((b) => b.brandId).filter(Boolean))];
  const brandProductByBrand = new Map();
  for (const brandId of brandIds) {
    brandProductByBrand.set(brandId, await ensureBrandProduct(brandId));
  }

  let created = 0;
  let skipped = 0;
  let linked = 0;
  let stocked = 0;

  for (const branch of branches) {
    const brandProductId = brandProductByBrand.get(branch.brandId) ?? null;

    const existing = await prisma.branchMenuItem.findFirst({
      where: { branchId: branch.id, name: ITEM_NAME, isHidden: false },
      select: {
        id: true,
        itemCode: true,
        brandProductId: true,
        stock: { select: { id: true } },
      },
    });
    if (existing) {
      const patch = {};
      if (brandProductId && existing.brandProductId !== brandProductId) {
        patch.brandProductId = brandProductId;
      }
      if (!existing.itemCode?.trim()) {
        patch.itemCode = ITEM_CODE;
      }
      if (Object.keys(patch).length > 0) {
        await prisma.branchMenuItem.update({
          where: { id: existing.id },
          data: patch,
        });
      }
      if (branch.stockEnabled && !existing.stock) {
        await prisma.branchMenuItemStock.create({
          data: {
            branchId: branch.id,
            menuItemId: existing.id,
            quantity: 0,
          },
        });
        stocked++;
      }
      console.log(`skip ${branch.brand?.code ?? "?"} / ${branch.name}: already has ${ITEM_NAME}`);
      skipped++;
      continue;
    }

    const template = await findTemplate(branch.id);
    let categoryId = template?.categoryId ?? null;
    if (!categoryId) {
      const cat =
        (await prisma.menuCategory.findFirst({
          where: { branchId: branch.id, name: CATEGORY_NAME },
          select: { id: true },
        })) ??
        (await prisma.menuCategory.findFirst({
          where: { branchId: branch.id, name: { contains: "เห็ด" } },
          select: { id: true },
        }));
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
        itemCode: ITEM_CODE,
        price: PRICE,
        pickupPrice: PRICE,
        storefrontPrice: PRICE,
        sellDelivery: template?.sellDelivery ?? true,
        sellPickup: template?.sellPickup ?? true,
        sellStorefront: template?.sellStorefront ?? true,
        sellPiece: template?.sellPiece ?? true,
        sellSkewer: template?.sellSkewer ?? false,
        categoryId,
        sortOrder,
        isHidden: false,
        hideFromStaff: false,
        brandProductId,
        defaultShelfLifeDays: template?.defaultShelfLifeDays ?? 2,
      },
    });

    if (branch.stockEnabled) {
      await prisma.branchMenuItemStock.create({
        data: {
          branchId: branch.id,
          menuItemId: item.id,
          quantity: 0,
        },
      });
      stocked++;
    }

    const groupIds = new Set();
    if (template) {
      const links = await prisma.branchOptionGroupMenuItem.findMany({
        where: { menuItemId: template.id },
        select: { groupId: true },
      });
      for (const l of links) groupIds.add(l.groupId);
    }
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
      `ok ${branch.brand?.code ?? "?"} / ${branch.name}: ${ITEM_NAME} @${PRICE}฿ · groups=${groupIds.size}`,
    );
    created++;
  }

  console.log(
    `\nDone: created=${created}, skipped=${skipped}, groupLinks=${linked}, stockRows=${stocked}, branches=${branches.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
