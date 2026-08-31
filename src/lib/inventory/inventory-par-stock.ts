import {
  BranchMenuItemParStockSource,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { bangkokDateKey, queueBusinessDateFromKey } from "@/lib/constants";
import { avgDailyForPar, computeSuggestedRefill } from "@/lib/inventory/inventory-calculations";
import { BRANCH_WASTE_HISTORY_TYPES } from "@/lib/stock-outbound";
import { INVENTORY_DEFAULTS } from "@/lib/inventory/inventory-config";
import {
  buildParStockBranchSummary,
  buildParStockRecommendations,
  resolveParSalesGrades,
  type ParStockBranchSummary,
} from "@/lib/inventory/inventory-par-recommendation";
import type { SkewerParPolicy } from "@/lib/inventory/inventory-par-policy";
import { DEFAULT_SKEWER_PAR_POLICY, isParEligibleGrade } from "@/lib/inventory/inventory-par-policy";
import { STOCK_RECOMMEND_GRADE_LABELS, type StockRecommendGrade } from "@/lib/stock-recommendation-shared";
import { addBangkokDays } from "@/lib/inventory/inventory-date";
import {
  loadBranchSalesMetricsMap,
  type MenuItemSalesMetrics,
} from "@/lib/inventory/inventory-sales-metrics";
import { resolveMenuItemProductCode, isManualMenuItemCode } from "@/lib/inventory/inventory-menu-code";
import { resolveMenuAvailableStock } from "@/lib/inventory/inventory-stock-quantity";

export type ParStockRow = {
  menuItemId: string;
  productCode: string;
  hasManualItemCode: boolean;
  name: string;
  category: string | null;
  imageUrl: string | null;
  currentParStock: number;
  recommendedParStock: number;
  parDiff: number;
  availableStock: number;
  stockTracked: boolean;
  source: BranchMenuItemParStockSource;
  coverageDays: number;
  safetyPct: number;
  avgDailySales: number;
  minDailySales: number;
  maxDailySales: number;
  salesGrade: StockRecommendGrade;
  salesGradeLabel: string;
  parEligible: boolean;
  totalSold: number;
  wasteQty: number;
  suggestedRefill: number;
  dataQuality: MenuItemSalesMetrics["dataQuality"];
  dataSource: MenuItemSalesMetrics["dataSource"];
  analysisFrom: string;
  analysisTo: string;
  updatedAt: string | null;
  parUpdatedAt: string | null;
};

async function writeParHistory(
  tx: Prisma.TransactionClient,
  input: {
    branchId: string;
    menuItemId: string;
    oldParStock: number;
    newParStock: number;
    source: BranchMenuItemParStockSource;
    reason?: string;
    metadata?: Record<string, unknown>;
    adminId?: string | null;
  },
) {
  await tx.branchMenuItemParStockHistory.create({
    data: {
      branchId: input.branchId,
      menuItemId: input.menuItemId,
      oldParStock: input.oldParStock,
      newParStock: input.newParStock,
      source: input.source,
      reason: input.reason ?? null,
      metadata:
        input.metadata == null
          ? undefined
          : (input.metadata as Prisma.InputJsonValue),
      updatedByAdminId: input.adminId ?? null,
    },
  });
}

/** Upsert analysis snapshot fields only — does NOT change parStock. */
export async function upsertParStockAnalysis(input: {
  branchId: string;
  menuItemId: string;
  metrics: MenuItemSalesMetrics;
  analysisFrom: string;
  analysisTo: string;
  coverageDays?: number;
  safetyPct?: number;
  recommendedParStock?: number;
}) {
  const coverageDays = input.coverageDays ?? INVENTORY_DEFAULTS.coverageDays;
  const safetyPct = input.safetyPct ?? INVENTORY_DEFAULTS.safetyPct;
  const avgForPar = avgDailyForPar(input.metrics);
  const recommended =
    input.recommendedParStock ??
    (avgForPar > 0 ? Math.max(1, Math.ceil(avgForPar)) : 0);

  await prisma.branchMenuItemParStock.upsert({
    where: { menuItemId: input.menuItemId },
    create: {
      branchId: input.branchId,
      menuItemId: input.menuItemId,
      parStock: 0,
      source: BranchMenuItemParStockSource.MANUAL,
      coverageDays,
      safetyPct,
      avgDailySales: avgForPar,
      recommendedValue: recommended,
      analysisFrom: queueBusinessDateFromKey(input.analysisFrom),
      analysisTo: queueBusinessDateFromKey(input.analysisTo),
    },
    update: {
      coverageDays,
      safetyPct,
      avgDailySales: avgForPar,
      recommendedValue: recommended,
      analysisFrom: queueBusinessDateFromKey(input.analysisFrom),
      analysisTo: queueBusinessDateFromKey(input.analysisTo),
    },
  });

  return recommended;
}

export async function analyzeBranchParStock(input: {
  branchId: string;
  from?: string;
  to?: string;
  coverageDays?: number;
  safetyPct?: number;
  skewerPolicy?: SkewerParPolicy;
}) {
  const coverageDays = input.coverageDays ?? INVENTORY_DEFAULTS.coverageDays;
  const safetyPct = input.safetyPct ?? INVENTORY_DEFAULTS.safetyPct;
  const analysisTo = input.to ?? bangkokDateKey();
  const analysisFrom =
    input.from ??
    addBangkokDays(analysisTo, -(INVENTORY_DEFAULTS.analysisWindowDays - 1));

  const { metricsByMenuId, menuItems } = await loadBranchSalesMetricsMap(
    input.branchId,
    { from: analysisFrom, to: analysisTo },
  );

  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    select: { operatingMode: true },
  });
  if (!branch) throw new Error("NOT_FOUND");

  const recommendationInputs = menuItems.map((menu) => {
    const metrics = metricsByMenuId.get(menu.id)!;
    return {
      menuItemId: menu.id,
      metrics,
      totalSold: metrics.orderSoldTotal + metrics.skewerSoldTotal,
    };
  });
  const recommendedByMenuId = buildParStockRecommendations({
    operatingMode: branch.operatingMode,
    items: recommendationInputs,
    coverageDays,
    safetyPct,
    skewerPolicy: input.skewerPolicy,
  });

  let updated = 0;
  for (const menu of menuItems) {
    const metrics = metricsByMenuId.get(menu.id)!;
    await upsertParStockAnalysis({
      branchId: input.branchId,
      menuItemId: menu.id,
      metrics,
      analysisFrom,
      analysisTo,
      coverageDays,
      safetyPct,
      recommendedParStock: recommendedByMenuId.get(menu.id) ?? 0,
    });
    updated += 1;
  }

  return { updated, analysisFrom, analysisTo, coverageDays, safetyPct };
}

