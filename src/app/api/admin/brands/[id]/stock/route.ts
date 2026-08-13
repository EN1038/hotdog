import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { getStockDashboard, setBrandStockEnabled, StockError } from "@/lib/stock";
import { canBrandAdminEnableStock } from "@/lib/brand-plan";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  stockEnabled: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);

    const brand = await prisma.brand.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        stockEnabled: true,
        allowNegativeStock: true,
      },
    });
    if (!brand) return jsonError("ไม่พบแบรนด์", 404);

    let warehouses = await prisma.stockLocation.findMany({
      where: { brandId: id, type: "WAREHOUSE" },
      include: {
        balances: {
          include: { product: true },
          orderBy: { product: { name: "asc" } },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (warehouses.length === 0) {
      const { ensureWarehouseLocation } = await import("@/lib/stock");
      await ensureWarehouseLocation(id);
      warehouses = await prisma.stockLocation.findMany({
        where: { brandId: id, type: "WAREHOUSE" },
        include: {
          balances: {
            include: { product: true },
            orderBy: { product: { name: "asc" } },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    }

    const warehouse = warehouses[0] ?? null;

    const [products, branches, pendingTransfers, completedTransfers, dashboard, locations] =
      await Promise.all([
        prisma.brandProduct.findMany({
          where: { brandId: id },
          orderBy: [{ stockType: "asc" }, { name: "asc" }],
        }),
        prisma.branch.findMany({
          where: { brandId: id },
          select: {
            id: true,
            name: true,
            code: true,
            stockEnabled: true,
          },
          orderBy: { name: "asc" },
        }),
        prisma.stockTransfer.findMany({
          where: { brandId: id, status: "PENDING" },
          include: {
            product: { select: { id: true, name: true, unit: true } },
            branch: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
        prisma.stockTransfer.findMany({
          where: { brandId: id, status: "RECEIVED" },
          include: {
            product: { select: { id: true, name: true, unit: true } },
            branch: { select: { id: true, name: true } },
            receivedByStaff: { select: { id: true, name: true } },
          },
          orderBy: { receivedAt: "desc" },
          take: 50,
        }),
        brand.stockEnabled ? getStockDashboard(id) : null,
        prisma.stockLocation.findMany({
          where: { brandId: id },
          select: {
            id: true,
            name: true,
            type: true,
            branchId: true,
          },
          orderBy: { name: "asc" },
        }),
      ]);

    const recentMovements = await prisma.stockMovement.findMany({
      where: { brandId: id },
      include: {
        product: { select: { id: true, name: true, unit: true, stockType: true } },
        fromLocation: { select: { id: true, name: true, type: true } },
        toLocation: { select: { id: true, name: true, type: true } },
        stockLocation: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });

    return jsonOk({
      brand,
      warehouse,
      warehouses,
      products,
      branches,
      locations,
      pendingTransfers,
      completedTransfers,
      recentMovements,
      dashboard,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireBrandAccess(id);
    const body = patchSchema.parse(await request.json());

    if (body.stockEnabled !== undefined) {
      if (body.stockEnabled === true && !session.isPlatformAdmin) {
        const current = await prisma.brand.findUnique({
          where: { id },
          select: { plan: true },
        });
        if (current?.plan && !canBrandAdminEnableStock(current.plan)) {
          return jsonError(
            "แพ็กนี้ยังไม่เปิดสต็อก — อัปเกรดเป็น Multi หรือติดต่อแพลตฟอร์ม",
            403,
          );
        }
      }
      await setBrandStockEnabled({
        brandId: id,
        enabled: body.stockEnabled,
      });
    }

    const brand = await prisma.brand.update({
      where: { id },
      data: {
        ...(body.allowNegativeStock !== undefined && {
          allowNegativeStock: body.allowNegativeStock,
        }),
      },
    });

    await logAdminActivity(session, {
      action:
        body.stockEnabled === true
          ? "brand.stock.enable"
          : body.stockEnabled === false
            ? "brand.stock.disable"
            : "brand.stock.settings",
      summary: `ตั้งค่าสต๊อกแบรนด์ ${brand.name}`,
      brandId: brand.id,
      brandName: brand.name,
      entityType: "brand",
      entityId: brand.id,
      entityName: brand.name,
      metadata: body,
    });

    return jsonOk(brand);
  } catch (error) {
    if (error instanceof StockError) {
      return jsonError(error.message, error.status);
    }
    return handleApiError(error);
  }
}
