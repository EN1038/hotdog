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
import { ORDER_STATUS_LABELS } from "@/lib/constants";

type Params = { params: Promise<{ id: string; orderId: string }> };

const bodySchema = z.object({
  confirmOrderNumber: z.string().trim().min(1),
  reason: z.string().trim().min(2).max(300),
});

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
