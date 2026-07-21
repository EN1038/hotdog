import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import {
  canStaffCancel,
  canStaffUpdateStatus,
  bangkokDateKey,
  ORDER_STATUS_LABELS,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const statusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  cancelReason: z.string().trim().min(2).max(200).optional(),
});

type Params = { params: Promise<{ id: string }> };

async function loadStaffOrder(id: string, branchId: string) {
  return prisma.order.findFirst({
    where: { id, branchId },
    include: {
      customer: true,
      deliveryLocation: true,
      items: { include: { branchMenuItem: true } },
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    const body = statusSchema.parse(await request.json());

    const order = await prisma.order.findFirst({
      where: { id, branchId: session.branchId },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);

    if (bangkokDateKey(order.queueBusinessDate) !== bangkokDateKey()) {
      return jsonError(
        "แก้ไขได้เฉพาะออเดอร์ของวันนี้ — กลับไปที่วันปัจจุบันก่อน",
        403,
      );
    }

    const roles = session.staffRoles ?? [];

    if (body.status === OrderStatus.CANCELLED) {
      if (!canStaffCancel(roles, order.status)) {
        return jsonError("ไม่สามารถยกเลิกออเดอร์ในสถานะนี้ได้", 403);
      }
      const reason = body.cancelReason?.trim();
      if (!reason || reason.length < 2) {
        return jsonError("กรุณาระบุเหตุผลการยกเลิก");
      }

      const moved = await prisma.order.updateMany({
        where: {
          id,
          branchId: session.branchId,
          status: order.status,
        },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      });
      if (moved.count === 0) {
        const latest = await loadStaffOrder(id, session.branchId);
        return jsonError("ไม่สามารถยกเลิกได้ สถานะออเดอร์เปลี่ยนไปแล้ว", 409, {
          statusChanged: true,
          currentStatus: latest?.status ?? null,
          currentStatusLabel: latest
            ? ORDER_STATUS_LABELS[latest.status]
            : null,
          order: latest,
        });
      }
    } else {
      if (
        !canStaffUpdateStatus(
          roles,
          order.status,
          body.status,
          order.fulfillmentType,
        )
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
        const latest = await loadStaffOrder(id, session.branchId);
        return jsonError(
          "ไม่สามารถเปลี่ยนสถานะได้ สถานะออเดอร์เปลี่ยนไปแล้ว",
          409,
          {
            statusChanged: true,
            currentStatus: latest?.status ?? null,
            currentStatusLabel: latest
              ? ORDER_STATUS_LABELS[latest.status]
              : null,
            order: latest,
          },
        );
      }
    }

    const updated = await loadStaffOrder(id, session.branchId);
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
