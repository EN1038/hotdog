import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  completeStockCount,
  StockError,
  updateStockCountLines,
} from "@/lib/stock";

type Params = { params: Promise<{ id: string; countId: string }> };

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
    const { id, countId } = await params;
    await requireBrandAccess(id);
    const count = await prisma.stockCount.findFirst({
      where: { id: countId, brandId: id },
      include: {
        location: true,
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
    const { id, countId } = await params;
    const session = await requireBrandAccess(id);
    const body = patchSchema.parse(await request.json());

    if (body.lines?.length) {
      await updateStockCountLines({
        countId,
        brandId: id,
        lines: body.lines,
      });
    }

    if (body.complete) {
      const completed = await completeStockCount({
        countId,
        brandId: id,
        adminId: session.adminId,
      });
      const brand = await prisma.brand.findUnique({ where: { id } });
      await logAdminActivity(session, {
        action: "brand.stock.count.complete",
        summary: `ปิดรอบตรวจนับ ${completed.name}`,
        brandId: id,
        brandName: brand?.name ?? null,
        entityType: "stockCount",
        entityId: completed.id,
        entityName: completed.name,
      });
      return jsonOk(completed);
    }

    const count = await prisma.stockCount.findFirst({
      where: { id: countId, brandId: id },
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
