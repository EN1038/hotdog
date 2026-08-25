import {
  BranchStockRequestStatus,
  KitchenProductionStatus,
  Prisma,
  StockMovementType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  brandAllowsNegative,
  changeBalance,
  ensureWarehouseLocation,
  StockError,
  transferWarehouseToBranch,
} from "@/lib/stock";
import { addToLot, deductFromLotsFefo } from "@/lib/stock-advanced";
import { assertBrandWriteAllowedByBrandId } from "@/lib/brand-plan";

type Actor = { adminId?: string | null; staffId?: string | null };

function unitsFromRecipe(qtyPerUnit: Prisma.Decimal | number, outputUnits: number) {
  const per = Number(qtyPerUnit);
  if (!Number.isFinite(per) || per <= 0) return 0;
  // Round up so partial units still consume at least planned inventory
  return Math.max(0, Math.ceil(per * outputUnits - 1e-9));
}

/** Preview components needed to produce finished goods */
export async function previewKitchenProduction(input: {
  brandId: string;
  finishedProductId: string;
  quantityProduced: number;
  quantityWasted?: number;
}) {
  if (input.quantityProduced < 0) throw new StockError("จำนวนผลิตต้องไม่ติดลบ");
  const waste = input.quantityWasted ?? 0;
  if (waste < 0) throw new StockError("ของเสียต้องไม่ติดลบ");
  const outputUnits = input.quantityProduced + waste;
  if (outputUnits <= 0) throw new StockError("ต้องระบุจำนวนผลิตหรือของเสีย");

  const finished = await prisma.brandProduct.findFirst({
    where: {
      id: input.finishedProductId,
      brandId: input.brandId,
      isActive: true,
    },
    include: {
      recipeLines: {
        include: {
          component: {
            select: {
              id: true,
              name: true,
              unit: true,
              stockType: true,
              trackLots: true,
            },
          },
        },
      },
    },
  });
  if (!finished) throw new StockError("ไม่พบสินค้าสำเร็จรูป", 404);

  const warehouse = await ensureWarehouseLocation(input.brandId);
  const components = [];
  for (const line of finished.recipeLines) {
    const planned = unitsFromRecipe(line.quantityPerUnit, outputUnits);
    const bal = await prisma.stockBalance.findUnique({
      where: {
        stockLocationId_brandProductId: {
          stockLocationId: warehouse.id,
          brandProductId: line.componentProductId,
        },
      },
    });
    components.push({
      brandProductId: line.componentProductId,
      name: line.component.name,
      unit: line.component.unit,
      stockType: line.component.stockType,
      trackLots: line.component.trackLots,
      quantityPerUnit: Number(line.quantityPerUnit),
      quantityPlanned: planned,
      available: bal?.quantity ?? 0,
      shortfall: Math.max(0, planned - (bal?.quantity ?? 0)),
    });
  }

  return {
    finishedProduct: {
      id: finished.id,
      name: finished.name,
      unit: finished.unit,
      stockType: finished.stockType,
    },
    quantityProduced: input.quantityProduced,
    quantityWasted: waste,
    outputUnits,
    warehouse: { id: warehouse.id, name: warehouse.name },
    hasRecipe: finished.recipeLines.length > 0,
    components,
  };
}

/**
 * Phase 1–2 + 4: convert raw → finished at warehouse via recipe,
 * optional waste, optional FEFO lots, finish lot number.
 */
