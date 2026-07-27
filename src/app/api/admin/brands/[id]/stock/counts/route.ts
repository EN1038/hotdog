import { StockCountType, StockType } from "@prisma/client";
import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  completeStockCount,
  createStockCount,
  StockError,
  updateStockCountLines,
} from "@/lib/stock";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  stockLocationId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  type: z.nativeEnum(StockCountType).optional(),
  stockTypes: z.array(z.nativeEnum(StockType)).optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);
    const counts = await prisma.stockCount.findMany({
      where: { brandId: id },
      include: {
        location: { select: { id: true, name: true, type: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return jsonOk(counts);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireBrandAccess(id);
    const body = createSchema.parse(await request.json());

    const count = await createStockCount({
      brandId: id,
      stockLocationId: body.stockLocationId,
      name: body.name,
      type: body.type,
      stockTypes: body.stockTypes,
      note: body.note,
      adminId: session.adminId,
    });

    const brand = await prisma.brand.findUnique({ where: { id } });
    await logAdminActivity(session, {
      action: "brand.stock.count.create",
      summary: `สร้างรอบตรวจนับ ${count.name}`,
      brandId: id,
      brandName: brand?.name ?? null,
      entityType: "stockCount",
      entityId: count.id,
      entityName: count.name,
    });

    return jsonOk(count, 201);
  } catch (error) {
    if (error instanceof StockError) {
      return jsonError(error.message, error.status);
    }
    return handleApiError(error);
  }
}
