import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { StockError } from "@/lib/stock";
import {
  createBranchStockRequest,
  listBranchStockRequests,
} from "@/lib/kitchen";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";

const postSchema = z.object({
  brandProductId: z.string().min(1),
  quantityRequested: z.number().int().positive(),
  note: z.string().trim().max(300).nullable().optional(),
});

export async function GET() {
  try {
    const session = await requireStaff();
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, brandId: true },
    });
    if (!branch?.brandId) {
      return jsonError("สาขานี้ยังไม่ผูกแบรนด์", 400);
    }

    const [requests, products] = await Promise.all([
      listBranchStockRequests(branch.brandId, { branchId: branch.id }),
      prisma.brandProduct.findMany({
        where: {
          brandId: branch.brandId,
          isActive: true,
          stockType: "SALE_ITEM",
        },
        select: { id: true, name: true, unit: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return jsonOk({ requests, products });
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, error.status);
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    await assertBrandWriteAllowedByBranchId(session.branchId);
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, brandId: true, stockEnabled: true },
    });
    if (!branch?.brandId) {
      return jsonError("สาขานี้ยังไม่ผูกแบรนด์", 400);
    }

    const body = postSchema.parse(await request.json());
    const req = await createBranchStockRequest({
      brandId: branch.brandId,
      branchId: branch.id,
      brandProductId: body.brandProductId,
      quantityRequested: body.quantityRequested,
      note: body.note,
      staffId: session.staffId,
    });
    return jsonOk(req, 201);
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, error.status);
    return handleApiError(error);
  }
}
