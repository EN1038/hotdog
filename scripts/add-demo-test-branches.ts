/**
 * Add demo test branches: ทดสอบสั่งหม่าล่า (NORMAL) + ทดสอบสั่งเสียบหมาล่า (SKEWER)
 *
 * Run:
 *   npx tsx scripts/add-demo-test-branches.ts --dry-run
 *   npx tsx scripts/add-demo-test-branches.ts
 */
import "dotenv/config";
import { Prisma, PrismaClient, StaffRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { importBranchCatalog } from "../src/lib/branch-import";
import { ensureBranchStockLocation } from "../src/lib/stock";
import { slugifyCode, withUniqueSuffix } from "../src/lib/slug";

const SOURCE_BRAND_CODE = "hma-la-hna-pak-sxy-phed-lin-cha";
const DEMO_BRAND_CODE = "malawaiwai-demo";
const DEMO_BRAND_NAME = "หม่าล่า ไวไว - Demo";
const OWNER_PHONE = "0805555990";
const MULTI_BRANCH_PHONE = "0805555996";

const TEST_BRANCHES = [
  {
    demoName: "ทดสอบสั่งหม่าล่า",
    sourceName: "นครชัยมงคลวิลล่า ซอย 2 นวนคร",
    phone: "0805555991",
    renameFrom: "สาขานวนคร ซอย 2 - Demo",
  },
  {
    demoName: "ทดสอบสั่งเสียบหมาล่า",
    sourceName: "สั่งเสียบไม้",
    phone: "0805555992",
    renameFrom: null as string | null,
  },
] as const;

const DRY_RUN = process.argv.includes("--dry-run");

function log(msg: string, data?: unknown) {
  if (data !== undefined) console.log(msg, JSON.stringify(data, null, 2));
  else console.log(msg);
}

async function createPrisma() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? "public" },
  );
  return new PrismaClient({ adapter });
}

type ProductIdMap = Map<string, string>;

async function buildProductIdMap(
  prisma: PrismaClient,
  sourceBrandId: string,
  demoBrandId: string,
): Promise<ProductIdMap> {
  const [sourceProducts, demoProducts] = await Promise.all([
    prisma.brandProduct.findMany({ where: { brandId: sourceBrandId } }),
    prisma.brandProduct.findMany({ where: { brandId: demoBrandId } }),
  ]);
  const demoByName = new Map(demoProducts.map((p) => [p.name, p.id]));
  const map: ProductIdMap = new Map();
  for (const sp of sourceProducts) {
    const demoId = demoByName.get(sp.name);
    if (demoId) map.set(sp.id, demoId);
  }
  return map;
}

function branchCreateData(
  source: Prisma.BranchGetPayload<object>,
  brandId: string,
  name: string,
  code: string,
) {
  return {
    brandId,
    name,
    nameTh: name,
    nameEn: source.nameEn,
    code,
    imageUrl: source.imageUrl,
    address: source.address,
    latitude: source.latitude,
    longitude: source.longitude,
    phone: source.phone,
    primaryCategory: source.primaryCategory,
    secondaryCategories: source.secondaryCategories,
    priceRange: source.priceRange,
    ownerMessage: source.ownerMessage,
    extraMessage: source.extraMessage,
    isOpen: source.isOpen,
    isHidden: source.isHidden,
    isTest: true,
    kind: source.kind,
    warehouseIssueMode: source.warehouseIssueMode,
    warehouseAllowedBranchIds: [] as string[],
    storefrontHours: source.storefrontHours ?? undefined,
    deliveryHours: source.deliveryHours ?? undefined,
    allowAdvanceOrder: source.allowAdvanceOrder,
    autoAcceptOrders: source.autoAcceptOrders,
    stockEnabled: source.stockEnabled,
    operatingMode: source.operatingMode,
    weighSalesEnabled: source.weighSalesEnabled,
    alertSoundId: source.alertSoundId,
  };
}

