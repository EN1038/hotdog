/**
 * Clone หม่าล่า ไว ไว → หม่าล่า ไวไว - Demo
 * Copies: brand settings, SKUs, warehouse stock, 5 store branches (menu + stock).
 * Does NOT copy: orders, shifts, expenses, sales history.
 *
 * Run:
 *   npx tsx scripts/clone-brand-demo.ts --dry-run
 *   npx tsx scripts/clone-brand-demo.ts
 *   npx tsx scripts/clone-brand-demo.ts --resume
 */
import "dotenv/config";
import { Prisma, PrismaClient, StaffRole, StockLocationType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { importBranchCatalog } from "../src/lib/branch-import";
import { hashAndSealPassword } from "../src/lib/admin-password";
import { ensureBranchStockLocation } from "../src/lib/stock";
import { slugifyCode, withUniqueSuffix } from "../src/lib/slug";

const SOURCE_BRAND_CODE = "hma-la-hna-pak-sxy-phed-lin-cha";
const DEMO_BRAND_CODE = "malawaiwai-demo";
const DEMO_BRAND_NAME = "หม่าล่า ไวไว - Demo";
const OWNER_PHONE = "0805555990";
const MULTI_BRANCH_PHONE = "0805555996";
const DEMO_SUFFIX = " - Demo";

const STORE_BRANCHES: Array<{
  sourceName: string;
  demoLabel: string;
  phone: string;
}> = [
  {
    sourceName: "นครชัยมงคลวิลล่า ซอย 2 นวนคร",
    demoLabel: "สาขานวนคร ซอย 2",
    phone: "0805555991",
  },
  {
    sourceName: "CJ นวนคร",
    demoLabel: "สาขา CJ นวนคร",
    phone: "0805555992",
  },
  {
    sourceName: "คลอง 6 หน้าหมู่บ้าน",
    demoLabel: "สาขา คลอง 6 หน้าหมู่บ้าน",
    phone: "0805555993",
  },
  {
    sourceName: "คลอง 6 สะพานชมพู",
    demoLabel: "สาขา คลอง 6 สะพานชมพู",
    phone: "0805555994",
  },
  {
    sourceName: "สต๊อกกลาง - คลอง 2 คลองหลวง",
    demoLabel: "สาขา คลองหลวง 2 สต็อกกลาง",
    phone: "0805555995",
  },
];

const WAREHOUSE_SOURCE_NAME = "สต๊อกกลาง";

const DRY_RUN = process.argv.includes("--dry-run");
const RESUME = process.argv.includes("--resume");

function log(msg: string, data?: unknown) {
  if (data !== undefined) console.log(msg, JSON.stringify(data, null, 2));
  else console.log(msg);
}

function demoName(label: string) {
  return `${label}${DEMO_SUFFIX}`;
}

async function createPrisma() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? "public" },
  );
  return new PrismaClient({ adapter });
}

type ProductIdMap = Map<string, string>;
type BranchIdMap = Map<string, string>;

async function copyBrandProducts(
  prisma: PrismaClient,
  sourceBrandId: string,
  targetBrandId: string,
): Promise<ProductIdMap> {
  const map: ProductIdMap = new Map();
  const products = await prisma.brandProduct.findMany({
    where: { brandId: sourceBrandId },
    orderBy: { createdAt: "asc" },
  });

  for (const p of products) {
    if (DRY_RUN) {
      map.set(p.id, `dry-${p.id}`);
      continue;
    }
    const created = await prisma.brandProduct.create({
      data: {
        brandId: targetBrandId,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        stockType: p.stockType,
        category: p.category,
        imageUrl: p.imageUrl,
        description: p.description,
        unit: p.unit,
        trackStock: p.trackStock,
        trackLots: p.trackLots,
        lowStockAlert: p.lowStockAlert,
        defaultShelfLifeDays: p.defaultShelfLifeDays,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        isActive: p.isActive,
        equipmentStatus: p.equipmentStatus,
      },
    });
    map.set(p.id, created.id);
  }
  log(`  copied ${products.length} BrandProduct`);
  return map;
}

