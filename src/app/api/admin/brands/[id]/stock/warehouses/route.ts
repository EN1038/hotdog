import { z } from "zod";
import { StockLocationType } from "@prisma/client";
import { requireBrandAccess } from "@/lib/admin-access";
import { logAdminActivity } from "@/lib/admin-activity";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const postSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const deleteSchema = z.object({
  locationId: z.string().min(1),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id: brandId } = await params;
    await requireBrandAccess(brandId);

    const warehouses = await prisma.stockLocation.findMany({
      where: { brandId, type: StockLocationType.WAREHOUSE },
      include: {
        balances: {
          include: { product: true },
        },
        _count: { select: { balances: true, movementsAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return jsonOk(warehouses);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: brandId } = await params;
    const session = await requireBrandAccess(brandId);
    const body = postSchema.parse(await request.json());

    // Check duplicate name in brand
    const existing = await prisma.stockLocation.findFirst({
      where: { brandId, type: StockLocationType.WAREHOUSE, name: body.name },
    });
    if (existing) {
      return jsonError("มีคลังสต๊อกกลางชื่อนี้แล้วในแบรนด์");
    }

    const warehouse = await prisma.stockLocation.create({
      data: {
        brandId,
        type: StockLocationType.WAREHOUSE,
        name: body.name,
      },
    });

    await logAdminActivity(session, {
      action: "brand.stock.settings",
      summary: `เพิ่มคลังสต๊อกกลางใหม่: ${warehouse.name}`,
      brandId,
      entityType: "stockLocation",
      entityId: warehouse.id,
      entityName: warehouse.name,
    });

    return jsonOk(warehouse, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id: brandId } = await params;
    const session = await requireBrandAccess(brandId);
    const body = deleteSchema.parse(await request.json());

    const warehouse = await prisma.stockLocation.findFirst({
      where: { id: body.locationId, brandId, type: StockLocationType.WAREHOUSE },
      include: { balances: true },
    });

    if (!warehouse) {
      return jsonError("ไม่พบคลังสต๊อกกลาง", 404);
    }

    // Check if total quantity > 0
    const totalQty = warehouse.balances.reduce((acc, b) => acc + b.quantity, 0);
    if (totalQty > 0) {
      return jsonError(`ไม่สามารถลบคลังได้เนื่องจากยังมีสินค้าคงเหลือ ${totalQty} ชิ้น`);
    }

    await prisma.stockLocation.delete({
      where: { id: warehouse.id },
    });

    await logAdminActivity(session, {
      action: "brand.stock.settings",
      summary: `ลบคลังสต๊อกกลาง: ${warehouse.name}`,
      brandId,
      entityType: "stockLocation",
      entityId: warehouse.id,
      entityName: warehouse.name,
    });

    return jsonOk({ success: true, message: "ลบคลังสต๊อกกลางเรียบร้อยแล้ว" });
  } catch (error) {
    return handleApiError(error);
  }
}
