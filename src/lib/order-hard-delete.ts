import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { restoreStockForOrder, StockError } from "@/lib/stock";

export type HardDeleteOrderSnapshot = {
  id: string;
  orderNumber: string;
  queueNumber: number;
  status: OrderStatus;
  stockDeducted: boolean;
  branchId: string;
  itemCount: number;
  consumableCount: number;
};

export class OrderHardDeleteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "OrderHardDeleteError";
    this.status = status;
  }
}

type Tx = Prisma.TransactionClient;

/**
 * Restore any deducted stock, purge stock history tied to the order, then
 * hard-delete the Order row (cascades OrderItem + OrderConsumableLine).
 */
export async function hardDeleteOrderWithStockRestore(
  orderId: string,
): Promise<HardDeleteOrderSnapshot> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      _count: { select: { items: true, consumableLines: true } },
    },
  });
  if (!order) {
    throw new OrderHardDeleteError("ไม่พบออเดอร์", 404);
  }

  const snapshot: HardDeleteOrderSnapshot = {
    id: order.id,
    orderNumber: order.orderNumber,
    queueNumber: order.queueNumber,
    status: order.status,
    stockDeducted: order.stockDeducted,
    branchId: order.branchId,
    itemCount: order._count.items,
    consumableCount: order._count.consumableLines,
  };

  try {
    await prisma.$transaction(async (tx: Tx) => {
      await restoreStockForOrder(orderId, tx);

      await tx.stockMovement.deleteMany({ where: { orderId } });

      await tx.branchMenuItemStockHistory.deleteMany({
        where: { note: { contains: orderId } },
      });
      await tx.branchNonMenuItemHistory.deleteMany({
        where: { note: { contains: orderId } },
      });

      await tx.order.delete({ where: { id: orderId } });
    });
  } catch (err) {
    if (err instanceof StockError) {
      throw new OrderHardDeleteError(err.message, err.status);
    }
    throw err;
  }

  return snapshot;
}
