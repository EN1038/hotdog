import {
  BrandMemberRole,
  Prisma,
  StaffRole,
  StockLocationType,
  type PrismaClient,
} from "@prisma/client";
import { randomBytes } from "crypto";
import { importBranchCatalog } from "@/lib/branch-import";
import { hashAndSealPassword } from "@/lib/admin-password";
import { normalizePhone } from "@/lib/constants";
import { ensureBranchStockLocation } from "@/lib/stock";

export const MALAWAIWAI_SOURCE_BRAND_CODE = "hma-la-hna-pak-sxy-phed-lin-cha";
export const MALAWAIWAI_DEMO_BRAND_CODE = "malawaiwai-demo";
export const MALAWAIWAI_DEMO_BRAND_NAME = "หม่าล่า ไวไว - Demo";
export const MALAWAIWAI_DEMO_PASSWORD = "Demo2026!";

export type DemoBranchSpec = {
  sourceBranchId: string;
  demoName: string;
  demoCode: string;
  /** Omit for branches managed by owner/manager only (warehouse, skewer). */
  staffPhone?: string;
};

export const MALAWAIWAI_DEMO_STORE_BRANCHES: DemoBranchSpec[] = [
  {
    sourceBranchId: "cmrmytor700000u6j36worci3",
    demoName: "นวนคร ซอย 2 - Demo",
    demoCode: "nwnkhr-soy-2-demo",
    staffPhone: "0805555991",
  },
  {
    sourceBranchId: "cmsr1l7810000pgzeb47enjq9",
    demoName: "CJ นวนคร - Demo",
    demoCode: "cj-nwnkhr-demo",
    staffPhone: "0805555992",
  },
  {
    sourceBranchId: "cmrt2p7zg005g0v87lowgbv1r",
    demoName: "คลอง 6 หน้าหมู่บ้าน - Demo",
    demoCode: "khlong-6-hnahmuban-demo",
    staffPhone: "0805555993",
  },
  {
    sourceBranchId: "cmrt2lhb100000v87sdfrjfsk",
    demoName: "คลอง 6 สะพานชมพู - Demo",
    demoCode: "khlong-6-saphanchmphu-demo",
    staffPhone: "0805555994",
  },
  {
    sourceBranchId: "cmt2lm6os0000brzeywl01464",
    demoName: "คลองหลวง 2 สต็อกกลาง - Demo",
    demoCode: "klongluang-2-stock-demo",
    staffPhone: "0805555995",
  },
];

/** Extra demo branches — visible to owner/manager; no dedicated staff login. */
export const MALAWAIWAI_DEMO_EXTRA_BRANCHES: DemoBranchSpec[] = [
  {
    sourceBranchId: "cmsiu0mbw0006z4uqj4ksddoc",
    demoName: "สั่งเสียบไม้ - Demo",
    demoCode: "sangesiybaim-demo",
  },
  {
    sourceBranchId: "cmswr72v00003m2zep35l8h5t",
    demoName: "สต๊อกกลาง - Demo",
    demoCode: "stock-center-demo",
  },
];

export const MALAWAIWAI_DEMO_BRANCHES: DemoBranchSpec[] = [
  ...MALAWAIWAI_DEMO_STORE_BRANCHES,
  ...MALAWAIWAI_DEMO_EXTRA_BRANCHES,
];

export const MALAWAIWAI_DEMO_OWNER_PHONE = "0805555990";
export const MALAWAIWAI_DEMO_MANAGER_PHONE = "0805555996";

const DEMO_ADMIN_PHONES = [
  MALAWAIWAI_DEMO_OWNER_PHONE,
  MALAWAIWAI_DEMO_MANAGER_PHONE,
];

const DEMO_STAFF_PHONES = MALAWAIWAI_DEMO_STORE_BRANCHES.map(
  (b) => b.staffPhone!,
);

function demoOrderNumber(branchCode: string, orderNumber: string) {
  return `D-${branchCode}-${orderNumber}`;
}

function demoShareToken() {
  return randomBytes(24).toString("base64url");
}

