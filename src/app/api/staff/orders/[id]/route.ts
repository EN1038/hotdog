import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { canStaffUpdateStatus } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const statusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    const body = statusSchema.parse(await request.json());

    const order = await prisma.order.findFirst({
      where: { id, branchId: session.branchId },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);

    const roles = session.staffRoles ?? [];
    if (
      !canStaffUpdateStatus(roles, order.status, body.status, order.fulfillmentType)
    ) {
      return jsonError("ไม่มีสิทธิ์เปลี่ยนสถานะนี้", 403);
    }

    const moved = await prisma.order.updateMany({
      where: {
        id,
        branchId: session.branchId,
        status: order.status,
      },
      data: { status: body.status },
    });
    if (moved.count === 0) {
      return jsonError("ไม่สามารถเปลี่ยนสถานะได้ สถานะออเดอร์เปลี่ยนไปแล้ว");
    }

    const updated = await prisma.order.findFirst({
      where: { id, branchId: session.branchId },
      include: {
        customer: true,
        deliveryLocation: true,
        items: { include: { branchMenuItem: true } },
      },
    });
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
