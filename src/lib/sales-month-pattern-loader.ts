import { OrderStatus, SkewerOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { queueBusinessDateFromKey } from "@/lib/constants";
import { isOrderCountableRevenue } from "@/lib/order-totals";
import {
  loadBranchMenuItemIdsForInventory,
  loadBranchSalesDailyMaps,
} from "@/lib/inventory/inventory-sales-metrics";
import { dateKeyRange } from "@/lib/inventory/inventory-date";
import type { BranchOperatingMode } from "@prisma/client";

/** โหลด revenue ต่อเมนูต่อวัน (order POS เท่านั้น — skewer ไม่มี unit price ในระบบเดิม) */
export async function loadBranchProductRevenueDailyMap(input: {
  branchId: string;
  from: string;
  to: string;
  menuItemIds: string[];
}): Promise<Map<string, Map<string, number>>> {
  const revenueByMenuDate = new Map<string, Map<string, number>>();
  if (input.menuItemIds.length === 0) return revenueByMenuDate;

  const dayStart = queueBusinessDateFromKey(input.from);
  const dayEnd = queueBusinessDateFromKey(input.to);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      branchMenuItemId: { in: input.menuItemIds },
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
      unitPrice: true,
      optionsPrice: true,
      order: {
        select: {
          status: true,
          awaitingPhotoKey: true,
          queueBusinessDate: true,
        },
      },
    },
  });

  for (const line of orderItems) {
    if (!line.branchMenuItemId) continue;
    if (!isOrderCountableRevenue(line.order)) continue;
    const sold = Math.max(0, line.quantity - (line.giftQuantity ?? 0));
    if (sold <= 0) continue;
    const unit = Number(line.unitPrice) + Number(line.optionsPrice);
    const revenue = sold * unit;
    const dateKey = line.order.queueBusinessDate.toISOString().slice(0, 10);
    if (!revenueByMenuDate.has(line.branchMenuItemId)) {
      revenueByMenuDate.set(line.branchMenuItemId, new Map());
    }
    const inner = revenueByMenuDate.get(line.branchMenuItemId)!;
    inner.set(dateKey, (inner.get(dateKey) ?? 0) + revenue);
  }

  return revenueByMenuDate;
}

export async function loadBranchProductDailySalesForMonthPattern(input: {
  branchId: string;
  from: string;
  to: string;
  operatingMode: BranchOperatingMode;
}) {
  const menuItems = await loadBranchMenuItemIdsForInventory(input.branchId);
  const menuItemIds = menuItems.map((m) => m.id);

  const [dailyMaps, revenueByMenuDate] = await Promise.all([
    loadBranchSalesDailyMaps({
      branchId: input.branchId,
      from: input.from,
      to: input.to,
      menuItemIds,
      operatingMode: input.operatingMode,
    }),
    loadBranchProductRevenueDailyMap({
      branchId: input.branchId,
      from: input.from,
      to: input.to,
      menuItemIds,
    }),
  ]);

  return {
    menuItems: menuItems.map((m) => ({ id: m.id, name: m.name })),
    dailyMaps,
    revenueByMenuDate,
    dates: dateKeyRange(input.from, input.to),
  };
}
