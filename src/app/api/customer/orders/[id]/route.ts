import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { canCustomerCancel } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireCustomer();
    const { id } = await params;
    const order = await prisma.order.findFirst({
      where: { id, customerId: session.customerId },
      include: {
        branch: { include: { brand: true } },
        deliveryLocation: true,
        items: { include: { branchMenuItem: true } },
      },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);
    return jsonOk(order);
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  action: z.literal("cancel"),
  cancelReason: z.string().trim().min(2).max(200),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireCustomer();
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const reason = body.cancelReason.trim();

    const cancelled = await prisma.order.updateMany({
      where: {
        id,
        customerId: session.customerId,
        status: OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
      },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    if (cancelled.count === 0) {
      const order = await prisma.order.findFirst({
        where: { id, customerId: session.customerId },
      });
      if (!order) return jsonError("ไม่พบออเดอร์", 404);
      if (!canCustomerCancel(order.status)) {
        return jsonError("สามารถยกเลิกออเดอร์ได้ก่อนร้านรับออเดอร์เท่านั้น");
      }
      return jsonError("ไม่สามารถยกเลิกได้ สถานะออเดอร์เปลี่ยนไปแล้ว");
    }

    const updated = await prisma.order.findFirst({
      where: { id, customerId: session.customerId },
      include: {
        branch: true,
        deliveryLocation: true,
        items: true,
      },
    });
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