export async function setManualParStock(input: {
  branchId: string;
  menuItemId: string;
  parStock: number;
  adminId?: string | null;
}) {
  const { updated } = await setManualParStockMany({
    branchId: input.branchId,
    items: [{ menuItemId: input.menuItemId, parStock: input.parStock }],
    adminId: input.adminId,
  });
  return { updated };
}

export async function setManualParStockMany(input: {
  branchId: string;
  items: Array<{ menuItemId: string; parStock: number }>;
  adminId?: string | null;
}) {
  const byId = new Map<string, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.parStock) || item.parStock < 0) {
      throw new Error("INVALID_PAR");
    }
    byId.set(item.menuItemId, item.parStock);
  }
  const ids = [...byId.keys()];
  if (ids.length === 0) return { updated: 0 };

  const menuItems = await prisma.branchMenuItem.findMany({
    where: { id: { in: ids }, branchId: input.branchId },
    select: { id: true, stock: { select: { quantity: true } } },
  });
  if (menuItems.length !== ids.length) throw new Error("MENU_NOT_FOUND");

  const stockBefore = new Map(
    menuItems.map((row) => [row.id, row.stock?.quantity ?? 0]),
  );

  let updated = 0;
  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.branchMenuItemParStock.findMany({
        where: { menuItemId: { in: ids } },
        select: { menuItemId: true, parStock: true },
      });
      const oldById = new Map(
        existing.map((row) => [row.menuItemId, row.parStock]),
      );

      const historyRows: Array<{
        branchId: string;
        menuItemId: string;
        oldParStock: number;
        newParStock: number;
        source: BranchMenuItemParStockSource;
        reason: string;
        updatedByAdminId: string | null;
      }> = [];

      for (const menuItemId of ids) {
        const parStock = byId.get(menuItemId)!;
        const oldPar = oldById.get(menuItemId) ?? 0;
        if (oldPar === parStock) continue;

        await tx.branchMenuItemParStock.upsert({
          where: { menuItemId },
          create: {
            branchId: input.branchId,
            menuItemId,
            parStock,
            source: BranchMenuItemParStockSource.MANUAL,
            updatedByAdminId: input.adminId ?? null,
          },
          update: {
            parStock,
            source: BranchMenuItemParStockSource.MANUAL,
            updatedByAdminId: input.adminId ?? null,
          },
        });

        historyRows.push({
          branchId: input.branchId,
          menuItemId,
          oldParStock: oldPar,
          newParStock: parStock,
          source: BranchMenuItemParStockSource.MANUAL,
          reason: "ตั้ง Par Stock ด้วยตนเอง",
          updatedByAdminId: input.adminId ?? null,
        });
        updated += 1;
      }

      if (historyRows.length > 0) {
        await tx.branchMenuItemParStockHistory.createMany({ data: historyRows });
      }

      const stockAfter = await tx.branchMenuItemStock.findMany({
        where: { menuItemId: { in: ids } },
        select: { menuItemId: true, quantity: true },
      });
      for (const row of stockAfter) {
        if ((stockBefore.get(row.menuItemId) ?? 0) !== row.quantity) {
          throw new Error("STOCK_MUTATION_FORBIDDEN");
        }
      }
    },
    { maxWait: 20_000, timeout: 120_000 },
  );

  return { updated };
}

