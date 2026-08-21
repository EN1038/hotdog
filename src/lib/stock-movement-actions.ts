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
import {
  isBangkokDateKey,
  startOfBangkokDayFromKey,
} from "@/lib/constants";
import { assertBrandWriteAllowedByBrandId } from "@/lib/brand-plan";

import {
  stockDocumentNoSchema,
  validateStockDocumentNo,
} from "@/lib/stock-document-no";
import {
  encodeMovementImages,
  MAX_STOCK_MOVEMENT_IMAGES,
} from "@/lib/stock-movement-images";

const docNoField = stockDocumentNoSchema;

function parseOptionalDayOrIso(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (isBangkokDateKey(s)) return startOfBangkokDayFromKey(s);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const stockMovementSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("receive"),
    brandProductId: z.string().min(1),
    quantity: z.number().int().positive(),
    documentNo: docNoField,
    note: z.string().trim().max(300).nullable().optional(),
    unitCost: z.number().min(0).nullable().optional(),
    supplier: z.string().trim().max(120).nullable().optional(),
    lotNumber: z.string().trim().max(64).nullable().optional(),
    /** ISO datetime or YYYY-MM-DD */
    expiresAt: z.string().min(1).nullable().optional(),
    /** วันผลิต YYYY-MM-DD — เก็บเป็น receivedAt ของล็อต */
    producedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  }),
  z.object({
    action: z.literal("receive_batch"),
    documentNo: docNoField,
    note: z.string().trim().max(300).nullable().optional(),
    producedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    expiresAt: z.string().min(1).nullable().optional(),
    lines: z
      .array(
        z.object({
          brandProductId: z.string().min(1),
          quantity: z.number().int().positive(),
        }),
      )
      .min(1),
  }),
  z.object({
    action: z.literal("out_batch"),
    kind: z.enum(["transfer", "direct", "waste", "sale", "other"]),
    documentNo: docNoField,
    note: z.string().trim().max(300).nullable().optional(),
    branchId: z.string().min(1).optional(),
    autoReceive: z.boolean().optional(),
    stockLocationId: z.string().min(1).optional(),
    imageUrls: z
      .array(z.string().trim().min(1).max(2000))
      .max(MAX_STOCK_MOVEMENT_IMAGES)
      .optional(),
    lines: z
      .array(
        z.object({
          brandProductId: z.string().min(1),
          quantity: z.number().int().positive(),
        }),
      )
      .min(1),
  }),
  z.object({
    action: z.literal("stock_in"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    documentNo: docNoField,
    note: z.string().trim().max(300).nullable().optional(),
    unitCost: z.number().min(0).nullable().optional(),
    supplier: z.string().trim().max(120).nullable().optional(),
    lotNumber: z.string().trim().max(64).nullable().optional(),
    expiresAt: z.string().min(1).nullable().optional(),
    producedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  }),
  z.object({
    action: z.literal("transfer"),
    brandProductId: z.string().min(1),
    branchId: z.string().min(1),
    sourceLocationId: z.string().optional().nullable(),
    quantity: z.number().int().positive(),
    documentNo: docNoField,
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
    documentNo: docNoField,
    note: z.string().trim().max(300).nullable().optional(),
    reason: z.string().trim().max(200).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
  }),
  z.object({
    action: z.literal("lost"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    documentNo: docNoField,
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
    documentNo: docNoField,
    note: z.string().trim().max(300).nullable().optional(),
    reason: z.string().trim().max(200).nullable().optional(),
  }),
  z.object({
    action: z.literal("sale"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    documentNo: docNoField,
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("direct"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    documentNo: docNoField,
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("issue"),
    brandProductId: z.string().min(1),
    stockLocationId: z.string().min(1),
    quantity: z.number().int().positive(),
    documentNo: docNoField,
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
  await assertBrandWriteAllowedByBrandId(brandId);
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) throw new StockError("ไม่พบแบรนด์", 404);
  if (!brand.stockEnabled) {
    throw new StockError("ยังไม่ได้เปิดระบบสต๊อกของแบรนด์นี้");
  }

  const documentNo =
    "documentNo" in body && body.documentNo
      ? await validateStockDocumentNo({
          documentNo: body.documentNo,
          action:
            body.action === "receive_batch"
              ? "receive"
              : body.action === "out_batch"
                ? "issue"
                : body.action,
        })
      : null;

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
        expiresAt: parseOptionalDayOrIso(body.expiresAt),
        receivedAt: parseOptionalDayOrIso(body.producedAt),
        documentNo,
        ...actor,
      }),
    };
  }
  if (body.action === "receive_batch") {
    const warehouse = await ensureWarehouseLocation(brandId);
    const movements = [];
    for (const line of body.lines) {
      movements.push(
        await stockInWithLot({
          brandId,
          stockLocationId: warehouse.id,
          brandProductId: line.brandProductId,
          quantity: line.quantity,
          note: body.note,
          expiresAt: parseOptionalDayOrIso(body.expiresAt),
          receivedAt: parseOptionalDayOrIso(body.producedAt),
          documentNo,
          ...actor,
        }),
      );
    }
    return { brand, movement: movements };
  }
  if (body.action === "out_batch") {
    const warehouse = await ensureWarehouseLocation(brandId);
    const loc = body.stockLocationId?.trim() || warehouse.id;
    if (body.kind === "transfer" && !body.branchId) {
      throw new StockError("เลือกสาขาปลายทาง");
    }
    const imageUrl = encodeMovementImages(body.imageUrls ?? []);
    const movements = [];
    for (const line of body.lines) {
      if (body.kind === "transfer") {
        movements.push(
          await transferWarehouseToBranch({
            brandId,
            branchId: body.branchId!,
            brandProductId: line.brandProductId,
            quantity: line.quantity,
            note: body.note,
            autoReceive: body.autoReceive,
            documentNo,
            imageUrl,
            ...actor,
          }),
        );
        continue;
      }
      if (body.kind === "waste") {
        movements.push(
          await stockOutbound({
            brandId,
            stockLocationId: loc,
            brandProductId: line.brandProductId,
            quantity: line.quantity,
            type: "WASTE",
            note: body.note,
            documentNo,
            imageUrl,
            ...actor,
          }),
        );
        continue;
      }
      if (body.kind === "sale") {
        movements.push(
          await stockOutbound({
            brandId,
            stockLocationId: loc,
            brandProductId: line.brandProductId,
            quantity: line.quantity,
            type: "SALE",
            note: body.note,
            documentNo,
            imageUrl,
            ...actor,
          }),
        );
        continue;
      }
      movements.push(
        await stockOutbound({
          brandId,
          stockLocationId: loc,
          brandProductId: line.brandProductId,
          quantity: line.quantity,
          type: "ISSUE",
          note:
            body.kind === "direct"
              ? body.note?.trim()
                ? `ส่งตรง — ${body.note.trim()}`
                : "ส่งตรง"
              : body.note,
          documentNo,
          imageUrl,
          ...actor,
        }),
      );
    }
    return { brand, movement: movements };
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
        expiresAt: parseOptionalDayOrIso(body.expiresAt),
        receivedAt: parseOptionalDayOrIso(body.producedAt),
        documentNo,
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
        documentNo,
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
        documentNo,
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
        documentNo,
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
        documentNo,
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
        documentNo,
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
      documentNo,
      ...actor,
    }),
  };
}

export function stockMovementActivityAction(action: StockMovementBody["action"]) {
  if (action === "receive_batch") return "brand.stock.receive" as const;
  if (action === "out_batch") return "brand.stock.issue" as const;
  if (action === "produce") return "brand.stock.produce" as const;
  if (action === "waste") return "brand.stock.waste" as const;
  if (action === "sale") return "brand.stock.sale" as const;
  if (action === "direct") return "brand.stock.issue" as const;
  return `brand.stock.${action}` as "brand.stock.receive";
}
