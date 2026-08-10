import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";
import { prisma } from "@/lib/db";
import {
  hardDeleteOrderWithStockRestore,
  OrderHardDeleteError,
} from "@/lib/order-hard-delete";
import {
  OrderItemRewriteError,
  rewriteOrderItemsWithStock,
} from "@/lib/order-item-rewrite";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

type Params = { params: Promise<{ id: string; orderId: string }> };

const bodySchema = z.object({
  confirmOrderNumber: z.string().trim().min(1),
  reason: z.string().trim().min(2).max(300),
});

const editItemsSchema = z.object({
  items: z
    .array(
      z.object({
        branchMenuItemId: z.string().min(1),
        quantity: z.number().int().positive().max(99),
        optionIds: z.array(z.string()).default([]),
        note: z.string().max(200).optional().nullable(),
      }),
    )
    .min(1),
  reason: z.string().trim().max(300).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId, orderId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = editItemsSchema.parse(await request.json());

    const before = await prisma.order.findFirst({
      where: { id: orderId, branchId },
      select: {
        id: true,
        orderNumber: true,
        queueNumber: true,
        status: true,
        stockDeducted: true,
        _count: { select: { items: true } },
      },
    });
    if (!before) return jsonError("ไม่พบออเดอร์", 404);

    const result = await rewriteOrderItemsWithStock({
      orderId,
      branchId,
      items: body.items.map((i) => ({
        branchMenuItemId: i.branchMenuItemId,
        quantity: i.quantity,
        optionIds: i.optionIds,
        note: i.note,
      })),
    });

    const ctx = await getBranchActivityContext(branchId);
    const reason = body.reason?.trim();
    await logAdminActivity(session, {
      action: "order.items_edit",
      summary: `แก้ไขรายการออเดอร์ คิว ${before.queueNumber} #${before.orderNumber} (${before._count.items}→${result.order.items.length} รายการ)${reason ? ` — ${reason}` : ""}`,
      brandId: ctx?.brandId ?? ctx?.brand?.id ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "order",
      entityId: before.id,
      entityName: before.orderNumber,
      metadata: {
        reason: reason || null,
        queueNumber: before.queueNumber,
        status: before.status,
        stockRestored: result.stockRestored,
        stockDeducted: result.stockDeducted,
        itemCountBefore: before._count.items,
        itemCountAfter: result.order.items.length,
        totalAmount: result.totalAmount,
      },
    });

    return jsonOk({
      ok: true,
      order: result.order,
      totalAmount: result.totalAmount,
      stockRestored: result.stockRestored,
      stockDeducted: result.stockDeducted,
    });
  } catch (error) {
    if (error instanceof OrderItemRewriteError) {
      return jsonError(error.message, error.status);
    }
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id: branchId, orderId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = bodySchema.parse(await request.json());

    const order = await prisma.order.findFirst({
      where: { id: orderId, branchId },
      select: {
        id: true,
        orderNumber: true,
        queueNumber: true,
        status: true,
        stockDeducted: true,
      },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);

    if (body.confirmOrderNumber !== order.orderNumber) {
      return jsonError("เลขที่ออเดอร์ไม่ตรง — พิมพ์เลขที่ให้ถูกต้องเพื่อยืนยัน");
    }

    const snapshot = await hardDeleteOrderWithStockRestore(order.id);
    const ctx = await getBranchActivityContext(branchId);

    await logAdminActivity(session, {
      action: "order.delete",
      summary: `ลบออเดอร์ถาวร คิว ${snapshot.queueNumber} #${snapshot.orderNumber} (${ORDER_STATUS_LABELS[snapshot.status]}) — ${body.reason}`,
      brandId: ctx?.brandId ?? ctx?.brand?.id ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "order",
      entityId: snapshot.id,
      entityName: snapshot.orderNumber,
      metadata: {
        reason: body.reason,
        queueNumber: snapshot.queueNumber,
        status: snapshot.status,
        stockDeducted: snapshot.stockDeducted,
        itemCount: snapshot.itemCount,
        consumableCount: snapshot.consumableCount,
      },
    });

    return jsonOk({
      ok: true,
      deleted: {
        id: snapshot.id,
        orderNumber: snapshot.orderNumber,
        queueNumber: snapshot.queueNumber,
      },
    });
  } catch (error) {
    if (error instanceof OrderHardDeleteError) {
      return jsonError(error.message, error.status);
    }
    return handleApiError(error);
  }
}