export async function runKitchenProduction(
  input: {
    brandId: string;
    finishedProductId: string;
    quantityProduced: number;
    quantityWasted?: number;
    note?: string | null;
    lotNumber?: string | null;
    /** Override actual component use; default = planned from recipe */
    componentUsage?: { brandProductId: string; quantityUsed: number }[];
    useLots?: boolean;
  } & Actor,
) {
  const waste = input.quantityWasted ?? 0;
  await assertBrandWriteAllowedByBrandId(input.brandId);
  if (input.quantityProduced < 0 || waste < 0) {
    throw new StockError("จำนวนต้องไม่ติดลบ");
  }
  const outputUnits = input.quantityProduced + waste;
  if (outputUnits <= 0) {
    throw new StockError("ต้องระบุจำนวนผลิตหรือของเสียอย่างน้อย 1");
  }

  return prisma.$transaction(async (tx) => {
    const finished = await tx.brandProduct.findFirst({
      where: {
        id: input.finishedProductId,
        brandId: input.brandId,
        isActive: true,
      },
      include: { recipeLines: true },
    });
    if (!finished) throw new StockError("ไม่พบสินค้าสำเร็จรูป", 404);

    const warehouse = await ensureWarehouseLocation(input.brandId, tx);
    const allowNeg = await brandAllowsNegative(tx, input.brandId);
    const overrideMap = new Map(
      (input.componentUsage ?? []).map((c) => [c.brandProductId, c.quantityUsed]),
    );

    if (finished.recipeLines.length === 0 && overrideMap.size === 0) {
      throw new StockError(
        "ยังไม่มีสูตรผลิต — ตั้งสูตร (BOM) ในแท็บสูตร หรือระบุวัตถุดิบที่ใช้เอง",
      );
    }

    type CompLine = {
      brandProductId: string;
      quantityPlanned: number;
      quantityUsed: number;
    };
    const compLines: CompLine[] = [];

    if (finished.recipeLines.length > 0) {
      for (const line of finished.recipeLines) {
        const planned = unitsFromRecipe(line.quantityPerUnit, outputUnits);
        const used = overrideMap.has(line.componentProductId)
          ? overrideMap.get(line.componentProductId)!
          : planned;
        if (used < 0) throw new StockError("จำนวนใช้วัตถุดิบต้องไม่ติดลบ");
        compLines.push({
          brandProductId: line.componentProductId,
          quantityPlanned: planned,
          quantityUsed: used,
        });
      }
    } else {
      for (const [brandProductId, quantityUsed] of overrideMap) {
        if (quantityUsed <= 0) continue;
        compLines.push({
          brandProductId,
          quantityPlanned: quantityUsed,
          quantityUsed,
        });
      }
    }

    for (const line of compLines) {
      if (line.quantityUsed <= 0) continue;
      const product = await tx.brandProduct.findFirst({
        where: {
          id: line.brandProductId,
          brandId: input.brandId,
          isActive: true,
        },
      });
      if (!product) throw new StockError("ไม่พบวัตถุดิบ", 404);

      if (input.useLots !== false && product.trackLots) {
        await deductFromLotsFefo(tx, {
          stockLocationId: warehouse.id,
          brandProductId: product.id,
          quantity: line.quantityUsed,
          allowNegative: allowNeg,
        });
      }

      const { beforeQty, afterQty } = await changeBalance(tx, {
        stockLocationId: warehouse.id,
        brandProductId: product.id,
        delta: -line.quantityUsed,
        allowNegative: allowNeg,
      });

      await tx.stockMovement.create({
        data: {
          brandId: input.brandId,
          brandProductId: product.id,
          type: StockMovementType.ISSUE,
          quantity: line.quantityUsed,
          beforeQty,
          afterQty,
          stockLocationId: warehouse.id,
          fromLocationId: warehouse.id,
          note:
            input.note?.trim() ||
            `ผลิต ${finished.name} ×${input.quantityProduced}`,
          referenceType: "KITCHEN_PRODUCTION",
          createdByAdminId: input.adminId ?? null,
          createdByStaffId: input.staffId ?? null,
        },
      });
    }

    let finishLot = input.lotNumber?.trim() || null;
    if (!finishLot && input.quantityProduced > 0) {
      finishLot = `PROD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString(36).toUpperCase()}`;
    }

    if (input.quantityProduced > 0) {
      const { beforeQty, afterQty } = await changeBalance(tx, {
        stockLocationId: warehouse.id,
        brandProductId: finished.id,
        delta: input.quantityProduced,
        allowNegative: true,
      });

      if (finished.trackLots && finishLot) {
        await addToLot(tx, {
          brandId: input.brandId,
          brandProductId: finished.id,
          stockLocationId: warehouse.id,
          lotNumber: finishLot,
          quantity: input.quantityProduced,
          unitCost:
            finished.costPrice != null ? Number(finished.costPrice) : null,
        });
      }

      await tx.stockMovement.create({
        data: {
          brandId: input.brandId,
          brandProductId: finished.id,
          type: StockMovementType.STOCK_IN,
          quantity: input.quantityProduced,
          beforeQty,
          afterQty,
          unitCost: finished.costPrice,
          totalCost: finished.costPrice
            ? finished.costPrice.mul(input.quantityProduced)
            : null,
          stockLocationId: warehouse.id,
          toLocationId: warehouse.id,
          note:
            input.note?.trim() ||
            `ผลผลิตครัว ${finished.name}${waste ? ` (เสีย ${waste})` : ""}`,
          referenceType: "KITCHEN_PRODUCTION",
          lotNumber: finishLot,
          createdByAdminId: input.adminId ?? null,
          createdByStaffId: input.staffId ?? null,
        },
      });
    }

    if (waste > 0) {
      await tx.stockMovement.create({
        data: {
          brandId: input.brandId,
          brandProductId: finished.id,
          type: StockMovementType.WASTE,
          quantity: waste,
          stockLocationId: warehouse.id,
          note:
            input.note?.trim() ||
            `ของเสียตอนผลิต ${finished.name}`,
          referenceType: "KITCHEN_PRODUCTION_WASTE",
          createdByAdminId: input.adminId ?? null,
          createdByStaffId: input.staffId ?? null,
        },
      });
    }

    const production = await tx.kitchenProduction.create({
      data: {
        brandId: input.brandId,
        stockLocationId: warehouse.id,
        finishedProductId: finished.id,
        quantityProduced: input.quantityProduced,
        quantityWasted: waste,
        status: KitchenProductionStatus.COMPLETED,
        note: input.note?.trim() || null,
        lotNumber: finishLot,
        createdByAdminId: input.adminId ?? null,
        components: {
          create: compLines.map((c) => ({
            brandProductId: c.brandProductId,
            quantityPlanned: c.quantityPlanned,
            quantityUsed: c.quantityUsed,
          })),
        },
      },
      include: {
        finishedProduct: {
          select: { id: true, name: true, unit: true },
        },
        components: {
          include: {
            product: { select: { id: true, name: true, unit: true } },
          },
        },
      },
    });

    return production;
  });
}