function demoSkewerOrderNumber(branchCode: string, orderNumber: string) {
  return `D-${branchCode}-${orderNumber}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function cloneBrandProducts(
  prisma: PrismaClient,
  sourceBrandId: string,
  targetBrandId: string,
) {
  const products = await prisma.brandProduct.findMany({
    where: { brandId: sourceBrandId },
    orderBy: { createdAt: "asc" },
  });
  const map = new Map<string, string>();
  for (const p of products) {
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
  return map;
}

async function cloneBranchStockCounts(
  prisma: PrismaClient,
  opts: {
    sourceBrandId: string;
    targetBrandId: string;
    sourceBranchId: string;
    targetBranchId: string;
    targetBranchName: string;
    brandProductIdMap: Map<string, string>;
    shiftIdMap: Map<string, string>;
    demoStaffId: string | null;
  },
) {
  const {
    sourceBrandId,
    targetBrandId,
    sourceBranchId,
    targetBranchId,
    targetBranchName,
    brandProductIdMap,
    shiftIdMap,
    demoStaffId,
  } = opts;

  const sourceLocation = await prisma.stockLocation.findFirst({
    where: { branchId: sourceBranchId },
  });
  if (!sourceLocation) {
    return { stockCounts: 0, stockCountLines: 0 };
  }

  const targetLocation = await ensureBranchStockLocation(
    {
      brandId: targetBrandId,
      branchId: targetBranchId,
      branchName: targetBranchName,
    },
    prisma,
  );

  const counts = await prisma.stockCount.findMany({
    where: { branchId: sourceBranchId, brandId: sourceBrandId },
    include: { lines: true },
    orderBy: { createdAt: "asc" },
  });

  let lineTotal = 0;
  for (const count of counts) {
    const lines = count.lines
      .map((line) => {
        const brandProductId = brandProductIdMap.get(line.brandProductId);
        if (!brandProductId) return null;
        return {
          brandProductId,
          systemQty: line.systemQty,
          countedQty: line.countedQty,
          openingQty: line.openingQty,
          addedQty: line.addedQty,
          salesQty: line.salesQty,
          wasteQty: line.wasteQty,
          expectedQty: line.expectedQty,
          varianceQty: line.varianceQty,
          varianceReason: line.varianceReason,
          note: line.note,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    await prisma.stockCount.create({
      data: {
        brandId: targetBrandId,
        branchId: targetBranchId,
        shiftId: count.shiftId ? (shiftIdMap.get(count.shiftId) ?? null) : null,
        stockLocationId: targetLocation.id,
        name: count.name,
        type: count.type,
        status: count.status,
        startsAt: count.startsAt,
        endsAt: count.endsAt,
        note: count.note,
        completedAt: count.completedAt,
        createdAt: count.createdAt,
        createdByStaffId: demoStaffId,
        lines: lines.length > 0 ? { create: lines } : undefined,
      },
    });
    lineTotal += lines.length;
  }

  return { stockCounts: counts.length, stockCountLines: lineTotal };
}

async function cloneSkewerOrders(
  prisma: PrismaClient,
  opts: {
    sourceBranchId: string;
    targetBranchId: string;
    targetBranchCode: string;
    menuItemIdMap: Map<string, string>;
  },
) {
  const { sourceBranchId, targetBranchId, targetBranchCode, menuItemIdMap } =
    opts;

  const orders = await prisma.skewerOrder.findMany({
    where: { branchId: sourceBranchId },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });

  for (const order of orders) {
    await prisma.skewerOrder.create({
      data: {
        orderNumber: demoSkewerOrderNumber(targetBranchCode, order.orderNumber),
        branchId: targetBranchId,
        customerId: order.customerId,
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        requestedDate: order.requestedDate,
        addressText: order.addressText,
        latitude: order.latitude,
        longitude: order.longitude,
        note: order.note,
        status: order.status,
        adminNote: order.adminNote,
        confirmedAt: order.confirmedAt,
        cancelReason: order.cancelReason,
        cancelledAt: order.cancelledAt,
        deliveredAt: order.deliveredAt,
        deliveredOn: order.deliveredOn,
        deliveryInfo: order.deliveryInfo,
        shippingCostBaht: order.shippingCostBaht,
        publicShareToken: order.publicShareToken ? demoShareToken() : null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: {
          create: order.items.map((item) => ({
            branchMenuItemId: item.branchMenuItemId
              ? (menuItemIdMap.get(item.branchMenuItemId) ?? null)
              : null,
            itemName: item.itemName,
            requestedQuantity: item.requestedQuantity,
            confirmedQuantity: item.confirmedQuantity,
            quantityUnit: item.quantityUnit,
            sticksPerUnit: item.sticksPerUnit,
            countsAsSticks: item.countsAsSticks,
            skewerCategoryRole: item.skewerCategoryRole,
            unitPriceBaht: item.unitPriceBaht,
          })),
        },
      },
    });
  }

  return { skewerOrders: orders.length };
}

async function cloneBrandWarehouseStock(
  prisma: PrismaClient,
  opts: {
    sourceBrandId: string;
    targetBrandId: string;
    sourceWarehouseBranchId: string;
    targetWarehouseBranchId: string;
    targetWarehouseName: string;
    brandProductIdMap: Map<string, string>;
    branchIdMap: Map<string, string>;
  },
) {
  const {
    sourceBrandId,
    targetBrandId,
    sourceWarehouseBranchId,
    targetWarehouseBranchId,
    targetWarehouseName,
    brandProductIdMap,
    branchIdMap,
  } = opts;

  const locationIdMap = new Map<string, string>();
  const sourceLocations = await prisma.stockLocation.findMany({
    where: { brandId: sourceBrandId },
  });

  for (const loc of sourceLocations) {
    let targetLocId: string | null = null;
    if (loc.branchId === sourceWarehouseBranchId) {
      let targetLoc = await prisma.stockLocation.findFirst({
        where: { branchId: targetWarehouseBranchId },
      });
      if (!targetLoc) {
        targetLoc = await prisma.stockLocation.create({
          data: {
            brandId: targetBrandId,
            branchId: targetWarehouseBranchId,
            type: StockLocationType.WAREHOUSE,
            name: targetWarehouseName,
          },
        });
      }
      targetLocId = targetLoc.id;
    } else if (loc.branchId) {
      const demoBranchId = branchIdMap.get(loc.branchId);
      if (demoBranchId) {
        const demoBranch = await prisma.branch.findUnique({
          where: { id: demoBranchId },
          select: { name: true },
        });
        if (demoBranch) {
          const targetLoc = await ensureBranchStockLocation(
            {
              brandId: targetBrandId,
              branchId: demoBranchId,
              branchName: demoBranch.name,
            },
            prisma,
          );
          targetLocId = targetLoc.id;
        }
      }
    }
    if (targetLocId) {
      locationIdMap.set(loc.id, targetLocId);
    }
  }

  const sourceWarehouseLoc = sourceLocations.find(
    (l) => l.branchId === sourceWarehouseBranchId,
  );
  let balancesCopied = 0;
  if (sourceWarehouseLoc) {
    const targetLocId = locationIdMap.get(sourceWarehouseLoc.id);
    if (targetLocId) {
      const balances = await prisma.stockBalance.findMany({
        where: { stockLocationId: sourceWarehouseLoc.id },
      });
      if (balances.length > 0) {
        await prisma.stockBalance.createMany({
          data: balances
            .map((b) => {
              const brandProductId = brandProductIdMap.get(b.brandProductId);
              if (!brandProductId) return null;
              return {
                stockLocationId: targetLocId,
                brandProductId,
                quantity: b.quantity,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null),
          skipDuplicates: true,
        });
        balancesCopied = balances.length;
      }
    }
  }

  const movements = await prisma.stockMovement.findMany({
    where: { brandId: sourceBrandId },
    orderBy: { createdAt: "asc" },
  });

  let movementsCopied = 0;
  for (const move of movements) {
    const brandProductId = brandProductIdMap.get(move.brandProductId);
    if (!brandProductId) continue;

    const mapLoc = (id: string | null | undefined) =>
      id ? (locationIdMap.get(id) ?? null) : null;

    await prisma.stockMovement.create({
      data: {
        brandId: targetBrandId,
        brandProductId,
        type: move.type,
        quantity: move.quantity,
        beforeQty: move.beforeQty,
        afterQty: move.afterQty,
        unitCost: move.unitCost,
        totalCost: move.totalCost,
        supplier: move.supplier,
        stockLocationId: mapLoc(move.stockLocationId),
        fromLocationId: mapLoc(move.fromLocationId),
        toLocationId: mapLoc(move.toLocationId),
        referenceType: move.referenceType,
        referenceId: move.referenceId,
        note: move.note,
        imageUrl: move.imageUrl,
        lotNumber: move.lotNumber,
        expiresAt: move.expiresAt,
        documentNo: move.documentNo,
        createdAt: move.createdAt,
      },
    });
    movementsCopied += 1;
  }

  return {
    warehouseBalances: balancesCopied,
    stockMovements: movementsCopied,
  };
}

async function cloneBranchOperationalData(
  prisma: PrismaClient,
  opts: {
    sourceBrandId: string;
    targetBrandId: string;
    sourceBranchId: string;
    targetBranchId: string;
    targetBranchCode: string;
    targetBranchName: string;
    menuItemIdMap: Map<string, string>;
    locationIdMap: Map<string, string>;
    nonMenuItemIdMap: Map<string, string>;
    brandProductIdMap: Map<string, string>;
    demoStaffId: string | null;
    cloneSkewer?: boolean;
  },
) {
  const {
    sourceBrandId,
    targetBrandId,
    sourceBranchId,
    targetBranchId,
    targetBranchCode,
    targetBranchName,
    menuItemIdMap,
    locationIdMap,
    nonMenuItemIdMap,
    brandProductIdMap,
    demoStaffId,
    cloneSkewer = false,
  } = opts;

  const stocks = await prisma.branchMenuItemStock.findMany({
    where: { branchId: sourceBranchId },
  });
  if (stocks.length > 0) {
    await prisma.branchMenuItemStock.createMany({
      data: stocks
        .map((s) => {
          const menuItemId = menuItemIdMap.get(s.menuItemId);
          if (!menuItemId) return null;
          return {
            branchId: targetBranchId,
            menuItemId,
            quantity: s.quantity,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null),
      skipDuplicates: true,
    });
  }

  const parRows = await prisma.branchMenuItemParStock.findMany({
    where: { branchId: sourceBranchId },
  });
  for (const row of parRows) {
    const menuItemId = menuItemIdMap.get(row.menuItemId);
    if (!menuItemId) continue;
    await prisma.branchMenuItemParStock.create({
      data: {
        branchId: targetBranchId,
        menuItemId,
        parStock: row.parStock,
        source: row.source,
        coverageDays: row.coverageDays,
        safetyPct: row.safetyPct,
        avgDailySales: row.avgDailySales,
        recommendedValue: row.recommendedValue,
        analysisFrom: row.analysisFrom,
        analysisTo: row.analysisTo,
      },
    });
  }

  const parHistories = await prisma.branchMenuItemParStockHistory.findMany({
    where: { branchId: sourceBranchId },
    orderBy: { createdAt: "asc" },
  });
  if (parHistories.length > 0) {
    await prisma.branchMenuItemParStockHistory.createMany({
      data: parHistories
        .map((h) => {
          const menuItemId = menuItemIdMap.get(h.menuItemId);
          if (!menuItemId) return null;
          return {
            branchId: targetBranchId,
            menuItemId,
            oldParStock: h.oldParStock,
            newParStock: h.newParStock,
            source: h.source,
            reason: h.reason,
            metadata: h.metadata ?? Prisma.JsonNull,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null),
    });
  }

  const shifts = await prisma.branchShift.findMany({
    where: { branchId: sourceBranchId },
    orderBy: [{ calendarDate: "asc" }, { roundNumber: "asc" }],
  });
  const shiftIdMap = new Map<string, string>();
  for (const shift of shifts) {
    const created = await prisma.branchShift.create({
      data: {
        branchId: targetBranchId,
        calendarDate: shift.calendarDate,
        roundNumber: shift.roundNumber,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        openedByStaffId: demoStaffId,
        closedByStaffId: shift.closedAt ? demoStaffId : null,
        openingCash: shift.openingCash,
        closingCash: shift.closingCash,
        note: shift.note,
        cancelledAt: shift.cancelledAt,
        cancelNote: shift.cancelNote,
      },
    });
    shiftIdMap.set(shift.id, created.id);
  }

  const orders = await prisma.order.findMany({
    where: { branchId: sourceBranchId },
    include: { items: true, consumableLines: true },
    orderBy: { createdAt: "asc" },
  });
  for (const order of orders) {
    await prisma.order.create({
      data: {
        orderNumber: demoOrderNumber(targetBranchCode, order.orderNumber),
        queueNumber: order.queueNumber,
        queueBusinessDate: order.queueBusinessDate,
        customerId: order.customerId,
        branchId: targetBranchId,
        fulfillmentType: order.fulfillmentType,
        deliveryLocationId: order.deliveryLocationId
          ? (locationIdMap.get(order.deliveryLocationId) ?? null)
          : null,
        addressDetail: order.addressDetail,
        deliveryLatitude: order.deliveryLatitude,
        deliveryLongitude: order.deliveryLongitude,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        isNewCustomer: order.isNewCustomer,
        scheduledAt: order.scheduledAt,
        note: order.note,
        promoSummary: order.promoSummary,
        cupSizeOz: order.cupSizeOz,
        cupCount: order.cupCount,
        bagCount: order.bagCount,
        paymentMethod: order.paymentMethod,
        salesChannel: order.salesChannel,
        deliveryFee: order.deliveryFee,
        discountAmount: order.discountAmount,
        status: order.status,
        cancelledAt: order.cancelledAt,
        cancelReason: order.cancelReason,
        createdByStaffId: demoStaffId,
        shiftId: order.shiftId
          ? (shiftIdMap.get(order.shiftId) ?? null)
          : null,
        photoUrl: order.photoUrl,
        paymentSlipUrl: order.paymentSlipUrl,
        publicShareToken: order.publicShareToken ? demoShareToken() : null,
        awaitingPhotoKey: order.awaitingPhotoKey,
        stockDeducted: order.stockDeducted,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: {
          create: order.items.map((item) => ({
            branchMenuItemId: item.branchMenuItemId
              ? (menuItemIdMap.get(item.branchMenuItemId) ?? null)
              : null,
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            optionsText: item.optionsText,
            optionsPrice: item.optionsPrice,
            giftQuantity: item.giftQuantity,
            note: item.note,
          })),
        },
        consumableLines: {
          create: order.consumableLines
            .map((line) => {
              const branchNonMenuItemId = nonMenuItemIdMap.get(
                line.branchNonMenuItemId,
              );
              if (!branchNonMenuItemId) return null;
              return {
                branchNonMenuItemId,
                itemName: line.itemName,
                quantity: line.quantity,
                unit: line.unit,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null),
        },
      },
    });
  }

  const expenses = await prisma.branchExpense.findMany({
    where: { branchId: sourceBranchId },
    orderBy: { createdAt: "asc" },
  });
  if (expenses.length > 0) {
    await prisma.branchExpense.createMany({
      data: expenses.map((e) => ({
        branchId: targetBranchId,
        shiftId: e.shiftId ? (shiftIdMap.get(e.shiftId) ?? null) : null,
        title: e.title,
        amount: e.amount,
        paymentMode: e.paymentMode,
        schedule: e.schedule,
        payChannel: e.payChannel,
        expenseDate: e.expenseDate,
        note: e.note,
        createdByStaffId: demoStaffId,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    });
  }

  const stockHistories = await prisma.branchMenuItemStockHistory.findMany({
    where: { branchId: sourceBranchId },
    orderBy: { createdAt: "asc" },
  });
  for (const batch of chunk(stockHistories, 200)) {
    await prisma.branchMenuItemStockHistory.createMany({
      data: batch
        .map((h) => {
          const menuItemId = menuItemIdMap.get(h.menuItemId);
          if (!menuItemId) return null;
          return {
            branchId: targetBranchId,
            menuItemId,
            quantity: h.quantity,
            type: h.type,
            note: h.note,
            imageUrl: h.imageUrl,
            batchId: h.batchId,
            cancelledAt: h.cancelledAt,
            cancelNote: h.cancelNote,
            receivedAt: h.receivedAt,
            expiresAt: h.expiresAt,
            documentNo: h.documentNo,
            createdAt: h.createdAt,
            createdByStaffId: demoStaffId,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null),
    });
  }

  const nonMenuHistories = await prisma.branchNonMenuItemHistory.findMany({
    where: { item: { branchId: sourceBranchId } },
    orderBy: { createdAt: "asc" },
  });
  for (const batch of chunk(nonMenuHistories, 200)) {
    await prisma.branchNonMenuItemHistory.createMany({
      data: batch
        .map((h) => {
          const branchNonMenuItemId = nonMenuItemIdMap.get(h.branchNonMenuItemId);
          if (!branchNonMenuItemId) return null;
          return {
            branchNonMenuItemId,
            quantity: h.quantity,
            type: h.type,
            note: h.note,
            imageUrl: h.imageUrl,
            batchId: h.batchId,
            cancelledAt: h.cancelledAt,
            cancelNote: h.cancelNote,
            documentNo: h.documentNo,
            createdAt: h.createdAt,
            createdByStaffId: demoStaffId,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null),
    });
  }

  const plans = await prisma.branchTomorrowPlan.findMany({
    where: { branchId: sourceBranchId },
    include: { lines: true },
    orderBy: { planDate: "asc" },
  });
  for (const plan of plans) {
    const createdPlan = await prisma.branchTomorrowPlan.create({
      data: {
        branchId: targetBranchId,
        planDate: plan.planDate,
        status: plan.status,
        note: plan.note,
        confirmedAt: plan.confirmedAt,
        updatedAt: plan.updatedAt,
      },
    });
    if (plan.lines.length > 0) {
      await prisma.branchTomorrowPlanLine.createMany({
        data: plan.lines
          .map((line) => {
            const menuItemId = menuItemIdMap.get(line.menuItemId);
            if (!menuItemId) return null;
            return {
              planId: createdPlan.id,
              branchId: targetBranchId,
              menuItemId,
              planDate: line.planDate,
              confirmedQty: line.confirmedQty,
              suggestedQty: line.suggestedQty,
              parStock: line.parStock,
              availableStock: line.availableStock,
              confirmedAt: line.confirmedAt,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row != null),
      });
    }
  }

  const shareCodes = await prisma.branchShareCode.findMany({
    where: { sourceBranchId: sourceBranchId },
  });
  for (const code of shareCodes) {
    const demoCode = `${code.code}-${targetBranchCode}`;
    const exists = await prisma.branchShareCode.findUnique({
      where: { code: demoCode },
    });
    if (exists) continue;
    await prisma.branchShareCode.create({
      data: {
        code: demoCode,
        sourceBranchId: targetBranchId,
      },
    });
  }

  const stockCountStats = await cloneBranchStockCounts(prisma, {
    sourceBrandId,
    targetBrandId,
    sourceBranchId,
    targetBranchId,
    targetBranchName,
    brandProductIdMap,
    shiftIdMap,
    demoStaffId,
  });

  const skewerStats = cloneSkewer
    ? await cloneSkewerOrders(prisma, {
        sourceBranchId,
        targetBranchId,
        targetBranchCode,
        menuItemIdMap,
      })
    : { skewerOrders: 0 };

  const nonMenuHistCount = nonMenuHistories.length;

  return {
    shifts: shifts.length,
    orders: orders.length,
    stockHistories: stockHistories.length,
    expenses: expenses.length,
    tomorrowPlans: plans.length,
    stockCounts: stockCountStats.stockCounts,
    stockCountLines: stockCountStats.stockCountLines,
    nonMenuHistories: nonMenuHistCount,
    skewerOrders: skewerStats.skewerOrders,
  };
}

async function resetExistingDemo(prisma: PrismaClient) {
  const existing = await prisma.brand.findUnique({
    where: { code: MALAWAIWAI_DEMO_BRAND_CODE },
    select: { id: true },
  });
  if (existing) {
    await prisma.brand.delete({ where: { id: existing.id } });
  }

  // Orphaned demo artifacts from interrupted runs
  await prisma.branchShareCode.deleteMany({
    where: { code: { contains: "-demo" } },
  });
  await prisma.order.deleteMany({
    where: { orderNumber: { startsWith: "D-" } },
  });
  await prisma.skewerOrder.deleteMany({
    where: { orderNumber: { startsWith: "D-" } },
  });

  const staffPhones = DEMO_STAFF_PHONES.map(normalizePhone);
  await prisma.staff.deleteMany({
    where: { phone: { in: staffPhones } },
  });

  const adminPhones = DEMO_ADMIN_PHONES.map(normalizePhone);
  await prisma.admin.deleteMany({
    where: {
      phone: { in: adminPhones },
      isPlatformAdmin: false,
    },
  });
}

async function ensureDemoAdmin(
  prisma: PrismaClient,
  opts: {
    phone: string;
    role: BrandMemberRole;
    brandId: string;
    password: string;
    primary?: boolean;
  },
) {
  const normalized = normalizePhone(opts.phone);
  const sealed = await hashAndSealPassword(opts.password);
  const admin = await prisma.admin.upsert({
    where: { phone: normalized },
    create: {
      username: normalized,
      phone: normalized,
      passwordHash: sealed.passwordHash,
      passwordEnc: sealed.passwordEnc,
      isPlatformAdmin: false,
    },
    update: {
      username: normalized,
      passwordHash: sealed.passwordHash,
      passwordEnc: sealed.passwordEnc,
      isPlatformAdmin: false,
    },
  });

  await prisma.brandMember.upsert({
    where: {
      adminId_brandId: { adminId: admin.id, brandId: opts.brandId },
    },
    create: {
      adminId: admin.id,
      brandId: opts.brandId,
      role: opts.role,
    },
    update: { role: opts.role },
  });

  if (opts.primary) {
    await prisma.brand.update({
      where: { id: opts.brandId },
      data: { primaryAdminId: admin.id },
    });
  }

  return admin.id;
}

async function createDemoStaff(
  prisma: PrismaClient,
  branchId: string,
  phone: string,
  name: string,
) {
  const normalized = normalizePhone(phone);
  const staff = await prisma.staff.create({
    data: {
      branchId,
      phone: normalized,
      name,
      isActive: true,
      phoneVerifiedAt: new Date(),
      roles: {
        create: [{ role: StaffRole.SELLER }],
      },
    },
  });
  return staff.id;
}

export type MalawaiwaiDemoSetupResult = {
  brandId: string;
  brandCode: string;
  branches: Array<{
    demoName: string;
    demoCode: string;
    branchId: string;
    staffPhone: string | null;
    stats: Awaited<ReturnType<typeof cloneBranchOperationalData>>;
  }>;
  warehouseStats: { warehouseBalances: number; stockMovements: number };
  ownerPhone: string;
  managerPhone: string;
  password: string;
};

export async function setupMalawaiwaiDemo(
  prisma: PrismaClient,
): Promise<MalawaiwaiDemoSetupResult> {
  const source = await prisma.brand.findUnique({
    where: { code: MALAWAIWAI_SOURCE_BRAND_CODE },
  });
  if (!source) {
    throw new Error(`ไม่พบแบรนด์ต้นทาง: ${MALAWAIWAI_SOURCE_BRAND_CODE}`);
  }

  await resetExistingDemo(prisma);

  const demoBrand = await prisma.brand.create({
    data: {
      code: MALAWAIWAI_DEMO_BRAND_CODE,
      name: MALAWAIWAI_DEMO_BRAND_NAME,
      nameTh: MALAWAIWAI_DEMO_BRAND_NAME,
      nameEn: source.nameEn,
      siteTitle: `${source.siteTitle ?? source.name} (Demo)`,
      siteDescription: source.siteDescription,
      logoUrl: source.logoUrl,
      coverImageUrl: source.coverImageUrl,
      contactPhone: source.contactPhone,
      color: source.color,
      queueTicketCopies: source.queueTicketCopies,
      stockEnabled: source.stockEnabled,
      allowNegativeStock: source.allowNegativeStock,
      stockAgingWarnDays: source.stockAgingWarnDays,
      stockAgingCriticalDays: source.stockAgingCriticalDays,
      status: source.status,
      plan: source.plan,
      maxBranches: Math.max(source.maxBranches, 10),
      maxStaff: Math.max(source.maxStaff, 50),
      kitchenEnabled: source.kitchenEnabled,
      bbqEnabled: source.bbqEnabled,
      skewerEnabled: source.skewerEnabled,
      trialEndsAt: source.trialEndsAt,
      serviceStartsAt: source.serviceStartsAt,
    },
  });

  const brandProductIdMap = await cloneBrandProducts(
    prisma,
    source.id,
    demoBrand.id,
  );

  const branchResults: MalawaiwaiDemoSetupResult["branches"] = [];
  const branchIdMap = new Map<string, string>();
  let warehouseTargetId: string | null = null;

  for (const spec of MALAWAIWAI_DEMO_BRANCHES) {
    console.log(`  → สาขา ${spec.demoName} …`);
    const sourceBranch = await prisma.branch.findUnique({
      where: { id: spec.sourceBranchId },
    });
    if (!sourceBranch) {
      throw new Error(`ไม่พบสาขาต้นทาง: ${spec.sourceBranchId}`);
    }

    const isWarehouse = sourceBranch.kind === "WAREHOUSE";
    const isSkewer = sourceBranch.operatingMode === "SKEWER";

    const demoBranch = await prisma.branch.create({
      data: {
        brandId: demoBrand.id,
        code: spec.demoCode,
        name: spec.demoName,
        nameTh: spec.demoName,
        nameEn: sourceBranch.nameEn,
        imageUrl: sourceBranch.imageUrl,
        address: sourceBranch.address,
        latitude: sourceBranch.latitude,
        longitude: sourceBranch.longitude,
        phone: sourceBranch.phone,
        primaryCategory: sourceBranch.primaryCategory,
        secondaryCategories: sourceBranch.secondaryCategories,
        priceRange: sourceBranch.priceRange,
        ownerMessage: sourceBranch.ownerMessage,
        extraMessage: sourceBranch.extraMessage,
        isOpen: sourceBranch.isOpen,
        isHidden: isWarehouse ? true : false,
        isTest: false,
        kind: sourceBranch.kind,
        warehouseIssueMode: sourceBranch.warehouseIssueMode,
        warehouseAllowedBranchIds: [],
        storefrontHours: sourceBranch.storefrontHours ?? undefined,
        deliveryHours: sourceBranch.deliveryHours ?? undefined,
        allowAdvanceOrder: sourceBranch.allowAdvanceOrder,
        autoAcceptOrders: sourceBranch.autoAcceptOrders,
        stockEnabled: sourceBranch.stockEnabled,
        operatingMode: sourceBranch.operatingMode,
        weighSalesEnabled: sourceBranch.weighSalesEnabled,
        alertSoundId: sourceBranch.alertSoundId,
      },
    });

    branchIdMap.set(spec.sourceBranchId, demoBranch.id);
    if (isWarehouse) {
      warehouseTargetId = demoBranch.id;
    }

    const imported = await importBranchCatalog({
      sourceBranchId: spec.sourceBranchId,
      targetBranchId: demoBranch.id,
      overwriteMenu: true,
      includeLocations: true,
      includeNonMenuItems: true,
      brandProductIdMap,
      preserveOutOfStock: true,
      preserveNonMenuQuantities: true,
    });

    let demoStaffId: string | null = null;
    if (spec.staffPhone) {
      demoStaffId = await createDemoStaff(
        prisma,
        demoBranch.id,
        spec.staffPhone,
        `พนักงาน ${spec.demoName}`,
      );
    }

    const stats = await cloneBranchOperationalData(prisma, {
      sourceBrandId: source.id,
      targetBrandId: demoBrand.id,
      sourceBranchId: spec.sourceBranchId,
      targetBranchId: demoBranch.id,
      targetBranchCode: spec.demoCode,
      targetBranchName: spec.demoName,
      menuItemIdMap: imported.menuItemIdMap,
      locationIdMap: imported.locationIdMap,
      nonMenuItemIdMap: imported.nonMenuItemIdMap,
      brandProductIdMap,
      demoStaffId,
      cloneSkewer: isSkewer,
    });

    branchResults.push({
      demoName: spec.demoName,
      demoCode: spec.demoCode,
      branchId: demoBranch.id,
      staffPhone: spec.staffPhone ? normalizePhone(spec.staffPhone) : null,
      stats,
    });
    console.log(
      `     เสร็จ orders=${stats.orders} stockHist=${stats.stockHistories} counts=${stats.stockCounts} skewer=${stats.skewerOrders}`,
    );
  }

  let warehouseStats = { warehouseBalances: 0, stockMovements: 0 };
  const warehouseSource = MALAWAIWAI_DEMO_EXTRA_BRANCHES.find(
    (b) => b.demoCode === "stock-center-demo",
  );
  if (warehouseSource && warehouseTargetId) {
    console.log("  → สต๊อกกลาง (ยอดคงเหลือ + ประวัตินำเข้า) …");
    warehouseStats = await cloneBrandWarehouseStock(prisma, {
      sourceBrandId: source.id,
      targetBrandId: demoBrand.id,
      sourceWarehouseBranchId: warehouseSource.sourceBranchId,
      targetWarehouseBranchId: warehouseTargetId,
      targetWarehouseName: "สต๊อกกลาง - Demo",
      brandProductIdMap,
      branchIdMap,
    });
    console.log(
      `     เสร็จ balances=${warehouseStats.warehouseBalances} movements=${warehouseStats.stockMovements}`,
    );
  }

  await ensureDemoAdmin(prisma, {
    phone: MALAWAIWAI_DEMO_OWNER_PHONE,
    role: BrandMemberRole.OWNER,
    brandId: demoBrand.id,
    password: MALAWAIWAI_DEMO_PASSWORD,
    primary: true,
  });

  await ensureDemoAdmin(prisma, {
    phone: MALAWAIWAI_DEMO_MANAGER_PHONE,
    role: BrandMemberRole.MANAGER,
    brandId: demoBrand.id,
    password: MALAWAIWAI_DEMO_PASSWORD,
  });

  return {
    brandId: demoBrand.id,
    brandCode: demoBrand.code,
    branches: branchResults,
    warehouseStats,
    ownerPhone: normalizePhone(MALAWAIWAI_DEMO_OWNER_PHONE),
    managerPhone: normalizePhone(MALAWAIWAI_DEMO_MANAGER_PHONE),
    password: MALAWAIWAI_DEMO_PASSWORD,
  };
}
