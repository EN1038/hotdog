import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { setProductRecipe, StockError } from "@/lib/stock-advanced";
import { transferBranchToBranch } from "@/lib/stock-advanced";
import {
  exportMovementsForAccounting,
  getReorderForecast,
} from "@/lib/stock-advanced";
import { cancelStockTransfer } from "@/lib/stock";
import { logAdminActivity } from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "forecast";

    if (view === "forecast") {
      const days = Math.min(Number(url.searchParams.get("days") ?? 14), 90);
      return jsonOk(await getReorderForecast(id, days));
    }

    if (view === "lots") {
      const lots = await prisma.stockLot.findMany({
        where: { brandId: id, quantity: { gt: 0 } },
        include: {
          product: { select: { id: true, name: true, unit: true } },
          location: { select: { id: true, name: true, type: true } },
        },
        orderBy: [{ expiresAt: "asc" }, { lotNumber: "asc" }],
        take: 200,
      });
      return jsonOk(lots);
    }

    if (view === "recipes") {
      const products = await prisma.brandProduct.findMany({
        where: { brandId: id },
        select: {
          id: true,
          name: true,
          stockType: true,
          recipeLines: {
            include: {
              component: {
                select: { id: true, name: true, unit: true, stockType: true },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      });
      return jsonOk(products.filter((p) => p.recipeLines.length > 0 || true));
    }

    if (view === "accounting") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (!from || !to) return jsonError("ต้องระบุ from/to (ISO date)");
      const csv = await exportMovementsForAccounting({
        brandId: id,
        from: new Date(from),
        to: new Date(to),
      });
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="stock-movements-${id}.csv"`,
        },
      });
    }

    return jsonError("view ไม่รองรับ");
  } catch (error) {
    return handleApiError(error);
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("recipe"),
    parentProductId: z.string(),
    lines: z.array(
      z.object({
        componentProductId: z.string(),
        quantityPerUnit: z.number().positive(),
        note: z.string().trim().max(200).nullable().optional(),
      }),
    ),
  }),
  z.object({
    action: z.literal("branch_transfer"),
    sourceBranchId: z.string(),
    destinationBranchId: z.string(),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    lotNumber: z.string().trim().max(64).nullable().optional(),
  }),
  z.object({
    action: z.literal("cancel_transfer"),
    transferId: z.string(),
  }),
]);

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireBrandAccess(id);
    const body = postSchema.parse(await request.json());

    if (body.action === "recipe") {
      const lines = await setProductRecipe({
        brandId: id,
        parentProductId: body.parentProductId,
        lines: body.lines,
      });
      return jsonOk(lines);
    }

    if (body.action === "branch_transfer") {
      const transfer = await transferBranchToBranch({
        brandId: id,
        sourceBranchId: body.sourceBranchId,
        destinationBranchId: body.destinationBranchId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        lotNumber: body.lotNumber,
        adminId: session.adminId,
      });
      const brand = await prisma.brand.findUnique({ where: { id } });
      await logAdminActivity(session, {
        action: "brand.stock.branch_transfer",
        summary: `โอนสาขา→สาขา ×${body.quantity}`,
        brandId: id,
        brandName: brand?.name ?? null,
        branchId: body.destinationBranchId,
        entityType: "stockTransfer",
        entityId: transfer.id,
      });
      return jsonOk(transfer, 201);
    }

    await cancelStockTransfer({
      transferId: body.transferId,
      brandId: id,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, error.status);
    return handleApiError(error);
  }
}
