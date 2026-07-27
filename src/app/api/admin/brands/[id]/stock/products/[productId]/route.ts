import { EquipmentStatus, Prisma, StockType } from "@prisma/client";
import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string; productId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sku: z.string().trim().max(64).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  stockType: z.nativeEnum(StockType).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  trackStock: z.boolean().optional(),
  trackLots: z.boolean().optional(),
  lowStockAlert: z.number().int().min(0).nullable().optional(),
  costPrice: z.number().min(0).nullable().optional(),
  sellingPrice: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
  equipmentStatus: z.nativeEnum(EquipmentStatus).nullable().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, productId } = await params;
    const session = await requireBrandAccess(id);
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.brandProduct.findFirst({
      where: { id: productId, brandId: id },
    });
    if (!existing) return jsonError("ไม่พบสินค้า", 404);

    if (body.name && body.name !== existing.name) {
      const dup = await prisma.brandProduct.findFirst({
        where: { brandId: id, name: body.name, NOT: { id: productId } },
      });
      if (dup) return jsonError("มีสินค้าชื่อนี้อยู่แล้วในแบรนด์");
    }

    const nextType = body.stockType ?? existing.stockType;
    const product = await prisma.brandProduct.update({
      where: { id: productId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.sku !== undefined && { sku: body.sku?.trim() || null }),
        ...(body.barcode !== undefined && {
          barcode: body.barcode?.trim() || null,
        }),
        ...(body.unit !== undefined && { unit: body.unit.trim() }),
        ...(body.stockType !== undefined && { stockType: body.stockType }),
        ...(body.category !== undefined && {
          category: body.category?.trim() || null,
        }),
        ...(body.trackStock !== undefined && { trackStock: body.trackStock }),
        ...(body.trackLots !== undefined && { trackLots: body.trackLots }),
        ...(body.lowStockAlert !== undefined && {
          lowStockAlert: body.lowStockAlert,
        }),
        ...(body.costPrice !== undefined && {
          costPrice:
            body.costPrice != null ? new Prisma.Decimal(body.costPrice) : null,
        }),
        ...(body.sellingPrice !== undefined && {
          sellingPrice:
            body.sellingPrice != null
              ? new Prisma.Decimal(body.sellingPrice)
              : null,
        }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.equipmentStatus !== undefined || body.stockType !== undefined
          ? {
              equipmentStatus:
                nextType === StockType.EQUIPMENT
                  ? (body.equipmentStatus !== undefined
                      ? body.equipmentStatus
                      : existing.equipmentStatus ?? EquipmentStatus.ACTIVE)
                  : null,
            }
          : {}),
      },
    });

    const brand = await prisma.brand.findUnique({ where: { id } });
    await logAdminActivity(session, {
      action: "brand.product.update",
      summary: `แก้ไขสินค้าสต๊อก ${product.name}`,
      brandId: id,
      brandName: brand?.name ?? null,
      entityType: "brandProduct",
      entityId: product.id,
      entityName: product.name,
    });

    return jsonOk(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, productId } = await params;
    const session = await requireBrandAccess(id);

    const existing = await prisma.brandProduct.findFirst({
      where: { id: productId, brandId: id },
    });
    if (!existing) return jsonError("ไม่พบสินค้า", 404);

    await prisma.brandProduct.delete({ where: { id: productId } });

    const brand = await prisma.brand.findUnique({ where: { id } });
    await logAdminActivity(session, {
      action: "brand.product.delete",
      summary: `ลบสินค้าสต๊อก ${existing.name}`,
      brandId: id,
      brandName: brand?.name ?? null,
      entityType: "brandProduct",
      entityId: existing.id,
      entityName: existing.name,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
