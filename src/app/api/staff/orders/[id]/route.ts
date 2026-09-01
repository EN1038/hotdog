import { OrderStatus, Prisma } from "@prisma/client";
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
import { orderGrandTotal } from "@/lib/order-totals";
import { validateOrderDiscount } from "@/lib/order-discount";

const statusSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  cancelReason: z.string().trim().min(2).max(200).optional(),
  paymentSlipUrl: z
    .union([z.string().min(1).max(2000), z.literal(""), z.null()])
    .optional(),
  discountAmount: z.number().min(0).max(999_999).optional(),
  discountReason: z.string().trim().max(40).optional().nullable(),
  discountReasonNote: z.string().trim().max(120).optional().nullable(),
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

/** GET — read-only order detail (history / share). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    const order = await loadStaffOrder(id, session.branchId);
    if (!order) return jsonError("ไม่พบออเดอร์", 404);

    const items = order.items.map((it) => {
      const unitPrice = Number(it.unitPrice);
      const optionsPrice = Number(it.optionsPrice);
      return {
        id: it.id,
        itemName: it.itemName,
        quantity: it.quantity,
        unitPrice,
        optionsPrice,
        optionsText: it.optionsText,
        giftQuantity: it.giftQuantity ?? 0,
        note: it.note,
        lineTotal: (unitPrice + optionsPrice) * it.quantity,
      };
    });

    return jsonOk({
      id: order.id,
      orderNumber: order.orderNumber,
      queueNumber: order.queueNumber,
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      paymentMethod: order.paymentMethod,
      salesChannel: order.salesChannel,
      customerName: order.customerName,
      createdAt: order.createdAt.toISOString(),
      note: order.note,
      deliveryFee: Number(order.deliveryFee),
      discountAmount: Number(order.discountAmount),
      discountReason: order.discountReason,
      discountReasonNote: order.discountReasonNote,
      grandTotal: orderGrandTotal(
        items.map((i) => ({
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          optionsPrice: i.optionsPrice,
        })),
        Number(order.deliveryFee),
        Number(order.discountAmount),
      ),
      items,
      consumableLines: order.consumableLines.map((c) => ({
        itemName: c.itemName,
        quantity: c.quantity,
        unit: c.unit,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
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

    const hasDiscountPatch =
      body.discountAmount !== undefined ||
      body.discountReason !== undefined ||
      body.discountReasonNote !== undefined;

    // Discount-only update on mutable orders in active shift
    if (
      hasDiscountPatch &&
      body.status === undefined &&
      body.paymentSlipUrl === undefined
    ) {
      if (order.status === OrderStatus.CANCELLED) {
        return jsonError("ไม่สามารถแก้ส่วนลดออเดอร์ที่ยกเลิกแล้ว");
      }
      if (order.awaitingPhotoKey) {
        return jsonError("ออเดอร์รูปยังไม่ได้คีย์รายการ");
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

      const fullOrder = await prisma.order.findFirst({
        where: { id, branchId: session.branchId },
        include: { items: true },
      });
      if (!fullOrder) return jsonError("ไม่พบออเดอร์", 404);

      const itemsSubtotal = fullOrder.items.reduce(
        (sum, it) =>
          sum + (Number(it.unitPrice) + Number(it.optionsPrice)) * it.quantity,
        0,
      );
      const discountCheck = validateOrderDiscount({
        itemsSubtotal,
        deliveryFee: Number(fullOrder.deliveryFee),
        discountAmount:
          body.discountAmount ?? Number(fullOrder.discountAmount),
        discountReason:
          body.discountReason !== undefined
            ? body.discountReason
            : fullOrder.discountReason,
        discountReasonNote:
          body.discountReasonNote !== undefined
            ? body.discountReasonNote
            : fullOrder.discountReasonNote,
      });
      if (!discountCheck.ok) {
        return jsonError(discountCheck.error);
      }

      await prisma.order.update({
        where: { id },
        data: {
          discountAmount: new Prisma.Decimal(discountCheck.discountAmount),
          discountReason: discountCheck.discountReason,
          discountReasonNote:
            discountCheck.discountReason === "other"
              ? body.discountReasonNote?.trim() ||
                fullOrder.discountReasonNote
              : null,
        },
      });
      const latest = await loadStaffOrder(id, session.branchId);
      return jsonOk(latest);
    }

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
