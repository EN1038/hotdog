import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  computeLineGiftQuantity,
  optionGroupDetailInclude,
  resolveOrderItemOptionsFromPrisma,
} from "@/lib/menu-option-groups";
import {
  fulfillmentToChannel,
  isChannelSellEnabled,
  resolveSellPrice,
} from "@/lib/menu-pricing";
import { orderGrandTotal } from "@/lib/order-totals";
import { isMenuItemSoldOut } from "@/lib/staff-key-order";
import {
  deductBranchMenuStockForOrder,
  deductBranchNonMenuStockForOrder,
  deductStockForOrder,
  restoreStockForOrder,
  StockError,
} from "@/lib/stock";

export type RewriteOrderItemInput = {
  branchMenuItemId: string;
  quantity: number;
  optionIds: string[];
  note?: string | null;
};

export class OrderItemRewriteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "OrderItemRewriteError";
    this.status = status;
  }
}

export { reconstructOptionIdsFromText } from "@/lib/order-item-options-text";

type Tx = Prisma.TransactionClient;

/** Statuses that normally have stock deducted after accept/key. */
export function shouldHaveStockDeducted(status: OrderStatus): boolean {
  return (
    status !== OrderStatus.WAITING_FOR_STORE_ACCEPTANCE &&
    status !== OrderStatus.CANCELLED
  );
}

async function purgeOrderStockHistory(orderId: string, tx: Tx) {
  await tx.stockMovement.deleteMany({ where: { orderId } });
  await tx.branchMenuItemStockHistory.deleteMany({
    where: { note: { contains: orderId } },
  });
  await tx.branchNonMenuItemHistory.deleteMany({
    where: { note: { contains: orderId } },
  });
}

/**
 * Replace order menu lines and keep stock consistent:
 * restore → purge sale/issue history → rewrite items → re-deduct when needed.
 * Does not change consumables, fees, status, or fulfillment.
 */
