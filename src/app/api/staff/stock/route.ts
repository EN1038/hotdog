import { z } from "zod";
import { StockCountType, StockType } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  adjustStock,
  createStockCount,
  isBranchStockActive,
  stockIn,
  stockOutbound,
  StockError,
} from "@/lib/stock";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("stock_in"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    unitCost: z.number().min(0).nullable().optional(),
    supplier: z.string().trim().max(120).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("damage"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    reason: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("lost"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    reason: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("issue"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("adjust"),
    brandProductId: z.string(),
    quantity: z.number().int().min(0),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("count_create"),
    name: z.string().trim().min(1).max(120),
    type: z.nativeEnum(StockCountType).optional(),
    stockTypes: z.array(z.nativeEnum(StockType)).optional(),
  }),
]);

export async function GET() {
  try {
    const session = await requireStaff();
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      include: {
        brand: {
          select: { id: true, stockEnabled: true, allowNegativeStock: true },
        },
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const stockActive = isBranchStockActive({
      brandId: branch.brandId,
      brandStockEnabled: branch.brand?.stockEnabled,
      branchStockEnabled: branch.stockEnabled,
    });

    if (!stockActive || !branch.brandId) {
      return jsonOk({
        stockActive: false,
        pending: [],
        balances: [],
        products: [],
        lowItems: [],
        counts: [],
      });
    }

    const [pending, location, products, counts] = await Promise.all([
      prisma.stockTransfer.findMany({
        where: { branchId: branch.id, status: "PENDING" },
        include: {
          product: { select: { id: true, name: true, unit: true, stockType: true } },
          sourceBranch: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.stockLocation.findFirst({
        where: { branchId: branch.id, type: "BRANCH" },
        include: {
          balances: {
            include: {
              product: true,
            },
            orderBy: { product: { name: "asc" } },
          },
        },
      }),
      prisma.brandProduct.findMany({
        where: { brandId: branch.brandId, isActive: true },
        orderBy: [{ stockType: "asc" }, { name: "asc" }],
      }),
      prisma.stockCount.findMany({
        where: {
          branchId: branch.id,
          status: { in: ["DRAFT", "IN_PROGRESS"] },
        },
        include: {
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const balances = location?.balances ?? [];
    const lowItems = balances.filter((b) => {
      const alert = b.product.lowStockAlert;
      return b.quantity <= 0 || (alert != null && b.quantity <= alert);
    });

    return jsonOk({
      stockActive: true,
      brandId: branch.brandId,
      locationId: location?.id ?? null,
      allowNegativeStock: branch.brand?.allowNegativeStock ?? false,
      pending,
      balances,
      products,
      lowItems,
      counts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    if (!session.staffId) return jsonError("ไม่พบข้อมูลพนักงาน", 401);
    const body = postSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      include: { brand: { select: { id: true, stockEnabled: true } } },
    });
    if (!branch?.brandId) return jsonError("สาขาไม่มีแบรนด์", 400);
    if (
      !isBranchStockActive({
        brandId: branch.brandId,
        brandStockEnabled: branch.brand?.stockEnabled,
        branchStockEnabled: branch.stockEnabled,
      })
    ) {
      return jsonError("สาขานี้ยังไม่ได้เปิดระบบสต๊อก");
    }

    const location = await prisma.stockLocation.findFirst({
      where: { branchId: branch.id, type: "BRANCH" },
    });
    if (!location) return jsonError("ไม่พบตำแหน่งสต๊อกสาขา");

    const actor = { staffId: session.staffId };

    if (body.action === "stock_in") {
      const m = await stockIn({
        brandId: branch.brandId,
        stockLocationId: location.id,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        unitCost: body.unitCost,
        supplier: body.supplier,
        note: body.note,
        ...actor,
      });
      return jsonOk(m, 201);
    }
    if (body.action === "damage" || body.action === "lost") {
      const m = await stockOutbound({
        brandId: branch.brandId,
        stockLocationId: location.id,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        type: body.action === "damage" ? "DAMAGE" : "LOST",
        reason: body.reason,
        note: body.note,
        ...actor,
      });
      return jsonOk(m, 201);
    }
    if (body.action === "issue") {
      const m = await stockOutbound({
        brandId: branch.brandId,
        stockLocationId: location.id,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        type: "ISSUE",
        note: body.note,
        ...actor,
      });
      return jsonOk(m, 201);
    }
    if (body.action === "adjust") {
      const m = await adjustStock({
        brandId: branch.brandId,
        stockLocationId: location.id,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        ...actor,
      });
      return jsonOk(m ?? { ok: true }, 201);
    }

    const count = await createStockCount({
      brandId: branch.brandId,
      stockLocationId: location.id,
      name: body.name,
      type: body.type,
      stockTypes: body.stockTypes,
      ...actor,
    });
    return jsonOk(count, 201);
  } catch (error) {
    if (error instanceof StockError) {
      return jsonError(error.message, error.status);
    }
    return handleApiError(error);
  }
}