export async function listKitchenProductions(brandId: string, take = 40) {
  return prisma.kitchenProduction.findMany({
    where: { brandId, status: KitchenProductionStatus.COMPLETED },
    include: {
      finishedProduct: { select: { id: true, name: true, unit: true } },
      components: {
        include: {
          product: { select: { id: true, name: true, unit: true } },
        },
      },
      createdByAdmin: { select: { username: true } },
    },
    orderBy: { completedAt: "desc" },
    take,
  });
}

export async function getKitchenOverview(brandId: string) {
  const warehouse = await ensureWarehouseLocation(brandId);
  const [
    products,
    pendingTransfers,
    pendingRequests,
    recentProductions,
    openPOs,
  ] = await Promise.all([
    prisma.brandProduct.findMany({
      where: { brandId, isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        stockType: true,
        trackLots: true,
        costPrice: true,
        recipeLines: {
          select: {
            quantityPerUnit: true,
            component: { select: { id: true, name: true, unit: true } },
          },
        },
        balances: {
          where: { stockLocationId: warehouse.id },
          select: { quantity: true },
        },
      },
      orderBy: [{ stockType: "asc" }, { name: "asc" }],
    }),
    prisma.stockTransfer.count({
      where: { brandId, status: "PENDING" },
    }),
    prisma.branchStockRequest.count({
      where: { brandId, status: BranchStockRequestStatus.PENDING },
    }),
    listKitchenProductions(brandId, 10),
    prisma.purchaseOrder.count({
      where: {
        brandId,
        status: { in: ["DRAFT", "ORDERED", "PARTIAL"] },
      },
    }),
  ]);

  const mapped = products.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    stockType: p.stockType,
    trackLots: p.trackLots,
    costPrice: p.costPrice != null ? Number(p.costPrice) : null,
    warehouseQty: p.balances[0]?.quantity ?? 0,
    hasRecipe: p.recipeLines.length > 0,
    recipeLines: p.recipeLines.map((l) => ({
      quantityPerUnit: Number(l.quantityPerUnit),
      component: l.component,
    })),
  }));

  return {
    warehouse: { id: warehouse.id, name: warehouse.name },
    pendingTransfers,
    pendingRequests,
    openPurchaseOrders: openPOs,
    products: mapped,
    consumables: mapped.filter((p) => p.stockType === "CONSUMABLE"),
    finishedGoods: mapped.filter((p) => p.stockType === "SALE_ITEM"),
    recentProductions,
  };
}

