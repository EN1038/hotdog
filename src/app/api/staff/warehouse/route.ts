import { ensureWarehouseBranch, requireWarehouseStaff } from "@/lib/warehouse-branch";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

/** GET — สต๊อกกลาง payload for warehouse-branch staff */
export async function GET() {
  try {
    const { brandId } = await requireWarehouseStaff();
    await ensureWarehouseBranch(brandId);

    const [brand, warehouse, products, storeBranches, recentMovements, warehouseBranch] =
      await Promise.all([
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
            product: { select: { id: true, name: true, unit: true, stockType: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
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
      ]);

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
