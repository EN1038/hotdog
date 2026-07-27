import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  completeStockCount,
  StockError,
  updateStockCountLines,
} from "@/lib/stock";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  lines: z
    .array(
      z.object({
        brandProductId: z.string(),
        countedQty: z.number().int().min(0),
        note: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .optional(),
  complete: z.boolean().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    const count = await prisma.stockCount.findFirst({
      where: { id, branchId: session.branchId },
      include: {
        lines: {
          include: { product: true },
          orderBy: { product: { name: "asc" } },
        },
      },
    });
    if (!count) return jsonError("ไม่พบรอบตรวจนับ", 404);
    return jsonOk(count);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    if (!session.staffId) return jsonError("ไม่พบข้อมูลพนักงาน", 401);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.stockCount.findFirst({
      where: { id, branchId: session.branchId },
    });
    if (!existing) return jsonError("ไม่พบรอบตรวจนับ", 404);

    if (body.lines?.length) {
      await updateStockCountLines({
        countId: id,
        brandId: existing.brandId,
        lines: body.lines,
      });
    }

    if (body.complete) {
      const completed = await completeStockCount({
        countId: id,
        brandId: existing.brandId,
        staffId: session.staffId,
      });
      return jsonOk(completed);
    }

    const count = await prisma.stockCount.findFirst({
      where: { id, branchId: session.branchId },
      include: {
        lines: {
          include: { product: true },
          orderBy: { product: { name: "asc" } },
        },
      },
    });
    return jsonOk(count);
  } catch (error) {
    if (error instanceof StockError) {
      return jsonError(error.message, error.status);
    }
    return handleApiError(error);
  }
}