export async function createBranchStockRequest(input: {
  brandId: string;
  branchId: string;
  brandProductId: string;
  quantityRequested: number;
  note?: string | null;
  staffId?: string | null;
}) {
  await assertBrandWriteAllowedByBrandId(input.brandId);
  if (input.quantityRequested <= 0) {
    throw new StockError("จำนวนที่ขอต้องมากกว่า 0");
  }
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, brandId: input.brandId },
  });
  if (!branch) throw new StockError("ไม่พบสาขา", 404);
  const product = await prisma.brandProduct.findFirst({
    where: {
      id: input.brandProductId,
      brandId: input.brandId,
      isActive: true,
    },
  });
  if (!product) throw new StockError("ไม่พบสินค้า", 404);

  return prisma.branchStockRequest.create({
    data: {
      brandId: input.brandId,
      branchId: input.branchId,
      brandProductId: input.brandProductId,
      quantityRequested: input.quantityRequested,
      note: input.note?.trim() || null,
      requestedByStaffId: input.staffId ?? null,
      status: BranchStockRequestStatus.PENDING,
    },
    include: {
      product: { select: { id: true, name: true, unit: true } },
      branch: { select: { id: true, name: true } },
    },
  });
}

export async function listBranchStockRequests(
  brandId: string,
  opts?: { status?: BranchStockRequestStatus; branchId?: string },
) {
  return prisma.branchStockRequest.findMany({
    where: {
      brandId,
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.branchId ? { branchId: opts.branchId } : {}),
    },
    include: {
      product: { select: { id: true, name: true, unit: true, stockType: true } },
      branch: { select: { id: true, name: true } },
      requestedByStaff: { select: { name: true, phone: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
}

/** Aggregate pending demand by product (Phase 3 plan) */
export async function getProductionDemandPlan(brandId: string) {
  const pending = await prisma.branchStockRequest.findMany({
    where: { brandId, status: BranchStockRequestStatus.PENDING },
    include: {
      product: { select: { id: true, name: true, unit: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  const byProduct = new Map<
    string,
    {
      brandProductId: string;
      name: string;
      unit: string;
      totalRequested: number;
      branches: { branchId: string; branchName: string; qty: number }[];
    }
  >();

  for (const row of pending) {
    const cur = byProduct.get(row.brandProductId) ?? {
      brandProductId: row.brandProductId,
      name: row.product.name,
      unit: row.product.unit,
      totalRequested: 0,
      branches: [],
    };
    cur.totalRequested += row.quantityRequested;
    cur.branches.push({
      branchId: row.branchId,
      branchName: row.branch.name,
      qty: row.quantityRequested,
    });
    byProduct.set(row.brandProductId, cur);
  }

  return [...byProduct.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "th"),
  );
}

export async function fulfillBranchStockRequest(input: {
  brandId: string;
  requestId: string;
  quantity?: number;
  note?: string | null;
  adminId?: string | null;
}) {
  await assertBrandWriteAllowedByBrandId(input.brandId);
  const req = await prisma.branchStockRequest.findFirst({
    where: {
      id: input.requestId,
      brandId: input.brandId,
      status: BranchStockRequestStatus.PENDING,
    },
  });
  if (!req) throw new StockError("ไม่พบคำขอ หรือดำเนินการแล้ว", 404);

  const qty = input.quantity ?? req.quantityRequested;
  if (qty <= 0) throw new StockError("จำนวนส่งต้องมากกว่า 0");
  if (qty > req.quantityRequested) {
    throw new StockError("ส่งเกินจำนวนที่ขอ");
  }

  const transfer = await transferWarehouseToBranch({
    brandId: input.brandId,
    branchId: req.branchId,
    brandProductId: req.brandProductId,
    quantity: qty,
    note:
      input.note?.trim() ||
      req.note ||
      `จัดส่งตามคำขอสาขา`,
    adminId: input.adminId,
  });

  return prisma.branchStockRequest.update({
    where: { id: req.id },
    data: {
      status: BranchStockRequestStatus.FULFILLED,
      quantityFulfilled: qty,
      transferId: transfer.id,
      fulfilledAt: new Date(),
      fulfilledByAdminId: input.adminId ?? null,
      adminNote: input.note?.trim() || null,
    },
    include: {
      product: { select: { id: true, name: true, unit: true } },
      branch: { select: { id: true, name: true } },
    },
  });
}

export async function rejectBranchStockRequest(input: {
  brandId: string;
  requestId: string;
  note?: string | null;
  adminId?: string | null;
}) {
  await assertBrandWriteAllowedByBrandId(input.brandId);
  const req = await prisma.branchStockRequest.findFirst({
    where: {
      id: input.requestId,
      brandId: input.brandId,
      status: BranchStockRequestStatus.PENDING,
    },
  });
  if (!req) throw new StockError("ไม่พบคำขอ หรือดำเนินการแล้ว", 404);

  return prisma.branchStockRequest.update({
    where: { id: req.id },
    data: {
      status: BranchStockRequestStatus.REJECTED,
      fulfilledAt: new Date(),
      fulfilledByAdminId: input.adminId ?? null,
      adminNote: input.note?.trim() || null,
    },
  });
}

/** Estimated unit cost of finished good from component cost × recipe (Phase 4) */
export async function estimateFinishedUnitCost(
  brandId: string,
  finishedProductId: string,
) {
  const finished = await prisma.brandProduct.findFirst({
    where: { id: finishedProductId, brandId },
    include: {
      recipeLines: {
        include: { component: { select: { costPrice: true, name: true } } },
      },
    },
  });
  if (!finished) throw new StockError("ไม่พบสินค้า", 404);
  if (!finished.recipeLines.length) {
    return {
      unitCost: finished.costPrice != null ? Number(finished.costPrice) : null,
      source: "product" as const,
      breakdown: [] as { name: string; qty: number; cost: number }[],
    };
  }

  let total = 0;
  const breakdown: { name: string; qty: number; cost: number }[] = [];
  for (const line of finished.recipeLines) {
    const qty = Number(line.quantityPerUnit);
    const unit = Number(line.component.costPrice ?? 0);
    const cost = qty * unit;
    total += cost;
    breakdown.push({ name: line.component.name, qty, cost });
  }
  return {
    unitCost: Math.round(total * 100) / 100,
    source: "recipe" as const,
    breakdown,
  };
}
