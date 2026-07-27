import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  isBranchStockActive,
  setBranchStockEnabled,
  StockError,
} from "@/lib/stock";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  stockEnabled: z.boolean(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBranchAccess(id);

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        brand: {
          select: { id: true, name: true, code: true, stockEnabled: true },
        },
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const active = isBranchStockActive({
      brandId: branch.brandId,
      brandStockEnabled: branch.brand?.stockEnabled,
      branchStockEnabled: branch.stockEnabled,
    });

    const location = await prisma.stockLocation.findFirst({
      where: { branchId: id, type: "BRANCH" },
      include: {
        balances: {
          include: { product: true },
          orderBy: { product: { name: "asc" } },
        },
      },
    });

    const products = branch.brandId
      ? await prisma.brandProduct.findMany({
          where: { brandId: branch.brandId },
          orderBy: { name: "asc" },
        })
      : [];

    const menuItems = await prisma.branchMenuItem.findMany({
      where: { branchId: id },
      select: {
        id: true,
        name: true,
        brandProductId: true,
        isOutOfStock: true,
        isHidden: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return jsonOk({
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        brandId: branch.brandId,
        stockEnabled: branch.stockEnabled,
        brand: branch.brand,
      },
      stockActive: active,
      location,
      products,
      menuItems,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireBranchAccess(id);
    const body = patchSchema.parse(await request.json());

    const branch = await setBranchStockEnabled({
      branchId: id,
      enabled: body.stockEnabled,
    });

    await logAdminActivity(session, {
      action: body.stockEnabled
        ? "branch.stock.enable"
        : "branch.stock.disable",
      summary: body.stockEnabled
        ? `เปิดระบบสต๊อกสาขา ${branch.name}`
        : `ปิดระบบสต๊อกสาขา ${branch.name}`,
      brandId: branch.brandId,
      brandName: branch.brand?.name ?? null,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "branch",
      entityId: branch.id,
      entityName: branch.name,
    });

    return jsonOk(branch);
  } catch (error) {
    if (error instanceof StockError) {
      return jsonError(error.message, error.status);
    }
    return handleApiError(error);
  }
}
