import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { prisma } from "@/lib/db";
import {
  adjustStock,
  ensureWarehouseLocation,
  stockOutbound,
  StockError,
  transferWarehouseToBranch,
} from "@/lib/stock";
import {
  stockInWithLot,
  transferBranchToBranch,
} from "@/lib/stock-advanced";

type Params = { params: Promise<{ id: string }> };

const movementSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("receive"),
    brandProductId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    unitCost: z.number().min(0).nullable().optional(),
    supplier: z.string().trim().max(120).nullable().optional(),
    lotNumber: z.string().trim().max(64).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  }),
  z.object({
    action: z.literal("stock_in"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    unitCost: z.number().min(0).nullable().optional(),
    supplier: z.string().trim().max(120).nullable().optional(),
    lotNumber: z.string().trim().max(64).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  }),
  z.object({
    action: z.literal("transfer"),
    brandProductId: z.string().min(1),
    branchId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("branch_transfer"),
    brandProductId: z.string().min(1),
    sourceBranchId: z.string().min(1),
    destinationBranchId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    lotNumber: z.string().trim().max(64).nullable().optional(),
  }),
  z.object({
    action: z.literal("adjust"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().min(0),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("damage"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    reason: z.string().trim().max(200).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
  }),
  z.object({
    action: z.literal("lost"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    reason: z.string().trim().max(200).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
  }),
  z.object({
    action: z.literal("issue"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
]);

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
    const body = movementSchema.parse(await request.json());

    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) return jsonError("ไม่พบแบรนด์", 404);
    if (!brand.stockEnabled) {
      return jsonError("ยังไม่ได้เปิดระบบสต๊อกของแบรนด์นี้");
    }

    let movement;
    const actor = { adminId: session.adminId };

    if (body.action === "receive") {
      const warehouse = await ensureWarehouseLocation(id);
      movement = await stockInWithLot({
        brandId: id,
        stockLocationId: warehouse.id,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        unitCost: body.unitCost,
        supplier: body.supplier,
        lotNumber: body.lotNumber,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        ...actor,
      });
    } else if (body.action === "stock_in") {
      movement = await stockInWithLot({
        brandId: id,
        stockLocationId: body.stockLocationId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        unitCost: body.unitCost,
        supplier: body.supplier,
        lotNumber: body.lotNumber,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        ...actor,
      });
    } else if (body.action === "transfer") {
      movement = await transferWarehouseToBranch({
        brandId: id,
        branchId: body.branchId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        ...actor,
      });
    } else if (body.action === "branch_transfer") {
      movement = await transferBranchToBranch({
        brandId: id,
        sourceBranchId: body.sourceBranchId,
        destinationBranchId: body.destinationBranchId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        lotNumber: body.lotNumber,
        ...actor,
      });
    } else if (body.action === "adjust") {
      movement = await adjustStock({
        brandId: id,
        stockLocationId: body.stockLocationId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        ...actor,
      });
    } else if (body.action === "damage" || body.action === "lost") {
      movement = await stockOutbound({
        brandId: id,
        stockLocationId: body.stockLocationId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        type: body.action === "damage" ? "DAMAGE" : "LOST",
        note: body.note,
        reason: body.reason,
        imageUrl: body.imageUrl,
        ...actor,
      });
    } else {
      movement = await stockOutbound({
        brandId: id,
        stockLocationId: body.stockLocationId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        type: "ISSUE",
        note: body.note,
        ...actor,
      });
    }

    await logAdminActivity(session, {
      action: `brand.stock.${body.action}` as "brand.stock.receive",
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
