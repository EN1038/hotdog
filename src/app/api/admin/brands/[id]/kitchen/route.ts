import { z } from "zod";
import { BranchStockRequestStatus } from "@prisma/client";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { StockError } from "@/lib/stock";
import {
  createBranchStockRequest,
  estimateFinishedUnitCost,
  fulfillBranchStockRequest,
  getKitchenOverview,
  getProductionDemandPlan,
  listBranchStockRequests,
  listKitchenProductions,
  previewKitchenProduction,
  rejectBranchStockRequest,
  runKitchenProduction,
} from "@/lib/kitchen";
import { transferWarehouseToBranch } from "@/lib/stock";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "overview";

    if (view === "overview") {
      return jsonOk(await getKitchenOverview(id));
    }
    if (view === "productions") {
      return jsonOk(await listKitchenProductions(id));
    }
    if (view === "requests") {
      const statusRaw = url.searchParams.get("status");
      const allowed = Object.values(BranchStockRequestStatus) as string[];
      const status =
        statusRaw && allowed.includes(statusRaw)
          ? (statusRaw as BranchStockRequestStatus)
          : undefined;
      return jsonOk(
        await listBranchStockRequests(id, {
          status,
        }),
      );
    }
    if (view === "plan") {
      return jsonOk(await getProductionDemandPlan(id));
    }
    if (view === "preview") {
      const finishedProductId = url.searchParams.get("finishedProductId");
      const qty = Number(url.searchParams.get("qty") ?? 0);
      const waste = Number(url.searchParams.get("waste") ?? 0);
      if (!finishedProductId) return jsonError("ต้องระบุ finishedProductId");
      return jsonOk(
        await previewKitchenProduction({
          brandId: id,
          finishedProductId,
          quantityProduced: qty,
          quantityWasted: waste,
        }),
      );
    }
    if (view === "unit-cost") {
      const productId = url.searchParams.get("productId");
      if (!productId) return jsonError("ต้องระบุ productId");
      return jsonOk(await estimateFinishedUnitCost(id, productId));
    }

    return jsonError("view ไม่รองรับ");
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, error.status);
    return handleApiError(error);
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("produce"),
    finishedProductId: z.string().min(1),
    quantityProduced: z.number().int().min(0),
    quantityWasted: z.number().int().min(0).optional(),
    note: z.string().trim().max(300).nullable().optional(),
    lotNumber: z.string().trim().max(64).nullable().optional(),
    useLots: z.boolean().optional(),
    componentUsage: z
      .array(
        z.object({
          brandProductId: z.string(),
          quantityUsed: z.number().int().min(0),
        }),
      )
      .optional(),
  }),
  z.object({
    action: z.literal("request_create"),
    branchId: z.string().min(1),
    brandProductId: z.string().min(1),
    quantityRequested: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("request_fulfill"),
    requestId: z.string().min(1),
    quantity: z.number().int().positive().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("request_reject"),
    requestId: z.string().min(1),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("ship"),
    branchId: z.string().min(1),
    brandProductId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
]);

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireBrandAccess(id);
    const body = postSchema.parse(await request.json());
    const brand = await prisma.brand.findUnique({ where: { id } });

    if (body.action === "produce") {
      const production = await runKitchenProduction({
        brandId: id,
        finishedProductId: body.finishedProductId,
        quantityProduced: body.quantityProduced,
        quantityWasted: body.quantityWasted,
        note: body.note,
        lotNumber: body.lotNumber,
        useLots: body.useLots,
        componentUsage: body.componentUsage,
        adminId: session.adminId,
      });
      await logAdminActivity(session, {
        action: "brand.kitchen.produce",
        summary: `ผลิต ${production.finishedProduct.name} ×${body.quantityProduced}`,
        brandId: id,
        brandName: brand?.name ?? null,
        entityType: "kitchenProduction",
        entityId: production.id,
        entityName: production.finishedProduct.name,
        metadata: {
          produced: body.quantityProduced,
          waste: body.quantityWasted ?? 0,
        },
      });
      return jsonOk(production, 201);
    }

    if (body.action === "request_create") {
      const req = await createBranchStockRequest({
        brandId: id,
        branchId: body.branchId,
        brandProductId: body.brandProductId,
        quantityRequested: body.quantityRequested,
        note: body.note,
      });
      await logAdminActivity(session, {
        action: "brand.kitchen.request",
        summary: `บันทึกคำขอสาขา ${req.branch.name} · ${req.product.name} ×${body.quantityRequested}`,
        brandId: id,
        brandName: brand?.name ?? null,
        branchId: body.branchId,
        branchName: req.branch.name,
        entityType: "branchStockRequest",
        entityId: req.id,
      });
      return jsonOk(req, 201);
    }

    if (body.action === "request_fulfill") {
      const req = await fulfillBranchStockRequest({
        brandId: id,
        requestId: body.requestId,
        quantity: body.quantity,
        note: body.note,
        adminId: session.adminId,
      });
      await logAdminActivity(session, {
        action: "brand.kitchen.fulfill",
        summary: `จัดส่งตามคำขอ ${req.branch.name} · ${req.product.name}`,
        brandId: id,
        brandName: brand?.name ?? null,
        branchId: req.branch.id,
        branchName: req.branch.name,
        entityType: "branchStockRequest",
        entityId: req.id,
      });
      return jsonOk(req);
    }

    if (body.action === "request_reject") {
      const req = await rejectBranchStockRequest({
        brandId: id,
        requestId: body.requestId,
        note: body.note,
        adminId: session.adminId,
      });
      return jsonOk(req);
    }

    // ship
    const transfer = await transferWarehouseToBranch({
      brandId: id,
      branchId: body.branchId,
      brandProductId: body.brandProductId,
      quantity: body.quantity,
      note: body.note,
      adminId: session.adminId,
    });
    await logAdminActivity(session, {
      action: "brand.stock.transfer",
      summary: `ครัวส่งสาขา ×${body.quantity}`,
      brandId: id,
      brandName: brand?.name ?? null,
      branchId: body.branchId,
      entityType: "stockTransfer",
      entityId: transfer.id,
    });
    return jsonOk(transfer, 201);
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, error.status);
    return handleApiError(error);
  }
}