async function remapMenuBrandProducts(
  prisma: PrismaClient,
  branchId: string,
  productIdMap: ProductIdMap,
) {
  const items = await prisma.branchMenuItem.findMany({
    where: { branchId, brandProductId: { not: null } },
    select: { id: true, brandProductId: true },
  });
  let updated = 0;
  for (const item of items) {
    const newId = productIdMap.get(item.brandProductId!);
    if (!newId || newId === item.brandProductId) continue;
    if (!DRY_RUN) {
      await prisma.branchMenuItem.update({
        where: { id: item.id },
        data: { brandProductId: newId },
      });
    }
    updated += 1;
  }
  log(`  remapped brandProductId on ${updated} menu items`);
}

async function copyBranchMenuStock(
  prisma: PrismaClient,
  sourceBranchId: string,
  targetBranchId: string,
) {
  const [sourceStocks, targetMenus] = await Promise.all([
    prisma.branchMenuItemStock.findMany({
      where: { branchId: sourceBranchId },
      include: { menuItem: { select: { name: true } } },
    }),
    prisma.branchMenuItem.findMany({
      where: { branchId: targetBranchId },
      select: { id: true, name: true },
    }),
  ]);
  const targetByName = new Map(targetMenus.map((m) => [m.name, m.id]));
  let count = 0;
  for (const stock of sourceStocks) {
    const targetMenuId = targetByName.get(stock.menuItem.name);
    if (!targetMenuId) continue;
    if (DRY_RUN) {
      count += 1;
      continue;
    }
    await prisma.branchMenuItemStock.upsert({
      where: { menuItemId: targetMenuId },
      create: {
        branchId: targetBranchId,
        menuItemId: targetMenuId,
        quantity: stock.quantity,
      },
      update: { quantity: stock.quantity },
    });
    count += 1;
  }
  for (const menu of targetMenus) {
    if (DRY_RUN) continue;
    await prisma.branchMenuItemStock.upsert({
      where: { menuItemId: menu.id },
      create: {
        branchId: targetBranchId,
        menuItemId: menu.id,
        quantity: 0,
      },
      update: {},
    });
  }
  log(`  copied ${count} BranchMenuItemStock rows`);
}

async function copyBranchNonMenuQuantities(
  prisma: PrismaClient,
  sourceBranchId: string,
  targetBranchId: string,
) {
  const [sourceItems, targetItems] = await Promise.all([
    prisma.branchNonMenuItem.findMany({ where: { branchId: sourceBranchId } }),
    prisma.branchNonMenuItem.findMany({ where: { branchId: targetBranchId } }),
  ]);
  const targetByKey = new Map(
    targetItems.map((i) => [`${i.stockType}::${i.name}`, i]),
  );
  let count = 0;
  for (const src of sourceItems) {
    const dest = targetByKey.get(`${src.stockType}::${src.name}`);
    if (!dest) continue;
    if (DRY_RUN) {
      count += 1;
      continue;
    }
    await prisma.branchNonMenuItem.update({
      where: { id: dest.id },
      data: { quantity: src.quantity },
    });
    count += 1;
  }
  log(`  synced ${count} BranchNonMenuItem quantities`);
}

async function copyStockBalances(
  prisma: PrismaClient,
  sourceLocationId: string,
  targetLocationId: string,
  productIdMap: ProductIdMap,
) {
  const balances = await prisma.stockBalance.findMany({
    where: { stockLocationId: sourceLocationId },
  });
  let count = 0;
  for (const bal of balances) {
    const newProductId = productIdMap.get(bal.brandProductId);
    if (!newProductId) continue;
    if (DRY_RUN) {
      count += 1;
      continue;
    }
    await prisma.stockBalance.upsert({
      where: {
        stockLocationId_brandProductId: {
          stockLocationId: targetLocationId,
          brandProductId: newProductId,
        },
      },
      create: {
        stockLocationId: targetLocationId,
        brandProductId: newProductId,
        quantity: bal.quantity,
      },
      update: { quantity: bal.quantity },
    });
    count += 1;
  }
  log(`  copied ${count} StockBalance rows`);
}

