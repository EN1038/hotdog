import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { getStockDashboard, setBrandStockEnabled, StockError } from "@/lib/stock";
import { ensureWarehouseBranch } from "@/lib/warehouse-branch";
import {
  excludePromoBrandProducts,
  loadPromoBrandProductIds,
} from "@/lib/brand-product-promo";
import { enrichBrandProductsWithMenuOrder } from "@/lib/staff-menu-order";
import { loadBrandProductMenuOrderMap } from "@/lib/brand-product-menu-order";
import { assertBrandWriteAllowedByBrandId } from "@/lib/brand-plan";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  stockEnabled: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
  /** Orange alert: age ≥ N days (default 2) */
  stockAgingWarnDays: z.number().int().min(0).max(30).optional(),
  /** Red alert: age ≥ N days or near/expired (default 3) */
  stockAgingCriticalDays: z.number().int().min(0).max(30).optional(),
  warehouseName: z.string().trim().min(1).max(80).optional(),
  warehouseIssueMode: z.enum(["TRANSFER", "ISSUE", "BOTH"]).optional(),
  warehouseAllowedBranchIds: z.array(z.string().min(1)).optional(),
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
        stockAgingWarnDays: true,
        stockAgingCriticalDays: true,
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

    const [productsRaw, branches, pendingTransfers, completedTransfers, dashboard, locations, menuOrderMap, promoProductIds] =
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
            kind: true,
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
        loadBrandProductMenuOrderMap(id),
        loadPromoBrandProductIds(id),
      ]);

    const products = enrichBrandProductsWithMenuOrder(
      excludePromoBrandProducts(productsRaw, promoProductIds),
      menuOrderMap,
    );

    if (brand.stockEnabled) {
      await ensureWarehouseBranch(id);
    }

    const warehouseBranch = await prisma.branch.findFirst({
      where: { brandId: id, kind: "WAREHOUSE" },
      select: {
        id: true,
        name: true,
        code: true,
        kind: true,
        warehouseIssueMode: true,
        warehouseAllowedBranchIds: true,
        stockEnabled: true,
      },
    });
    const storeBranches = branches.filter((b) => b.kind !== "WAREHOUSE");

    const recentMovements = await prisma.stockMovement.findMany({
      where: { brandId: id },
      include: {
        product: { select: { id: true, name: true, unit: true, stockType: true } },
        fromLocation: { select: { id: true, name: true, type: true } },
        toLocation: { select: { id: true, name: true, type: true } },
        stockLocation: { select: { id: true, name: true, type: true } },
        createdByStaff: { select: { id: true, name: true } },
        createdByAdmin: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    });

    return jsonOk({
      brand,
      warehouse,
      warehouses,
      warehouseBranch,
      products,
      branches: storeBranches,
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
    await assertBrandWriteAllowedByBrandId(id);

    if (body.stockEnabled !== undefined) {
      await setBrandStockEnabled({
        brandId: id,
        enabled: body.stockEnabled,
      });
    }

    if (
      body.warehouseName ||
      body.warehouseIssueMode ||
      body.warehouseAllowedBranchIds
    ) {
      const hq = await ensureWarehouseBranch(id);
      const nextName = body.warehouseName?.trim();
      await prisma.branch.update({
        where: { id: hq.id },
        data: {
          ...(nextName ? { name: nextName } : {}),
          ...(body.warehouseIssueMode
            ? { warehouseIssueMode: body.warehouseIssueMode }
            : {}),
          ...(body.warehouseAllowedBranchIds
            ? { warehouseAllowedBranchIds: body.warehouseAllowedBranchIds }
            : {}),
          stockEnabled: true,
          isHidden: true,
        },
      });
      if (nextName) {
        await prisma.stockLocation.updateMany({
          where: { brandId: id, type: "WAREHOUSE", branchId: hq.id },
          data: { name: nextName },
        });
      }
    }

    const existingBrand = await prisma.brand.findUnique({
      where: { id },
      select: {
        stockAgingWarnDays: true,
        stockAgingCriticalDays: true,
      },
    });
    const nextWarn =
      body.stockAgingWarnDays ??
      existingBrand?.stockAgingWarnDays ??
      3;
    const nextCritical =
      body.stockAgingCriticalDays ??
      existingBrand?.stockAgingCriticalDays ??
      5;
    if (
      (body.stockAgingWarnDays !== undefined ||
        body.stockAgingCriticalDays !== undefined) &&
      nextCritical < nextWarn
    ) {
      return jsonError("เกณฑ์แดงต้องไม่น้อยกว่าเกณฑ์ส้ม");
    }

    const brand = await prisma.brand.update({
      where: { id },
      data: {
        ...(body.allowNegativeStock !== undefined && {
          allowNegativeStock: body.allowNegativeStock,
        }),
        ...(body.stockAgingWarnDays !== undefined && {
          stockAgingWarnDays: body.stockAgingWarnDays,
        }),
        ...(body.stockAgingCriticalDays !== undefined && {
          stockAgingCriticalDays: body.stockAgingCriticalDays,
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
