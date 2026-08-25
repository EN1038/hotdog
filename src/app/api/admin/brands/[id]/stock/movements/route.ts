import { z } from "zod";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { StockError } from "@/lib/stock";
import {
  applyBrandStockMovement,
  stockMovementActivityAction,
  stockMovementSchema,
} from "@/lib/stock-movement-actions";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);
    const url = new URL(request.url);
    const take = Math.min(Number(url.searchParams.get("take") ?? 50), 200);

    const movements = await prisma.stockMovement.findMany({
      where: { brandId: id },
      include: {
        product: { select: { id: true, name: true, unit: true, stockType: true } },
        stockLocation: { select: { id: true, name: true, type: true } },
        fromLocation: { select: { id: true, name: true, type: true } },
        toLocation: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    return jsonOk(movements);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireBrandAccess(id);
    const body = stockMovementSchema.parse(await request.json());
    const { brand, movement } = await applyBrandStockMovement({
      brandId: id,
      body,
      actor: { adminId: session.adminId },
    });

    await logAdminActivity(session, {
      action: stockMovementActivityAction(body.action),
      summary: `สต๊อก: ${body.action} ×${"quantity" in body ? body.quantity : ""}`,
      brandId: id,
      brandName: brand.name,
      branchId: body.action === "transfer" ? body.branchId : null,
      entityType: "stockMovement",
      entityId: movement && "id" in movement ? String(movement.id) : null,
      metadata: body,
    });

    return jsonOk(movement ?? { ok: true }, 201);
  } catch (error) {
    if (error instanceof StockError) {
      return jsonError(error.message, error.status);
    }
    return handleApiError(error);
  }
}
