import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  adjustStock,
  ensureWarehouseLocation,
  StockError,
  stockOutbound,
  transferWarehouseToBranch,
} from "@/lib/stock";
import {
  stockInWithLot,
  transferBranchToBranch,
} from "@/lib/stock-advanced";

export const stockMovementSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("receive"),
    brandProductId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    unitCost: z.number().min(0).nullable().optional(),
    supplier: z.string().trim().max(120).nullable().optional(),
    lotNumber: z.string().trim().max(64).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  }),
  z.object({
    action: z.literal("stock_in"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    unitCost: z.number().min(0).nullable().optional(),
    supplier: z.string().trim().max(120).nullable().optional(),
    lotNumber: z.string().trim().max(64).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  }),
  z.object({
    action: z.literal("transfer"),
    brandProductId: z.string().min(1),
    branchId: z.string().min(1),
    sourceLocationId: z.string().optional().nullable(),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    autoReceive: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("branch_transfer"),
    brandProductId: z.string().min(1),
    sourceBranchId: z.string().min(1),
    destinationBranchId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    lotNumber: z.string().trim().max(64).nullable().optional(),
  }),
  z.object({
    action: z.literal("adjust"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().min(0),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("damage"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    reason: z.string().trim().max(200).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
  }),
  z.object({
    action: z.literal("lost"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    reason: z.string().trim().max(200).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
  }),
  z.object({
    action: z.literal("produce"),
    brandProductId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("waste"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
    reason: z.string().trim().max(200).nullable().optional(),
  }),
  z.object({
    action: z.literal("sale"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("direct"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("issue"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
]);

export type StockMovementBody = z.infer<typeof stockMovementSchema>;

type Actor = { adminId?: string | null; staffId?: string | null };

export async function applyBrandStockMovement(input: {
  brandId: string;
  body: StockMovementBody;
  actor: Actor;
}) {
  const { brandId, body, actor } = input;
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) throw new StockError("ไม่พบแบรนด์", 404);
  if (!brand.stockEnabled) {
    throw new StockError("ยังไม่ได้เปิดระบบสต๊อกของแบรนด์นี้");
  }

  if (body.action === "receive") {
    const warehouse = await ensureWarehouseLocation(brandId);
    return {
      brand,
      movement: await stockInWithLot({
        brandId,
        stockLocationId: warehouse.id,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        unitCost: body.unitCost,
        supplier: body.supplier,
        lotNumber: body.lotNumber,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        ...actor,
      }),
    };
  }
  if (body.action === "stock_in") {
    return {
      brand,
      movement: await stockInWithLot({
        brandId,
        stockLocationId: body.stockLocationId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        unitCost: body.unitCost,
        supplier: body.supplier,
        lotNumber: body.lotNumber,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        ...actor,
      }),
    };
  }
  if (body.action === "transfer") {
    return {
      brand,
      movement: await transferWarehouseToBranch({
        brandId,
        branchId: body.branchId,
        brandProductId: body.brandProductId,
        sourceLocationId: body.sourceLocationId,
        quantity: body.quantity,
        note: body.note,
        autoReceive: body.autoReceive,
        ...actor,
      }),
    };
  }
  if (body.action === "branch_transfer") {
    return {
      brand,
      movement: await transferBranchToBranch({
        brandId,
        sourceBranchId: body.sourceBranchId,
        destinationBranchId: body.destinationBranchId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        lotNumber: body.lotNumber,
        ...actor,
      }),
    };
  }
  if (body.action === "adjust") {
    return {
      brand,
      movement: await adjustStock({
        brandId,
        stockLocationId: body.stockLocationId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note,
        ...actor,
      }),
    };
  }
  if (body.action === "damage" || body.action === "lost") {
    return {
      brand,
      movement: await stockOutbound({
        brandId,
        stockLocationId: body.stockLocationId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        type: body.action === "damage" ? "DAMAGE" : "LOST",
        note: body.note,
        reason: body.reason,
        imageUrl: body.imageUrl,
        ...actor,
      }),
    };
  }
  if (body.action === "produce") {
    const warehouse = await ensureWarehouseLocation(brandId);
    return {
      brand,
      movement: await stockInWithLot({
        brandId,
        stockLocationId: warehouse.id,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        note: body.note?.trim()
          ? `เสียบไม้ — ${body.note.trim()}`
          : "เสียบไม้เข้าสต๊อกกลาง",
        ...actor,
      }),
    };
  }
  if (body.action === "waste") {
    return {
      brand,
      movement: await stockOutbound({
        brandId,
        stockLocationId: body.stockLocationId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        type: "WASTE",
        note: body.note,
        reason: body.reason,
        ...actor,
      }),
    };
  }
  if (body.action === "sale") {
    return {
      brand,
      movement: await stockOutbound({
        brandId,
        stockLocationId: body.stockLocationId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        type: "SALE",
        note: body.note,
        ...actor,
      }),
    };
  }
  if (body.action === "direct") {
    return {
      brand,
      movement: await stockOutbound({
        brandId,
        stockLocationId: body.stockLocationId,
        brandProductId: body.brandProductId,
        quantity: body.quantity,
        type: "ISSUE",
        note: body.note?.trim()
          ? `ส่งตรง — ${body.note.trim()}`
          : "ส่งตรง",
        ...actor,
      }),
    };
  }
  return {
    brand,
    movement: await stockOutbound({
      brandId,
      stockLocationId: body.stockLocationId,
      brandProductId: body.brandProductId,
      quantity: body.quantity,
      type: "ISSUE",
      note: body.note,
      ...actor,
    }),
  };
}

export function stockMovementActivityAction(action: StockMovementBody["action"]) {
  if (action === "produce") return "brand.stock.produce" as const;
  if (action === "waste") return "brand.stock.waste" as const;
  if (action === "sale") return "brand.stock.sale" as const;
  if (action === "direct") return "brand.stock.issue" as const;
  return `brand.stock.${action}` as "brand.stock.receive";
}
