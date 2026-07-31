import { EquipmentStatus, Prisma, StockType } from "@prisma/client";
import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
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
  imageUrl: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
});

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);
    const url = new URL(request.url);
    const type = url.searchParams.get("stockType") as StockType | null;

    const products = await prisma.brandProduct.findMany({
      where: {
        brandId: id,
        ...(type && Object.values(StockType).includes(type)
          ? { stockType: type }
          : {}),
      },
      include: {
        balances: {
          include: {
            location: { select: { id: true, name: true, type: true, branchId: true } },
          },
        },
      },
      orderBy: [{ stockType: "asc" }, { name: "asc" }],
    });
    return jsonOk(products);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireBrandAccess(id);
    const body = createSchema.parse(await request.json());

    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) return jsonError("ไม่พบแบรนด์", 404);

    const dup = await prisma.brandProduct.findFirst({
      where: { brandId: id, name: body.name },
    });
    if (dup) return jsonError("มีสินค้าชื่อนี้อยู่แล้วในแบรนด์");

    const stockType = body.stockType ?? StockType.SALE_ITEM;
    const product = await prisma.brandProduct.create({
      data: {
        brandId: id,
        name: body.name,
        sku: body.sku?.trim() || null,
        barcode: body.barcode?.trim() || null,
        unit: body.unit?.trim() || "ชิ้น",
        stockType,
        category: body.category?.trim() || null,
        imageUrl: body.imageUrl || null,
        description: body.description || null,
        trackStock: body.trackStock ?? true,
        trackLots: body.trackLots ?? false,
        lowStockAlert: body.lowStockAlert ?? null,
        costPrice:
          body.costPrice != null ? new Prisma.Decimal(body.costPrice) : null,
        sellingPrice:
          body.sellingPrice != null
            ? new Prisma.Decimal(body.sellingPrice)
            : null,
        isActive: body.isActive ?? true,
        equipmentStatus:
          stockType === StockType.EQUIPMENT
            ? (body.equipmentStatus ?? EquipmentStatus.ACTIVE)
            : null,
      },
    });

    await logAdminActivity(session, {
      action: "brand.product.create",
      summary: `เพิ่มสินค้าสต๊อก ${product.name}`,
      brandId: id,
      brandName: brand.name,
      entityType: "brandProduct",
      entityId: product.id,
      entityName: product.name,
    });

    return jsonOk(product, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