async function ensureStaff(
  prisma: PrismaClient,
  branchId: string,
  phone: string,
  name: string,
  roles: StaffRole[],
) {
  if (DRY_RUN) return;
  const now = new Date();
  const existing = await prisma.staff.findFirst({
    where: { branchId, phone },
    include: { roles: true },
  });
  if (existing) {
    const have = new Set(existing.roles.map((r) => r.role));
    const missing = roles.filter((r) => !have.has(r));
    await prisma.staff.update({
      where: { id: existing.id },
      data: { isActive: true, name, phoneVerifiedAt: now },
    });
    if (missing.length > 0) {
      await prisma.staffRoleAssignment.createMany({
        data: missing.map((role) => ({ staffId: existing.id, role })),
        skipDuplicates: true,
      });
    }
    return;
  }
  await prisma.staff.create({
    data: {
      branchId,
      phone,
      name,
      isActive: true,
      phoneVerifiedAt: now,
      roles: { create: roles.map((role) => ({ role })) },
    },
  });
  await prisma.customer.upsert({
    where: { phone },
    create: { phone, name: null },
    update: {},
  });
}

async function setupBranchStaff(
  prisma: PrismaClient,
  branchId: string,
  branchName: string,
  phone: string,
  operatingMode: string,
) {
  const roles: StaffRole[] =
    operatingMode === "SKEWER" ? ["SELLER"] : ["SELLER", "DELIVERY"];
  await ensureStaff(
    prisma,
    branchId,
    phone,
    `หน้าร้าน · ${branchName}`,
    roles,
  );
  await ensureStaff(
    prisma,
    branchId,
    OWNER_PHONE,
    `เจ้าของ · ${DEMO_BRAND_NAME}`,
    roles,
  );
  await ensureStaff(
    prisma,
    branchId,
    MULTI_BRANCH_PHONE,
    `หน้าร้าน · เห็นทุกสาขา`,
    roles,
  );
}

async function syncBranch(
  prisma: PrismaClient,
  demoBrandId: string,
  source: Prisma.BranchGetPayload<object>,
  targetBranchId: string,
  demoName: string,
  productIdMap: ProductIdMap,
) {
  const menuCount = await prisma.branchMenuItem.count({
    where: { branchId: targetBranchId },
  });
  if (menuCount === 0) {
    const imported = await importBranchCatalog({
      sourceBranchId: source.id,
      targetBranchId,
      overwriteMenu: true,
      includeLocations: true,
      includeNonMenuItems: true,
    });
    log("  catalog imported", imported);
  } else {
    log(`  catalog exists (${menuCount} items), skip import`);
  }

  await remapMenuBrandProducts(prisma, targetBranchId, productIdMap);
  await copyBranchMenuStock(prisma, source.id, targetBranchId);
  await copyBranchNonMenuQuantities(prisma, source.id, targetBranchId);

  if (source.stockEnabled) {
    const targetLoc = await ensureBranchStockLocation({
      brandId: demoBrandId,
      branchId: targetBranchId,
      branchName: demoName,
    });
    const sourceLoc = await prisma.stockLocation.findFirst({
      where: { branchId: source.id },
    });
    if (sourceLoc) {
      await copyStockBalances(
        prisma,
        sourceLoc.id,
        targetLoc.id,
        productIdMap,
      );
    }
  }
}

