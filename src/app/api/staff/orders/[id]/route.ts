import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import {
  canStaffCancel,
  canStaffUpdateStatus,
  ORDER_STATUS_LABELS,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  assertOrderMutableInActiveShift,
  ShiftGateError,
} from "@/lib/branch-shift";
import {
  maybeDeductOnAccept,
  restoreStockForOrder,
  StockError,
} from "@/lib/stock";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

const statusSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  cancelReason: z.string().trim().min(2).max(200).optional(),
  paymentSlipUrl: z
    .union([z.string().min(1).max(2000), z.literal(""), z.null()])
    .optional(),
});

type Params = { params: Promise<{ id: string }> };

async function loadStaffOrder(id: string, branchId: string) {
  return prisma.order.findFirst({
    where: { id, branchId },
    include: {
      customer: true,
      deliveryLocation: true,
      items: { include: { branchMenuItem: true } },
      consumableLines: true,
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await ensureProdSchemaCompat();
    const session = await requireStaff();
    const { id } = await params;
    const body = statusSchema.parse(await request.json());

    const order = await prisma.order.findFirst({
      where: { id, branchId: session.branchId },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);

    // Slip-only update: may attach anytime for current shift orders (closed shift OK for view+patch on today's orders)
    if (body.paymentSlipUrl !== undefined && body.status === undefined) {
      const url =
        body.paymentSlipUrl == null || body.paymentSlipUrl === ""
          ? null
          : String(body.paymentSlipUrl).trim();
      if (url && !/^https?:\/\//i.test(url) && !url.startsWith("/uploads/")) {
        return jsonError("ลิงก์รูปสลิปไม่ถูกต้อง");
      }
      await prisma.order.update({
        where: { id },
        data: { paymentSlipUrl: url },
      });
      const latest = await loadStaffOrder(id, session.branchId);
      return jsonOk(latest);
    }

    if (body.status === undefined) {
      return jsonError("ไม่มีข้อมูลให้อัปเดต");
    }

    try {
      await assertOrderMutableInActiveShift({
        branchId: session.branchId,
        orderShiftId: order.shiftId,
        orderQueueBusinessDate: order.queueBusinessDate,
      });
    } catch (e) {
      if (e instanceof ShiftGateError) {
        return jsonError(e.message, e.status);
      }
      throw e;
    }

    const roles = session.staffRoles ?? [];
    const previousStatus = order.status;

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
          awaitingPhotoKey: false,
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

      try {
        await restoreStockForOrder(id);
      } catch (e) {
        if (e instanceof StockError) {
          return jsonError(e.message, e.status);
        }
        throw e;
      }
    } else {
      if (order.awaitingPhotoKey) {
        return jsonError(
          "ออเดอร์นี้ยังรอคีย์รายการจากรูป — คีย์เมนูให้ครบก่อนเปลี่ยนสถานะ",
          403,
        );
      }
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

      try {
        await maybeDeductOnAccept({
          orderId: id,
          previousStatus,
          nextStatus: body.status,
        });
      } catch (e) {
        if (e instanceof StockError) {
          await prisma.order.updateMany({
            where: {
              id,
              branchId: session.branchId,
              status: body.status,
            },
            data: { status: previousStatus },
          });
          return jsonError(e.message, e.status);
        }
        throw e;
      }
    }

    // Optional slip on same request as status change
    if (body.paymentSlipUrl !== undefined) {
      const url =
        body.paymentSlipUrl == null || body.paymentSlipUrl === ""
          ? null
          : String(body.paymentSlipUrl).trim();
      if (url && !/^https?:\/\//i.test(url) && !url.startsWith("/uploads/")) {
        return jsonError("ลิงก์รูปสลิปไม่ถูกต้อง");
      }
      await prisma.order.update({
        where: { id },
        data: { paymentSlipUrl: url },
      });
    }

    const latest = await loadStaffOrder(id, session.branchId);
    return jsonOk(latest);
  } catch (error) {
    return handleApiError(error);
  }
}
