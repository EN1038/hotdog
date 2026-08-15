import { EquipmentStatus, StockType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireWarehouseStaff } from "@/lib/warehouse-branch";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(20).optional(),
  stockType: z.nativeEnum(StockType).optional(),
});

export async function POST(request: Request) {
  try {
    const { brandId } = await requireWarehouseStaff();
    const body = createSchema.parse(await request.json());

    const dup = await prisma.brandProduct.findFirst({
      where: { brandId, name: body.name },
    });
    if (dup) return jsonError("มีสินค้าชื่อนี้อยู่แล้วในแบรนด์");

    const stockType = body.stockType ?? StockType.SALE_ITEM;
    const product = await prisma.brandProduct.create({
      data: {
        brandId,
        name: body.name,
        unit: body.unit?.trim() || "ชิ้น",
        stockType,
        trackStock: true,
        isActive: true,
        equipmentStatus:
          stockType === StockType.EQUIPMENT ? EquipmentStatus.ACTIVE : null,
      },
    });
    return jsonOk(product, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
