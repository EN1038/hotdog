/**
 * Add sales menu items "นมชมพูใหญ่" and "นมชมพูชีส" (10฿) to every STORE branch,
 * same category/channels as ไส้กรอกนมชมพู, attach to FROM_MENU promo lists,
 * ensure BrandProduct + stock row for stock UI.
 *
 * Run: node scripts/add-menu-pink-milk-sausage-all-branches.mjs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ITEMS = [
  { name: "นมชมพูใหญ่", price: 10 },
  { name: "นมชมพูชีส", price: 10 },
];
const CATEGORY_NAME = "ลูกชิ้น";
const TEMPLATE_NAMES = [
  "ไส้กรอกนมชมพู",
  "ไส้กรอกชีส",
  "ไส้กรอกหัวใจ",
  "ลูกชิ้นหมู",
];

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA ?? "public" },
);
const prisma = new PrismaClient({ adapter });

async function ensureBrandProduct(brandId, item) {
  const existing = await prisma.brandProduct.findFirst({
    where: { brandId, name: item.name, stockType: "SALE_ITEM" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.brandProduct.create({
    data: {
      brandId,
      name: item.name,
      stockType: "SALE_ITEM",
      unit: "ชิ้น",
      sellingPrice: item.price,
      trackStock: true,
      isActive: true,
      category: CATEGORY_NAME,
    },
    select: { id: true },
  });
  console.log(`brandProduct created ${item.name} (${created.id})`);
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
      },
    });
    if (row) return row;
  }
  return null;
}

async function addItemToBranch(branch, item, brandProductId, template) {
  const existing = await prisma.branchMenuItem.findFirst({
    where: { branchId: branch.id, name: item.name, isHidden: false },
    select: { id: true, brandProductId: true, stock: { select: { id: true } } },
  });
  if (existing) {
    if (brandProductId && existing.brandProductId !== brandProductId) {
      await prisma.branchMenuItem.update({
        where: { id: existing.id },
        data: { brandProductId },
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
      return { status: "stocked", groupLinks: 0 };
    }
    return { status: "skipped", groupLinks: 0 };
  }

  let categoryId = template?.categoryId ?? null;
  if (!categoryId) {
    const cat =
      (await prisma.menuCategory.findFirst({
        where: { branchId: branch.id, name: CATEGORY_NAME },
        select: { id: true },
      })) ??
      (await prisma.menuCategory.findFirst({
        where: { branchId: branch.id, name: { contains: "ลูกชิ้น" } },
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

  const menuItem = await prisma.branchMenuItem.create({
    data: {
      branchId: branch.id,
      name: item.name,
      price: item.price,
      pickupPrice: item.price,
      storefrontPrice: item.price,
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
    },
  });

  let stocked = false;
  if (branch.stockEnabled) {
    await prisma.branchMenuItemStock.create({
      data: {
        branchId: branch.id,
        menuItemId: menuItem.id,
        quantity: 0,
      },
    });
    stocked = true;
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
        groupId_menuItemId: { groupId, menuItemId: menuItem.id },
      },
      create: {
        groupId,
        menuItemId: menuItem.id,
        sortOrder: (maxSrc._max.sortOrder ?? 0) + 1,
        isEnabled: true,
        priceDelta: 0,
      },
      update: { isEnabled: true },
    });
  }

  return {
    status: stocked ? "created+stock" : "created",
    groupLinks: groupIds.size,
  };
}

async function main() {
  const branches = await prisma.branch.findMany({
    where: { kind: "STORE" },
    select: { id: true, name: true, brandId: true, stockEnabled: true },
    orderBy: { name: "asc" },
  });

  const brandIds = [...new Set(branches.map((b) => b.brandId))];
  const brandProductByBrand = new Map();
  for (const brandId of brandIds) {
    brandProductByBrand.set(brandId, new Map());
    for (const item of ITEMS) {
      brandProductByBrand
        .get(brandId)
        .set(item.name, await ensureBrandProduct(brandId, item));
    }
  }

  const totals = {
    created: 0,
    skipped: 0,
    stocked: 0,
    groupLinks: 0,
  };

  for (const branch of branches) {
    const template = await findTemplate(branch.id);
    const brandProducts = brandProductByBrand.get(branch.brandId);

    for (const item of ITEMS) {
      const brandProductId = brandProducts.get(item.name) ?? null;
      const result = await addItemToBranch(
        branch,
        item,
        brandProductId,
        template,
      );

      if (result.status === "skipped") {
        console.log(`skip ${branch.name}: already has ${item.name}`);
        totals.skipped++;
      } else if (result.status === "stocked") {
        console.log(`stock ${branch.name}: added stock row for ${item.name}`);
        totals.stocked++;
      } else {
        console.log(
          `ok ${branch.name}: created ${item.name} @${item.price}฿ · linked ${result.groupLinks} groups`,
        );
        totals.created++;
        totals.groupLinks += result.groupLinks;
        if (result.status === "created+stock") totals.stocked++;
      }
    }
  }

  console.log(
    `\nDone: created=${totals.created}, skipped=${totals.skipped}, groupLinks=${totals.groupLinks}, stockRows=${totals.stocked}, branches=${branches.length}, items=${ITEMS.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
