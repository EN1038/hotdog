import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { orderGrandTotal } from "@/lib/order-totals";

type Params = { params: Promise<{ id: string }> };

/** GET — orders in one shift (same branch). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id: shiftId } = await params;

    const shift = await prisma.branchShift.findFirst({
      where: { id: shiftId, branchId: session.branchId },
      select: { id: true, roundNumber: true },
    });
    if (!shift) return jsonError("ไม่พบรอบ", 404);

    const orders = await prisma.order.findMany({
      where: { branchId: session.branchId, shiftId },
      select: {
        id: true,
        orderNumber: true,
        queueNumber: true,
        status: true,
        awaitingPhotoKey: true,
        paymentMethod: true,
        salesChannel: true,
        customerName: true,
        createdAt: true,
        deliveryFee: true,
        discountAmount: true,
        items: {
          select: { quantity: true, unitPrice: true, optionsPrice: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return jsonOk({
      shiftId: shift.id,
      roundNumber: shift.roundNumber,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        queueNumber: o.queueNumber,
        status: o.status,
        awaitingPhotoKey: o.awaitingPhotoKey,
        paymentMethod: o.paymentMethod,
        salesChannel: o.salesChannel,
        customerName: o.customerName,
        createdAt: o.createdAt.toISOString(),
        itemCount: o.items.reduce((n, it) => n + it.quantity, 0),
        total: orderGrandTotal(
          o.items.map((i) => ({
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            optionsPrice: Number(i.optionsPrice),
          })),
          Number(o.deliveryFee),
          Number(o.discountAmount),
        ),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
