import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  markPurchaseOrderOrdered,
  receivePurchaseOrder,
  StockError,
} from "@/lib/stock-advanced";

type Params = { params: Promise<{ id: string; poId: string }> };

const patchSchema = z.object({
  action: z.enum(["order", "receive", "cancel"]),
  lines: z
    .array(
      z.object({
        brandProductId: z.string(),
        quantity: z.number().int().positive(),
        lotNumber: z.string().trim().max(64).nullable().optional(),
        expiresAt: z.string().datetime().nullable().optional(),
      }),
    )
    .optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, poId } = await params;
    await requireBrandAccess(id);
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: poId, brandId: id },
      include: {
        supplier: true,
        lines: { include: { product: true } },
        location: true,
      },
    });
    if (!po) return jsonError("ไม่พบใบสั่งซื้อ", 404);
    return jsonOk(po);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, poId } = await params;
    const session = await requireBrandAccess(id);
    const body = patchSchema.parse(await request.json());

    if (body.action === "order") {
      const po = await markPurchaseOrderOrdered({
        brandId: id,
        purchaseOrderId: poId,
      });
      return jsonOk(po);
    }

    if (body.action === "cancel") {
      const po = await prisma.purchaseOrder.updateMany({
        where: {
          id: poId,
          brandId: id,
          status: { in: ["DRAFT", "ORDERED"] },
        },
        data: { status: "CANCELLED" },
      });
      if (!po.count) return jsonError("ยกเลิกไม่ได้");
      return jsonOk({ ok: true });
    }

    if (!body.lines?.length) return jsonError("ต้องระบุรายการที่รับ");
    const po = await receivePurchaseOrder({
      brandId: id,
      purchaseOrderId: poId,
      lines: body.lines.map((l) => ({
        brandProductId: l.brandProductId,
        quantity: l.quantity,
        lotNumber: l.lotNumber,
        expiresAt: l.expiresAt ? new Date(l.expiresAt) : null,
      })),
      adminId: session.adminId,
    });

    const brand = await prisma.brand.findUnique({ where: { id } });
    await logAdminActivity(session, {
      action: "brand.po.receive",
      summary: `รับของ PO ${po.orderNumber}`,
      brandId: id,
      brandName: brand?.name ?? null,
      entityType: "purchaseOrder",
      entityId: po.id,
      entityName: po.orderNumber,
    });
    return jsonOk(po);
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, error.status);
    return handleApiError(error);
  }
}