export async function applyRecommendedParStock(input: {
  branchId: string;
  menuItemIds: string[];
  adminId?: string | null;
  range?: { from: string; to: string };
  skewerPolicy?: SkewerParPolicy;
  zeroIneligible?: boolean;
}) {
  const uniqueIds = [...new Set(input.menuItemIds)];
  if (uniqueIds.length === 0 && !input.zeroIneligible) {
    throw new Error("EMPTY_SELECTION");
  }

  const policy = input.skewerPolicy ?? DEFAULT_SKEWER_PAR_POLICY;
  const analysisTo = input.range?.to ?? bangkokDateKey();
  const analysisFrom =
    input.range?.from ??
    addBangkokDays(analysisTo, -(INVENTORY_DEFAULTS.analysisWindowDays - 1));

  await analyzeBranchParStock({
    branchId: input.branchId,
    from: analysisFrom,
    to: analysisTo,
    skewerPolicy: policy,
  });

  const loaded = await loadBranchParStockRows(
    input.branchId,
    { from: analysisFrom, to: analysisTo },
    { skewerPolicy: policy },
  );
  const byId = new Map(loaded.items.map((row) => [row.menuItemId, row]));

  const ids = new Set(uniqueIds);
  if (input.zeroIneligible) {
    for (const row of loaded.items) {
      if (!row.parEligible && row.currentParStock > 0) {
        ids.add(row.menuItemId);
      }
    }
  }

  const toApply = [...ids]
    .map((id) => byId.get(id))
    .filter((row): row is ParStockRow => row != null)
    .filter((row) => row.recommendedParStock !== row.currentParStock);

  if (toApply.length === 0) {
    return { applied: 0 };
  }

  await prisma.$transaction(
    async (tx) => {
      const historyRows: Array<{
        branchId: string;
        menuItemId: string;
        oldParStock: number;
        newParStock: number;
        source: BranchMenuItemParStockSource;
        reason: string;
        metadata: Prisma.InputJsonValue;
        updatedByAdminId: string | null;
      }> = [];

      for (const row of toApply) {
        const oldPar = row.currentParStock;
        const newPar = row.recommendedParStock;
        const reason = row.parEligible
          ? "ใช้ค่า Par ที่แนะนำ"
          : "เคลียร์ Par กลุ่มที่ไม่ได้ตั้ง (ขายช้า/ไม่ขาย)";

        await tx.branchMenuItemParStock.upsert({
          where: { menuItemId: row.menuItemId },
          create: {
            branchId: input.branchId,
            menuItemId: row.menuItemId,
            parStock: newPar,
            source: BranchMenuItemParStockSource.RECOMMENDED,
            recommendedValue: newPar,
            updatedByAdminId: input.adminId ?? null,
          },
          update: {
            parStock: newPar,
            source: BranchMenuItemParStockSource.RECOMMENDED,
            recommendedValue: newPar,
            updatedByAdminId: input.adminId ?? null,
          },
        });

        historyRows.push({
          branchId: input.branchId,
          menuItemId: row.menuItemId,
          oldParStock: oldPar,
          newParStock: newPar,
          source: BranchMenuItemParStockSource.RECOMMENDED,
          reason,
          metadata: {
            recommendedValue: newPar,
            salesGrade: row.salesGrade,
            parEligible: row.parEligible,
            avgDailySales: row.avgDailySales,
          },
          updatedByAdminId: input.adminId ?? null,
        });
      }

      await tx.branchMenuItemParStockHistory.createMany({ data: historyRows });
    },
    { maxWait: 20_000, timeout: 120_000 },
  );

  return { applied: toApply.length };
}