export async function rewriteOrderItemsWithStock(input: {
  orderId: string;
  branchId: string;
  items: RewriteOrderItemInput[];
  staffId?: string | null;
}): Promise<{
  order: Prisma.OrderGetPayload<{
    include: {
      items: true;
      branch: { select: { id: true; name: true } };
    };
  }>;
  totalAmount: number;
  stockRestored: boolean;
  stockDeducted: boolean;
}> {
  if (input.items.length < 1) {
    throw new OrderItemRewriteError("ต้องมีรายการอย่างน้อย 1 รายการ");
  }

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, branchId: input.branchId },
    include: {
      items: true,
      consumableLines: true,
      branch: { select: { id: true, name: true, brandId: true } },
    },
  });
  if (!order) {
    throw new OrderItemRewriteError("ไม่พบออเดอร์", 404);
  }
  if (order.status === OrderStatus.CANCELLED) {
    throw new OrderItemRewriteError("ไม่สามารถแก้ไขออเดอร์ที่ถูกยกเลิกแล้ว");
  }
  if (order.awaitingPhotoKey) {
    throw new OrderItemRewriteError(
      "ออเดอร์รูปยังไม่ได้คีย์รายการ — ใช้หน้าคีย์ออเดอร์แทน",
    );
  }

  const requestedIds = input.items.map((i) => i.branchMenuItemId);
  const orderableMenus = await prisma.branchMenuItem.findMany({
    where: {
      branchId: input.branchId,
      isHidden: false,
      id: { in: requestedIds },
    },
    include: {
      stock: true,
      category: { select: { stockExempt: true } },
      optionGroupLinks: {
        include: {
          group: { include: optionGroupDetailInclude },
        },
      },
    },
  });
  const itemMap = new Map(orderableMenus.map((bm) => [bm.id, bm]));
  const channel = fulfillmentToChannel(order.fulfillmentType);

  for (const item of input.items) {
    const menu = itemMap.get(item.branchMenuItemId);
    if (!menu) {
      throw new OrderItemRewriteError("มีเมนูที่ไม่สามารถสั่งได้");
    }
    if (!isChannelSellEnabled(menu, channel)) {
      throw new OrderItemRewriteError(
        `“${menu.name}” ไม่จำหน่ายในช่องทางของออเดอร์นี้`,
      );
    }
    const menuLike = {
      isOutOfStock: menu.isOutOfStock,
      stockQuantity: menu.stock?.quantity ?? null,
      optionGroups: menu.optionGroupLinks.map((l) => ({ mode: l.group.mode })),
      category: menu.category,
    };
    if (isMenuItemSoldOut(menuLike)) {
      throw new OrderItemRewriteError(`“${menu.name}” หมดชั่วคราว`);
    }
  }

  const orderItems: Array<{
    branchMenuItemId: string;
    itemName: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    optionsText: string | null;
    optionsPrice: Prisma.Decimal;
    giftQuantity: number;
    note: string | null;
  }> = [];

  for (const item of input.items) {
    const menu = itemMap.get(item.branchMenuItemId)!;
    const groups = menu.optionGroupLinks.map((l) => l.group);
    const resolved = resolveOrderItemOptionsFromPrisma(groups, item.optionIds);
    if (!resolved.ok) {
      throw new OrderItemRewriteError(
        `ตัวเลือกของ "${menu.name}" ไม่ถูกต้อง: ${resolved.error}`,
      );
    }
    const chosen = resolved.chosen;
    const optionsPrice = chosen.reduce(
      (sum, o) => sum.add(new Prisma.Decimal(o.priceDelta)),
      new Prisma.Decimal(0),
    );
    const priced = resolveSellPrice(menu, channel);
    orderItems.push({
      branchMenuItemId: item.branchMenuItemId,
      itemName: menu.name,
      quantity: item.quantity,
      unitPrice: new Prisma.Decimal(priced.final),
      optionsText: chosen.map((o) => o.name).join(", ") || null,
      optionsPrice,
      giftQuantity: computeLineGiftQuantity(
        groups,
        item.optionIds,
        item.quantity,
      ),
      note: item.note?.trim() || null,
    });
  }

  const wasDeducted = order.stockDeducted;
  const shouldDeduct =
    wasDeducted || shouldHaveStockDeducted(order.status);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (wasDeducted) {
        await restoreStockForOrder(order.id, tx);
        await purgeOrderStockHistory(order.id, tx);
      }

      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      const next = await tx.order.update({
        where: { id: order.id },
        data: {
          items: { create: orderItems },
        },
        include: {
          items: true,
          consumableLines: true,
          branch: { select: { id: true, name: true } },
        },
      });

      if (shouldDeduct) {
        await deductStockForOrder(order.id, tx);
        await deductBranchMenuStockForOrder({
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: input.branchId,
          staffId: input.staffId ?? null,
          lines: input.items.map((i) => ({
            branchMenuItemId: i.branchMenuItemId,
            quantity: i.quantity,
            optionIds: i.optionIds,
          })),
          tx,
        });
        await deductBranchNonMenuStockForOrder({
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: input.branchId,
          staffId: input.staffId ?? null,
          lines: order.consumableLines.map((c) => ({
            branchNonMenuItemId: c.branchNonMenuItemId,
            quantity: c.quantity,
          })),
          tx,
        });
      }

      return next;
    });

    const totalAmount = orderGrandTotal(
      updated.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        optionsPrice: Number(item.optionsPrice),
      })),
      Number(order.deliveryFee),
      Number(order.discountAmount),
    );

    return {
      order: updated,
      totalAmount,
      stockRestored: wasDeducted,
      stockDeducted: shouldDeduct,
    };
  } catch (err) {
    if (err instanceof StockError) {
      throw new OrderItemRewriteError(err.message, err.status);
    }
    throw err;
  }
}
