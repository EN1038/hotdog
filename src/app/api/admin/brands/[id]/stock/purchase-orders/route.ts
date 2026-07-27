import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  createPurchaseOrder,
  markPurchaseOrderOrdered,
  receivePurchaseOrder,
  StockError,
} from "@/lib/stock-advanced";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  supplierId: z.string().min(1),
  stockLocationId: z.string().nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  expectedAt: z.string().datetime().nullable().optional(),
  lines: z
    .array(
      z.object({
        brandProductId: z.string(),
        quantityOrdered: z.number().int().positive(),
        unitCost: z.number().min(0).nullable().optional(),
      }),
    )
    .min(1),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);
    const orders = await prisma.purchaseOrder.findMany({
      where: { brandId: id },
      include: {
        supplier: true,
        lines: { include: { product: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return jsonOk(orders);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireBrandAccess(id);
    const body = createSchema.parse(await request.json());
    const po = await createPurchaseOrder({
      brandId: id,
      supplierId: body.supplierId,
      stockLocationId: body.stockLocationId,
      note: body.note,
      expectedAt: body.expectedAt ? new Date(body.expectedAt) : null,
      lines: body.lines,
      adminId: session.adminId,
    });
    const brand = await prisma.brand.findUnique({ where: { id } });
    await logAdminActivity(session, {
      action: "brand.po.create",
      summary: `สร้างใบสั่งซื้อ ${po.orderNumber}`,
      brandId: id,
      brandName: brand?.name ?? null,
      entityType: "purchaseOrder",
      entityId: po.id,
      entityName: po.orderNumber,
    });
    return jsonOk(po, 201);
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, error.status);
    return handleApiError(error);
  }
}