async function loadWasteQtyByMenuId(input: {
  branchId: string;
  from: string;
  to: string;
  menuItemIds: string[];
}): Promise<Map<string, number>> {
  const qtyByMenuId = new Map<string, number>();
  if (input.menuItemIds.length === 0) return qtyByMenuId;

  const rows = await prisma.branchMenuItemStockHistory.findMany({
    where: {
      branchId: input.branchId,
      menuItemId: { in: input.menuItemIds },
      type: { in: [...BRANCH_WASTE_HISTORY_TYPES, "WASTE"] },
      cancelledAt: null,
      createdAt: {
        gte: new Date(`${input.from}T00:00:00+07:00`),
        lte: new Date(`${input.to}T23:59:59.999+07:00`),
      },
    },
    select: { menuItemId: true, quantity: true },
  });

  for (const row of rows) {
    qtyByMenuId.set(
      row.menuItemId,
      (qtyByMenuId.get(row.menuItemId) ?? 0) + Math.abs(row.quantity),
    );
  }
  return qtyByMenuId;
}

export async function loadBranchParStockRows(
  branchId: string,
  range?: { from: string; to: string },
  options?: { skewerPolicy?: SkewerParPolicy },
): Promise<{
  items: ParStockRow[];
  analysisFrom: string;
  analysisTo: string;
  coverageDays: number;
  safetyPct: number;
  summary: ParStockBranchSummary;
  branchName: string;
  lastParUpdatedAt: string | null;
}> {
  const analysisTo = range?.to ?? bangkokDateKey();
  const analysisFrom =
    range?.from ??
    addBangkokDays(analysisTo, -(INVENTORY_DEFAULTS.analysisWindowDays - 1));

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { operatingMode: true, name: true },
  });
  if (!branch) throw new Error("NOT_FOUND");

  const { metricsByMenuId, menuItems } = await loadBranchSalesMetricsMap(
    branchId,
    { from: analysisFrom, to: analysisTo },
  );

  const skewerPolicy = options?.skewerPolicy ?? DEFAULT_SKEWER_PAR_POLICY;

  const recommendationInputs = menuItems.map((menu) => {
    const metrics = metricsByMenuId.get(menu.id)!;
    return {
      menuItemId: menu.id,
      metrics,
      totalSold: metrics.orderSoldTotal + metrics.skewerSoldTotal,
    };
  });
  const salesGrades = resolveParSalesGrades(recommendationInputs);
  const recommendedByMenuId = buildParStockRecommendations({
    operatingMode: branch.operatingMode,
    items: recommendationInputs,
    skewerPolicy,
  });

  const parRecords = await prisma.branchMenuItemParStock.findMany({
    where: { branchId },
  });
  const parByMenuId = new Map(parRecords.map((p) => [p.menuItemId, p]));
  const lastParHistory = await prisma.branchMenuItemParStockHistory.groupBy({
    by: ["menuItemId"],
    where: { branchId },
    _max: { createdAt: true },
  });
  const parUpdatedAtByMenuId = new Map<string, Date>();
  let lastParUpdatedAt: Date | null = null;
  for (const row of lastParHistory) {
    const at = row._max.createdAt;
    if (!at) continue;
    parUpdatedAtByMenuId.set(row.menuItemId, at);
    if (!lastParUpdatedAt || at > lastParUpdatedAt) lastParUpdatedAt = at;
  }
  const wasteByMenuId = await loadWasteQtyByMenuId({
    branchId,
    from: analysisFrom,
    to: analysisTo,
    menuItemIds: menuItems.map((m) => m.id),
  });

  let totalAvgDailySales = 0;
  let sumCurrentPar = 0;
  let sumRecommendedPar = 0;
  let sumAvailableStock = 0;
  let eligibleRecommendedPar = 0;
  let eligibleCurrentPar = 0;
  let ineligibleCurrentPar = 0;
  let gradeA = 0;
  let gradeB = 0;
  let gradeC = 0;

  const items: ParStockRow[] = menuItems.map((menu) => {
    const metrics = metricsByMenuId.get(menu.id)!;
    const par = parByMenuId.get(menu.id);
    const coverageDays = par?.coverageDays ?? INVENTORY_DEFAULTS.coverageDays;
    const safetyPct = par?.safetyPct ?? INVENTORY_DEFAULTS.safetyPct;
    const avgDaily = avgDailyForPar(metrics);
    const salesGrade = salesGrades.get(menu.id) ?? "SKIP";
    const parEligible = isParEligibleGrade(salesGrade, skewerPolicy);
    const recommendedParStock = recommendedByMenuId.get(menu.id) ?? 0;
    const currentParStock = par?.parStock ?? 0;
    const { availableStock, stockTracked } = resolveMenuAvailableStock(menu.stock);

    const totalSold = metrics.orderSoldTotal + metrics.skewerSoldTotal;
    const wasteQty = wasteByMenuId.get(menu.id) ?? 0;
    const suggestedRefill = computeSuggestedRefill(
      currentParStock > 0 ? currentParStock : recommendedParStock,
      availableStock,
    );
    totalAvgDailySales += avgDaily;
    sumCurrentPar += currentParStock;
    sumRecommendedPar += recommendedParStock;
    sumAvailableStock += availableStock;
    if (parEligible) {
      eligibleRecommendedPar += recommendedParStock;
      eligibleCurrentPar += currentParStock;
    } else {
      ineligibleCurrentPar += currentParStock;
    }
    if (salesGrade === "A") gradeA += 1;
    if (salesGrade === "B") gradeB += 1;
    if (salesGrade === "C") gradeC += 1;

    return {
      menuItemId: menu.id,
      productCode: resolveMenuItemProductCode({
        id: menu.id,
        itemCode: menu.itemCode,
        brandProduct: menu.brandProduct,
      }),
      hasManualItemCode: isManualMenuItemCode({ itemCode: menu.itemCode }),
      name: menu.name,
      category: menu.category?.name ?? null,
      imageUrl: menu.imageUrl,
      currentParStock,
      recommendedParStock,
      parDiff: recommendedParStock - currentParStock,
      availableStock,
      stockTracked,
      source: par?.source ?? BranchMenuItemParStockSource.MANUAL,
      coverageDays,
      safetyPct,
      avgDailySales: avgDaily,
      minDailySales: metrics.minDailySales,
      maxDailySales: metrics.maxDailySales,
      totalSold,
      wasteQty,
      suggestedRefill,
      salesGrade,
      salesGradeLabel: STOCK_RECOMMEND_GRADE_LABELS[salesGrade],
      parEligible,
      dataQuality: metrics.dataQuality,
      dataSource: metrics.dataSource,
      analysisFrom,
      analysisTo,
      updatedAt: par?.updatedAt?.toISOString() ?? null,
      parUpdatedAt: parUpdatedAtByMenuId.get(menu.id)?.toISOString() ?? null,
    };
  });

  return {
    items,
    analysisFrom,
    analysisTo,
    coverageDays: INVENTORY_DEFAULTS.coverageDays,
    safetyPct: INVENTORY_DEFAULTS.safetyPct,
    branchName: branch.name,
    lastParUpdatedAt: lastParUpdatedAt?.toISOString() ?? null,
    summary: buildParStockBranchSummary({
      operatingMode: branch.operatingMode,
      totalAvgDailySales,
      sumCurrentPar,
      sumRecommendedPar,
      sumAvailableStock,
      skewerPolicy,
      gradeCounts: { A: gradeA, B: gradeB, C: gradeC },
      eligibleRecommendedPar,
      eligibleCurrentPar,
      ineligibleCurrentPar,
    }),
  };
}
