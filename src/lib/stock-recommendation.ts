import { BranchOperatingMode, OrderStatus, SkewerOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { queueBusinessDateFromKey } from "@/lib/constants";
import {
  STOCK_RECOMMEND_DEFAULTS,
  buildStockRecommendationRows,
  type StockRecommendationResult,
  type StockRecommendationSummary,
} from "@/lib/stock-recommendation-shared";
import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";

export * from "@/lib/stock-recommendation-shared";

function addDaysYmd(dateYmd: string, delta: number): string {
  const start = new Date(`${dateYmd}T12:00:00+07:00`);
  start.setTime(start.getTime() + delta * 24 * 60 * 60 * 1000);
  return start.toISOString().slice(0, 10);
}

function countInclusiveDays(from: string, to: string): number {
  let days = 0;
  let cur = from;
  while (cur <= to) {
    days += 1;
    if (cur === to) break;
    cur = addDaysYmd(cur, 1);
  }
  return Math.max(days, 1);
}

export async function loadBranchStockRecommendations(input: {
  branchId: string;
  from: string;
  to: string;
  coverDays?: number;
  safetyFactor?: number;
  minSoldForB?: number;
  paretoShare?: number;
}): Promise<StockRecommendationResult> {
  const coverDays = input.coverDays ?? STOCK_RECOMMEND_DEFAULTS.coverDays;
  const safetyFactor =
    input.safetyFactor ?? STOCK_RECOMMEND_DEFAULTS.safetyFactor;
  const minSoldForB =
    input.minSoldForB ?? STOCK_RECOMMEND_DEFAULTS.minSoldForB;
  const paretoShare =
    input.paretoShare ?? STOCK_RECOMMEND_DEFAULTS.paretoShare;

  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    select: { id: true, operatingMode: true },
  });
  if (!branch) throw new Error("NOT_FOUND");

  const dayStart = queueBusinessDateFromKey(input.from);
  const dayEnd = queueBusinessDateFromKey(input.to);
  const includesSkewerSales =
    branch.operatingMode === BranchOperatingMode.SKEWER;

  const menuItems = await prisma.branchMenuItem.findMany({
    where: { branchId: input.branchId, isHidden: false },
    include: {
      category: true,
      stock: true,
      brandProduct: { select: { sku: true, barcode: true } },
      optionGroupLinks: {
        include: { group: { select: { mode: true } } },
      },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  const trackedMenu = menuItems.filter(
    (item) =>
      !item.optionGroupLinks.some((l) => l.group.mode === "FROM_MENU") &&
      !item.category?.stockExempt,
  );
  const menuIds = trackedMenu.map((item) => item.id);

  const orderSoldByMenu = new Map<string, number>();
  const activeDates = new Set<string>();

  if (menuIds.length > 0) {
    const orderItems = await prisma.orderItem.findMany({
      where: {
        branchMenuItemId: { in: menuIds },
        order: {
          branchId: input.branchId,
          status: OrderStatus.COMPLETED,
          queueBusinessDate: { gte: dayStart, lte: dayEnd },
        },
      },
      select: {
        branchMenuItemId: true,
        quantity: true,
        giftQuantity: true,
        order: { select: { queueBusinessDate: true } },
      },
    });

    for (const line of orderItems) {
      if (!line.branchMenuItemId) continue;
      const sold = Math.max(0, line.quantity - (line.giftQuantity ?? 0));
      if (sold <= 0) continue;
      orderSoldByMenu.set(
        line.branchMenuItemId,
        (orderSoldByMenu.get(line.branchMenuItemId) ?? 0) + sold,
      );
      activeDates.add(line.order.queueBusinessDate.toISOString().slice(0, 10));
    }
  }

  const skewerSoldByMenu = new Map<string, number>();
  if (includesSkewerSales && menuIds.length > 0) {
    const skewerItems = await prisma.skewerOrderItem.findMany({
      where: {
        branchMenuItemId: { in: menuIds },
        skewerOrder: {
          branchId: input.branchId,
          status: {
            in: [SkewerOrderStatus.CONFIRMED, SkewerOrderStatus.DELIVERED],
          },
          requestedDate: { gte: dayStart, lte: dayEnd },
        },
      },
      select: {
        branchMenuItemId: true,
        confirmedQuantity: true,
        requestedQuantity: true,
        skewerOrder: { select: { requestedDate: true } },
      },
    });

    for (const line of skewerItems) {
      if (!line.branchMenuItemId) continue;
      const sold = Math.max(0, line.confirmedQuantity ?? line.requestedQuantity);
      if (sold <= 0) continue;
      skewerSoldByMenu.set(
        line.branchMenuItemId,
        (skewerSoldByMenu.get(line.branchMenuItemId) ?? 0) + sold,
      );
      activeDates.add(line.skewerOrder.requestedDate.toISOString().slice(0, 10));
    }
  }

  const rangeDays = countInclusiveDays(input.from, input.to);
  const activeDays = Math.max(activeDates.size, 1);

  const items = buildStockRecommendationRows({
    menuItems: trackedMenu.map((item) => ({
      id: item.id,
      name: item.name,
      productCode: resolveMenuItemProductCode({
        id: item.id,
        itemCode: item.itemCode,
        brandProduct: item.brandProduct,
      }),
      category: item.category?.name ?? null,
      imageUrl: item.imageUrl,
      defaultShelfLifeDays: item.defaultShelfLifeDays,
      currentStock: item.stock?.quantity ?? 0,
      orderSold: orderSoldByMenu.get(item.id) ?? 0,
      skewerSold: skewerSoldByMenu.get(item.id) ?? 0,
    })),
    activeDays,
    coverDays,
    safetyFactor,
    minSoldForB,
    paretoShare,
  });

  const summary: StockRecommendationSummary = {
    from: input.from,
    to: input.to,
    rangeDays,
    activeDays,
    coverDays,
    safetyFactor,
    totalSoldUnits: items.reduce((sum, row) => sum + row.totalSold, 0),
    menuCount: items.length,
    gradeA: items.filter((row) => row.grade === "A").length,
    gradeB: items.filter((row) => row.grade === "B").length,
    gradeC: items.filter((row) => row.grade === "C").length,
    gradeSkip: items.filter((row) => row.grade === "SKIP").length,
    includesSkewerSales,
  };

  return { summary, items };
}

export async function applyBranchInitialStockIn(input: {
  branchId: string;
  lines: Array<{ menuItemId: string; quantity: number }>;
  note?: string | null;
  batchId: string;
}) {
  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    select: { id: true, name: true },
  });
  if (!branch) throw new Error("NOT_FOUND");

  const menuIds = [...new Set(input.lines.map((line) => line.menuItemId))];
  const menuItems = await prisma.branchMenuItem.findMany({
    where: { id: { in: menuIds }, branchId: input.branchId },
    include: { stock: true },
  });
  const menuById = new Map(menuItems.map((item) => [item.id, item]));

  for (const line of input.lines) {
    if (!menuById.has(line.menuItemId)) {
      throw new Error(`MENU_NOT_FOUND:${line.menuItemId}`);
    }
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("INVALID_QTY");
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const line of input.lines) {
      const menuItem = menuById.get(line.menuItemId)!;
      const oldQty = menuItem.stock?.quantity ?? 0;
      const newQty = oldQty + line.quantity;
      await tx.branchMenuItemStock.upsert({
        where: { menuItemId: line.menuItemId },
        update: { quantity: newQty },
        create: {
          branchId: input.branchId,
          menuItemId: line.menuItemId,
          quantity: newQty,
        },
      });
      await tx.branchMenuItem.update({
        where: { id: line.menuItemId },
        data: { isOutOfStock: newQty <= 0 },
      });
      await tx.branchMenuItemStockHistory.create({
        data: {
          branchId: input.branchId,
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          type: "STOCK_IN",
          note: input.note?.trim() || "เติมสต๊อก (แนะนำระบบ)",
          batchId: input.batchId,
          createdByStaffId: null,
        },
      });
    }
  });

  return { applied: input.lines.length };
}
