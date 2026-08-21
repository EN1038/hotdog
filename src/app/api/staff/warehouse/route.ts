import { ensureWarehouseBranch, requireWarehouseStaff } from "@/lib/warehouse-branch";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  excludePromoBrandProducts,
  loadPromoBrandProductIds,
} from "@/lib/brand-product-promo";
import { enrichBrandProductsWithMenuOrder } from "@/lib/staff-menu-order";
import { loadBrandProductMenuOrderMap } from "@/lib/brand-product-menu-order";

/** GET — สต๊อกกลาง payload for warehouse-branch staff */
export async function GET() {
  try {
    const { brandId } = await requireWarehouseStaff();
    await ensureWarehouseBranch(brandId);

    const [
      brand,
      warehouse,
      productsRaw,
      storeBranches,
      recentMovements,
      warehouseBranch,
      menuOrderMap,
      promoProductIds,
    ] = await Promise.all([
      prisma.brand.findUnique({
        where: { id: brandId },
        select: { id: true, name: true, stockEnabled: true },
      }),
      prisma.stockLocation.findFirst({
        where: { brandId, type: "WAREHOUSE" },
        include: {
          balances: {
            include: { product: true },
            orderBy: { product: { name: "asc" } },
          },
        },
      }),
      prisma.brandProduct.findMany({
        where: { brandId },
        orderBy: [{ stockType: "asc" }, { name: "asc" }],
      }),
      prisma.branch.findMany({
        where: { brandId, kind: "STORE" },
        select: { id: true, name: true, code: true, stockEnabled: true },
        orderBy: { name: "asc" },
      }),
      prisma.stockMovement.findMany({
        where: { brandId },
        include: {
          product: {
            select: { id: true, name: true, unit: true, stockType: true },
          },
          fromLocation: { select: { id: true, name: true, type: true } },
          toLocation: { select: { id: true, name: true, type: true } },
          stockLocation: { select: { id: true, name: true, type: true } },
          createdByStaff: { select: { id: true, name: true } },
          createdByAdmin: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 80,
      }),
      prisma.branch.findFirst({
        where: { brandId, kind: "WAREHOUSE" },
        select: {
          id: true,
          name: true,
          warehouseIssueMode: true,
          warehouseAllowedBranchIds: true,
        },
      }),
      loadBrandProductMenuOrderMap(brandId),
      loadPromoBrandProductIds(brandId),
    ]);

    const products = enrichBrandProductsWithMenuOrder(
      excludePromoBrandProducts(productsRaw, promoProductIds),
      menuOrderMap,
    );

    return jsonOk({
      brand,
      warehouse,
      warehouseBranch,
      products,
      branches: storeBranches,
      recentMovements,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