async function copyProductRecipes(
  prisma: PrismaClient,
  sourceBrandId: string,
  productIdMap: ProductIdMap,
) {
  const lines = await prisma.productRecipeLine.findMany({
    where: {
      parent: { brandId: sourceBrandId },
    },
  });
  let count = 0;
  for (const line of lines) {
    const parentId = productIdMap.get(line.parentProductId);
    const componentId = productIdMap.get(line.componentProductId);
    if (!parentId || !componentId) continue;
    if (DRY_RUN) {
      count += 1;
      continue;
    }
    await prisma.productRecipeLine.create({
      data: {
        parentProductId: parentId,
        componentProductId: componentId,
        quantityPerUnit: line.quantityPerUnit,
        note: line.note,
      },
    });
    count += 1;
  }
  log(`  copied ${count} ProductRecipeLine`);
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
  const [sourceStocks, targetMenus, sourceMenus] = await Promise.all([
    prisma.branchMenuItemStock.findMany({
      where: { branchId: sourceBranchId },
      include: { menuItem: { select: { name: true } } },
    }),
    prisma.branchMenuItem.findMany({
      where: { branchId: targetBranchId },
      select: { id: true, name: true },
    }),
    prisma.branchMenuItem.findMany({
      where: { branchId: sourceBranchId },
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

  // Ensure stock rows exist for all menu items (0 if no source row)
  const sourceByName = new Map(sourceMenus.map((m) => [m.name, m.id]));
  for (const menu of targetMenus) {
    if (sourceByName.has(menu.name)) continue;
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
    const key = `${src.stockType}::${src.name}`;
    const dest = targetByKey.get(key);
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

async function buildProductIdMapFromExisting(
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
  log(`  mapped ${map.size} BrandProduct by name`);
  return map;
}

async function processStoreBranch(
  prisma: PrismaClient,
  demoBrandId: string,
  source: Prisma.BranchGetPayload<object>,
  cfg: (typeof STORE_BRANCHES)[number],
  productIdMap: ProductIdMap,
  branchIdMap: BranchIdMap,
  takenCodes: Set<string>,
  existingBranch?: { id: string; name: string } | null,
) {
  const name = demoName(cfg.demoLabel);
  let targetId: string;

  if (existingBranch) {
    targetId = existingBranch.id;
    log(`resume branch: ${name}`, { id: targetId });
  } else {
    const code = withUniqueSuffix(
      slugifyCode(`${cfg.demoLabel}-demo`) || "branch-demo",
      takenCodes,
    );
    takenCodes.add(code);
    const created = await prisma.branch.create({
      data: branchCreateData(source, demoBrandId, name, code),
    });
    targetId = created.id;
    branchIdMap.set(source.id, created.id);
    log(`created branch: ${name}`, { id: created.id, code });

    const imported = await importBranchCatalog({
      sourceBranchId: source.id,
      targetBranchId: created.id,
      overwriteMenu: true,
      includeLocations: true,
      includeNonMenuItems: true,
    });
    log("  catalog imported", imported);
  }

  branchIdMap.set(source.id, targetId);

  const menuCount = await prisma.branchMenuItem.count({
    where: { branchId: targetId },
  });
  if (menuCount === 0) {
    const imported = await importBranchCatalog({
      sourceBranchId: source.id,
      targetBranchId: targetId,
      overwriteMenu: true,
      includeLocations: true,
      includeNonMenuItems: true,
    });
    log("  catalog imported (was empty)", imported);
  }

  await remapMenuBrandProducts(prisma, targetId, productIdMap);
  await copyBranchMenuStock(prisma, source.id, targetId);
  await copyBranchNonMenuQuantities(prisma, source.id, targetId);

  if (source.stockEnabled) {
    const targetLoc = await ensureBranchStockLocation({
      brandId: demoBrandId,
      branchId: targetId,
      branchName: name,
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

  const storeRoles: StaffRole[] = ["SELLER", "DELIVERY"];
  await ensureStaff(
    prisma,
    targetId,
    cfg.phone,
    `หน้าร้าน · ${name}`,
    storeRoles,
  );
  await ensureStaff(
    prisma,
    targetId,
    OWNER_PHONE,
    `เจ้าของ · ${DEMO_BRAND_NAME}`,
    storeRoles,
  );
  await ensureStaff(
    prisma,
    targetId,
    MULTI_BRANCH_PHONE,
    `หน้าร้าน · เห็นทุกสาขา`,
    storeRoles,
  );
}

async function ensureWarehouseBranch(
  prisma: PrismaClient,
  demoBrandId: string,
  sourceWarehouse: Prisma.BranchGetPayload<object>,
  productIdMap: ProductIdMap,
  branchIdMap: BranchIdMap,
  existing?: { id: string } | null,
) {
  const whName = demoName(WAREHOUSE_SOURCE_NAME);
  let demoWarehouseBranch: { id: string; name: string };

  if (existing) {
    demoWarehouseBranch = { id: existing.id, name: whName };
    log("resume warehouse branch", { id: existing.id });
  } else {
    const created = await prisma.branch.create({
      data: branchCreateData(
        sourceWarehouse,
        demoBrandId,
        whName,
        "stock-center-demo",
      ),
    });
    demoWarehouseBranch = created;
    log("created warehouse branch", {
      id: created.id,
      name: created.name,
    });
  }
  branchIdMap.set(sourceWarehouse.id, demoWarehouseBranch.id);

  let demoWarehouseLoc = await prisma.stockLocation.findFirst({
    where: { branchId: demoWarehouseBranch.id },
  });
  if (!demoWarehouseLoc) {
    demoWarehouseLoc = await prisma.stockLocation.create({
      data: {
        brandId: demoBrandId,
        branchId: demoWarehouseBranch.id,
        type: StockLocationType.WAREHOUSE,
        name: demoWarehouseBranch.name,
      },
    });
  }

  const sourceWarehouseLoc = await prisma.stockLocation.findFirst({
    where: { branchId: sourceWarehouse.id },
  });
  if (sourceWarehouseLoc) {
    await copyStockBalances(
      prisma,
      sourceWarehouseLoc.id,
      demoWarehouseLoc.id,
      productIdMap,
    );
  }

  const whRoles: StaffRole[] = ["SELLER"];
  await ensureStaff(
    prisma,
    demoWarehouseBranch.id,
    OWNER_PHONE,
    `เจ้าของ · ${DEMO_BRAND_NAME}`,
    whRoles,
  );
  await ensureStaff(
    prisma,
    demoWarehouseBranch.id,
    MULTI_BRANCH_PHONE,
    `หน้าร้าน · เห็นทุกสาขา`,
    whRoles,
  );

  if (sourceWarehouse.warehouseAllowedBranchIds.length > 0) {
    const mapped = sourceWarehouse.warehouseAllowedBranchIds
      .map((id) => branchIdMap.get(id))
      .filter((id): id is string => Boolean(id));
    await prisma.branch.update({
      where: { id: demoWarehouseBranch.id },
      data: { warehouseAllowedBranchIds: mapped },
    });
  }

  return demoWarehouseBranch;
}

async function printSummary(prisma: PrismaClient, demoBrandId: string) {
  const summary = await prisma.brand.findUnique({
    where: { id: demoBrandId },
    include: {
      branches: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          kind: true,
          isTest: true,
          _count: {
            select: {
              menuItems: true,
              staff: true,
              branchMenuItemStocks: true,
              orders: true,
            },
          },
        },
      },
      products: { select: { id: true } },
    },
  });

  const staffPhones = await prisma.staff.findMany({
    where: { branch: { brandId: demoBrandId } },
    select: {
      phone: true,
      name: true,
      branch: { select: { name: true } },
    },
    orderBy: [{ phone: "asc" }, { branch: { name: "asc" } }],
  });

  log("\n=== DONE ===");
  log("demo brand URL base", `/${DEMO_BRAND_CODE}/`);
  log("owner login", {
    admin: `/admin`,
    username: OWNER_PHONE,
    password: OWNER_PHONE,
    staff: `/staff/login`,
  });
  log("summary", summary);
  log("staff phones", staffPhones);
}

async function main() {
  const prisma = await createPrisma();
  const branchIdMap: BranchIdMap = new Map();

  try {
    log(
      DRY_RUN
        ? "=== DRY RUN ==="
        : RESUME
          ? "=== RESUME CLONE ==="
          : "=== CLONE BRAND DEMO ===",
    );

    const sourceBrand = await prisma.brand.findFirst({
      where: { code: SOURCE_BRAND_CODE },
    });
    if (!sourceBrand) {
      throw new Error(`ไม่พบแบรนด์ต้นทาง: ${SOURCE_BRAND_CODE}`);
    }

    const existingDemo = await prisma.brand.findFirst({
      where: { code: DEMO_BRAND_CODE },
      include: { branches: { select: { id: true, name: true, kind: true } } },
    });
    if (existingDemo && !RESUME && !DRY_RUN) {
      throw new Error(
        `มีแบรนด์ ${DEMO_BRAND_CODE} อยู่แล้ว (id=${existingDemo.id}) — ใช้ --resume เพื่อทำต่อ`,
      );
    }
    if (RESUME && !existingDemo && !DRY_RUN) {
      throw new Error(`ไม่พบแบรนด์ ${DEMO_BRAND_CODE} สำหรับ resume`);
    }

    const sourceBranches = await prisma.branch.findMany({
      where: { brandId: sourceBrand.id },
    });
    const sourceByName = new Map(sourceBranches.map((b) => [b.name, b]));

    for (const cfg of STORE_BRANCHES) {
      if (!sourceByName.has(cfg.sourceName)) {
        throw new Error(`ไม่พบสาขาต้นทาง: ${cfg.sourceName}`);
      }
    }
    const sourceWarehouse = sourceBranches.find(
      (b) => b.kind === "WAREHOUSE" && b.name === WAREHOUSE_SOURCE_NAME,
    );
    if (!sourceWarehouse) {
      throw new Error(`ไม่พบสาขาคลังกลาง: ${WAREHOUSE_SOURCE_NAME}`);
    }

    if (DRY_RUN) {
      log("would create/resume demo brand", {
        resume: RESUME,
        code: DEMO_BRAND_CODE,
        existingBranches: existingDemo?.branches.map((b) => b.name) ?? [],
        storeBranches: STORE_BRANCHES.map((c) => ({
          demoName: demoName(c.demoLabel),
          phone: c.phone,
        })),
      });
      return;
    }

    let demoBrandId: string;

    if (RESUME && existingDemo) {
      demoBrandId = existingDemo.id;
      log("resuming demo brand", { id: demoBrandId });
    } else {
      const { passwordHash, passwordEnc } =
        await hashAndSealPassword(OWNER_PHONE);

      const demoBrand = await prisma.$transaction(async (tx) => {
        const created = await tx.brand.create({
          data: {
            code: DEMO_BRAND_CODE,
            name: DEMO_BRAND_NAME,
            nameTh: DEMO_BRAND_NAME,
            siteTitle: `${DEMO_BRAND_NAME} - สั่งอาหารออนไลน์`,
            siteDescription: `ระบบสาขาทดลอง ${DEMO_BRAND_NAME}`,
            contactPhone: OWNER_PHONE,
            color: sourceBrand.color,
            queueTicketCopies: sourceBrand.queueTicketCopies,
            stockEnabled: sourceBrand.stockEnabled,
            allowNegativeStock: sourceBrand.allowNegativeStock,
            stockAgingWarnDays: sourceBrand.stockAgingWarnDays,
            stockAgingCriticalDays: sourceBrand.stockAgingCriticalDays,
            status: "TRIAL",
            plan: sourceBrand.plan,
            maxBranches: 20,
            maxStaff: 50,
            kitchenEnabled: sourceBrand.kitchenEnabled,
            bbqEnabled: sourceBrand.bbqEnabled,
            skewerEnabled: sourceBrand.skewerEnabled,
            serviceStartsAt: new Date(),
            trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        });

        const admin = await tx.admin.create({
          data: {
            username: OWNER_PHONE,
            phone: OWNER_PHONE,
            passwordHash,
            passwordEnc,
            isPlatformAdmin: false,
          },
        });

        await tx.brandMember.create({
          data: { adminId: admin.id, brandId: created.id, role: "OWNER" },
        });

        return tx.brand.update({
          where: { id: created.id },
          data: { primaryAdminId: admin.id },
        });
      });
      log("created demo brand", { id: demoBrand.id, code: demoBrand.code });
      demoBrandId = demoBrand.id;
    }

    const productIdMap =
      RESUME && existingDemo
        ? await buildProductIdMapFromExisting(
            prisma,
            sourceBrand.id,
            demoBrandId,
          )
        : await copyBrandProducts(prisma, sourceBrand.id, demoBrandId);

    if (!RESUME) {
      await copyProductRecipes(prisma, sourceBrand.id, productIdMap);
    }

    const demoBranches = await prisma.branch.findMany({
      where: { brandId: demoBrandId },
      select: { id: true, name: true, kind: true },
    });
    const demoByName = new Map(demoBranches.map((b) => [b.name, b]));

    const existingWh = demoByName.get(demoName(WAREHOUSE_SOURCE_NAME));
    await ensureWarehouseBranch(
      prisma,
      demoBrandId,
      sourceWarehouse,
      productIdMap,
      branchIdMap,
      existingWh,
    );

    const codeSet = new Set(
      (
        await prisma.branch.findMany({
          where: { brandId: demoBrandId },
          select: { code: true },
        })
      )
        .map((b) => b.code)
        .filter((c): c is string => Boolean(c)),
    );

    for (const cfg of STORE_BRANCHES) {
      const source = sourceByName.get(cfg.sourceName)!;
      const existing = demoByName.get(demoName(cfg.demoLabel));
      await processStoreBranch(
        prisma,
        demoBrandId,
        source,
        cfg,
        productIdMap,
        branchIdMap,
        codeSet,
        existing,
      );
    }

    await printSummary(prisma, demoBrandId);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