async function main() {
  const prisma = await createPrisma();
  try {
    log(DRY_RUN ? "=== DRY RUN ===" : "=== ADD DEMO TEST BRANCHES ===");

    const [sourceBrand, demoBrand] = await Promise.all([
      prisma.brand.findFirst({ where: { code: SOURCE_BRAND_CODE } }),
      prisma.brand.findFirst({
        where: { code: DEMO_BRAND_CODE },
        include: {
          branches: { select: { id: true, name: true, operatingMode: true } },
        },
      }),
    ]);
    if (!sourceBrand) throw new Error(`ไม่พบแบรนด์ต้นทาง: ${SOURCE_BRAND_CODE}`);
    if (!demoBrand) throw new Error(`ไม่พบแบรนด์ demo: ${DEMO_BRAND_CODE}`);

    const sourceBranches = await prisma.branch.findMany({
      where: { brandId: sourceBrand.id },
    });
    const sourceByName = new Map(sourceBranches.map((b) => [b.name, b]));
    const demoByName = new Map(demoBrand.branches.map((b) => [b.name, b]));

    for (const cfg of TEST_BRANCHES) {
      if (!sourceByName.has(cfg.sourceName)) {
        throw new Error(`ไม่พบสาขาต้นทาง: ${cfg.sourceName}`);
      }
    }

    if (DRY_RUN) {
      log("plan", {
        demoBrand: demoBrand.name,
        branches: TEST_BRANCHES.map((c) => ({
          demoName: c.demoName,
          source: c.sourceName,
          renameFrom: c.renameFrom,
          exists: demoByName.has(c.demoName),
          renameTargetExists: c.renameFrom ? demoByName.has(c.renameFrom) : false,
        })),
      });
      return;
    }

    const productIdMap = await buildProductIdMap(
      prisma,
      sourceBrand.id,
      demoBrand.id,
    );
    log(`product map: ${productIdMap.size} SKUs`);

    const takenCodes = new Set(
      (
        await prisma.branch.findMany({
          where: { brandId: demoBrand.id },
          select: { code: true },
        })
      )
        .map((b) => b.code)
        .filter((c): c is string => Boolean(c)),
    );

    for (const cfg of TEST_BRANCHES) {
      const source = sourceByName.get(cfg.sourceName)!;
      let targetId: string;

      if (demoByName.has(cfg.demoName)) {
        targetId = demoByName.get(cfg.demoName)!.id;
        log(`branch exists: ${cfg.demoName}`, { id: targetId });
      } else if (cfg.renameFrom && demoByName.has(cfg.renameFrom)) {
        const old = demoByName.get(cfg.renameFrom)!;
        await prisma.branch.update({
          where: { id: old.id },
          data: {
            name: cfg.demoName,
            nameTh: cfg.demoName,
            operatingMode: source.operatingMode,
            stockEnabled: source.stockEnabled,
            weighSalesEnabled: source.weighSalesEnabled,
          },
        });
        targetId = old.id;
        log(`renamed: ${cfg.renameFrom} → ${cfg.demoName}`, { id: targetId });
      } else {
        const code = withUniqueSuffix(
          slugifyCode(cfg.demoName) || "test-branch",
          takenCodes,
        );
        takenCodes.add(code);
        const created = await prisma.branch.create({
          data: branchCreateData(source, demoBrand.id, cfg.demoName, code),
        });
        targetId = created.id;
        log(`created: ${cfg.demoName}`, {
          id: targetId,
          code,
          operatingMode: source.operatingMode,
        });
      }

      await syncBranch(
        prisma,
        demoBrand.id,
        source,
        targetId,
        cfg.demoName,
        productIdMap,
      );
      await setupBranchStaff(
        prisma,
        targetId,
        cfg.demoName,
        cfg.phone,
        source.operatingMode,
      );
    }

    const summary = await prisma.brand.findUnique({
      where: { id: demoBrand.id },
      include: {
        branches: {
          where: { kind: "STORE" },
          orderBy: { name: "asc" },
          select: {
            code: true,
            name: true,
            operatingMode: true,
            isTest: true,
            _count: {
              select: { menuItems: true, staff: true, branchMenuItemStocks: true },
            },
          },
        },
      },
    });

    log("\n=== DONE ===");
    log("store branches", summary?.branches);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
