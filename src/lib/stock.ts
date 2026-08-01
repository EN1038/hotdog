import {
  EquipmentStatus,
  Prisma,
  StockCountStatus,
  StockCountType,
  StockLocationType,
  StockMovementType,
  StockType,
} from "@prisma/client";
import { prisma } from "@/lib/db";

export class StockError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "StockError";
    this.status = status;
  }
}

type Tx = Prisma.TransactionClient;

export const STOCK_TYPE_LABELS: Record<StockType, string> = {
  SALE_ITEM: "สินค้าขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  RECEIVE: "รับเข้า",
  STOCK_IN: "รับเข้า",
  TRANSFER: "โอน/ส่งสาขา",
  SALE: "ขาย",
  FREE: "ของแถม",
  DAMAGE: "เสียหาย",
  LOST: "สูญหาย",
  ADJUST: "ปรับยอด",
  COUNT: "ตรวจนับ",
  RETURN: "คืนสต๊อก",
  ISSUE: "เบิกใช้",
  WASTE: "ของเสีย",
};

export function isBranchStockActive(input: {
  brandId: string | null | undefined;
  brandStockEnabled: boolean | null | undefined;
  branchStockEnabled: boolean | null | undefined;
}) {
  return Boolean(
    input.brandId && input.brandStockEnabled && input.branchStockEnabled,
  );
}

export async function ensureWarehouseLocation(
  brandId: string,
  tx: Tx | typeof prisma = prisma,
) {
  const existing = await tx.stockLocation.findFirst({
    where: { brandId, type: StockLocationType.WAREHOUSE },
  });
  if (existing) return existing;
  return tx.stockLocation.create({
    data: {
      brandId,
      type: StockLocationType.WAREHOUSE,
      name: "บ้านกลาง",
    },
  });
}

export async function ensureBranchStockLocation(
  input: { brandId: string; branchId: string; branchName: string },
  tx: Tx | typeof prisma = prisma,
) {
  const existing = await tx.stockLocation.findFirst({
    where: { branchId: input.branchId },
  });
  if (existing) return existing;
  return tx.stockLocation.create({
    data: {
      brandId: input.brandId,
      branchId: input.branchId,
      type: StockLocationType.BRANCH,
      name: input.branchName,
    },
  });
}

export async function setBrandStockEnabled(input: {
  brandId: string;
  enabled: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const brand = await tx.brand.update({
      where: { id: input.brandId },
      data: { stockEnabled: input.enabled },
    });
    if (input.enabled) {
      await ensureWarehouseLocation(input.brandId, tx);
    } else {
      await tx.branch.updateMany({
        where: { brandId: input.brandId, stockEnabled: true },
        data: { stockEnabled: false },
      });
    }
    return brand;
  });
}

export async function setBranchStockEnabled(input: {
  branchId: string;
  enabled: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({
      where: { id: input.branchId },
      include: { brand: true },
    });
    if (!branch) throw new StockError("ไม่พบสาขา", 404);
    if (!branch.brandId || !branch.brand) {
      throw new StockError("เปิดสต๊อกได้เฉพาะสาขาที่อยู่ใต้แบรนด์เท่านั้น");
    }
    if (input.enabled && !branch.brand.stockEnabled) {
      throw new StockError(
        "ต้องเปิดระบบสต๊อกที่แบรนด์ก่อน แล้วค่อยเปิดที่สาขา",
      );
    }

    const updated = await tx.branch.update({
      where: { id: input.branchId },
      data: { stockEnabled: input.enabled },
      include: { brand: true },
    });

    if (input.enabled) {
      await ensureBranchStockLocation(
        {
          brandId: branch.brandId,
          branchId: branch.id,
          branchName: branch.name,
        },
        tx,
      );
    }

    return updated;
  });
}

async function getOrCreateBalance(
  tx: Tx,
  stockLocationId: string,
  brandProductId: string,
) {
  const existing = await tx.stockBalance.findUnique({
    where: {
      stockLocationId_brandProductId: { stockLocationId, brandProductId },
    },
  });
  if (existing) return existing;
  return tx.stockBalance.create({
    data: { stockLocationId, brandProductId, quantity: 0 },
  });
}

async function readQty(
  tx: Tx,
  stockLocationId: string,
  brandProductId: string,
) {
  const bal = await getOrCreateBalance(tx, stockLocationId, brandProductId);
  return bal.quantity;
}

export async function changeBalance(
  tx: Tx,
  input: {
    stockLocationId: string;
    brandProductId: string;
    delta: number;
    allowNegative?: boolean;
  },
): Promise<{ beforeQty: number; afterQty: number }> {
  const beforeQty = await readQty(
    tx,
    input.stockLocationId,
    input.brandProductId,
  );
  const afterQty = beforeQty + input.delta;

  if (afterQty < 0 && !input.allowNegative) {
    const product = await tx.brandProduct.findUnique({
      where: { id: input.brandProductId },
      select: { name: true },
    });
    throw new StockError(
      `สต๊อกไม่พอ: ${product?.name ?? "สินค้า"} (เหลือ ${beforeQty} ต้องการ ${Math.abs(input.delta)})`,
    );
  }

  if (input.delta < 0 && !input.allowNegative) {
    const need = Math.abs(input.delta);
    const moved = await tx.stockBalance.updateMany({
      where: {
        stockLocationId: input.stockLocationId,
        brandProductId: input.brandProductId,
        quantity: { gte: need },
      },
      data: { quantity: { decrement: need } },
    });
    if (moved.count === 0) {
      throw new StockError(
        `สต๊อกไม่พอ (เหลือ ${beforeQty} ต้องการ ${need})`,
      );
    }
  } else {
    await tx.stockBalance.update({
      where: {
        stockLocationId_brandProductId: {
          stockLocationId: input.stockLocationId,
          brandProductId: input.brandProductId,
        },
      },
      data: { quantity: afterQty },
    });
  }

  return { beforeQty, afterQty };
}

export async function syncMenuOutOfStockForBranchProduct(
  tx: Tx,
  input: { branchId: string; brandProductId: string; quantity: number },
) {
  await tx.branchMenuItem.updateMany({
    where: {
      branchId: input.branchId,
      brandProductId: input.brandProductId,
    },
    data: { isOutOfStock: input.quantity <= 0 },
  });
}

export async function syncAfterBranchQtyChange(
  tx: Tx,
  location: { id: string; type: StockLocationType; branchId: string | null },
  brandProductId: string,
  afterQty: number,
) {
  if (location.type !== StockLocationType.BRANCH || !location.branchId) return;
  const product = await tx.brandProduct.findUnique({
    where: { id: brandProductId },
    select: { stockType: true },
  });
  // Only sale items drive menu sold-out
  if (product?.stockType !== StockType.SALE_ITEM) return;
  await syncMenuOutOfStockForBranchProduct(tx, {
    branchId: location.branchId,
    brandProductId,
    quantity: afterQty,
  });
}

async function brandAllowsNegative(tx: Tx, brandId: string) {
  const brand = await tx.brand.findUnique({
    where: { id: brandId },
    select: { allowNegativeStock: true },
  });
  return Boolean(brand?.allowNegativeStock);
}

type Actor = { adminId?: string | null; staffId?: string | null };

/** Stock in (รับเข้า) to a location — SALE_ITEM / CONSUMABLE / EQUIPMENT */
export async function stockIn(input: {
  brandId: string;
  stockLocationId: string;
  brandProductId: string;
  quantity: number;
  unitCost?: number | null;
  supplier?: string | null;
  note?: string | null;
  receivedAt?: Date | null;
} & Actor) {
  if (input.quantity <= 0) throw new StockError("จำนวนต้องมากกว่า 0");
  if (input.unitCost != null && input.unitCost < 0) {
    throw new StockError("ราคาต้องไม่ติดลบ");
  }

  return prisma.$transaction(async (tx) => {
    const product = await tx.brandProduct.findFirst({
      where: {
        id: input.brandProductId,
        brandId: input.brandId,
        isActive: true,
      },
    });
    if (!product) throw new StockError("ไม่พบสินค้าที่ใช้งานได้", 404);

    const location = await tx.stockLocation.findFirst({
      where: { id: input.stockLocationId, brandId: input.brandId },
    });
    if (!location) throw new StockError("ไม่พบตำแหน่งสต๊อก", 404);

    const { beforeQty, afterQty } = await changeBalance(tx, {
      stockLocationId: location.id,
      brandProductId: product.id,
      delta: input.quantity,
    });
    await syncAfterBranchQtyChange(tx, location, product.id, afterQty);

    const unitCost =
      input.unitCost != null
        ? new Prisma.Decimal(input.unitCost)
        : product.costPrice;
    const totalCost = unitCost
      ? unitCost.mul(input.quantity)
      : null;

    return tx.stockMovement.create({
      data: {
        brandId: input.brandId,
        brandProductId: product.id,
        type: StockMovementType.STOCK_IN,
        quantity: input.quantity,
        beforeQty,
        afterQty,
        unitCost,
        totalCost,
        supplier: input.supplier?.trim() || null,
        stockLocationId: location.id,
        toLocationId: location.id,
        note: input.note?.trim() || null,
        referenceType: "STOCK_IN",
        createdByAdminId: input.adminId ?? null,
        createdByStaffId: input.staffId ?? null,
        createdAt: input.receivedAt ?? undefined,
      },
    });
  });
}

/** @deprecated prefer stockIn — keeps warehouse receive for brand admin */
export async function receiveToWarehouse(input: {
  brandId: string;
  brandProductId: string;
  quantity: number;
  note?: string | null;
  adminId?: string | null;
  unitCost?: number | null;
  supplier?: string | null;
}) {
  const warehouse = await ensureWarehouseLocation(input.brandId);
  return stockIn({
    brandId: input.brandId,
    stockLocationId: warehouse.id,
    brandProductId: input.brandProductId,
    quantity: input.quantity,
    note: input.note,
    adminId: input.adminId,
    unitCost: input.unitCost,
    supplier: input.supplier,
  });
}

export async function transferWarehouseToBranch(input: {
  brandId: string;
  branchId: string;
  brandProductId: string;
  quantity: number;
  note?: string | null;
  adminId?: string | null;
  sourceLocationId?: string | null;
}) {
  if (input.quantity <= 0) throw new StockError("จำนวนต้องมากกว่า 0");

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, brandId: input.brandId },
      include: { brand: true },
    });
    if (!branch) throw new StockError("ไม่พบสาขาในแบรนด์นี้", 404);
    if (!branch.stockEnabled || !branch.brand?.stockEnabled) {
      throw new StockError("สาขานี้ยังไม่ได้เปิดระบบสต๊อก");
    }

    const product = await tx.brandProduct.findFirst({
      where: {
        id: input.brandProductId,
        brandId: input.brandId,
        isActive: true,
      },
    });
    if (!product) throw new StockError("ไม่พบสินค้า", 404);

    let warehouse;
    if (input.sourceLocationId) {
      warehouse = await tx.stockLocation.findFirst({
        where: { id: input.sourceLocationId, brandId: input.brandId, type: StockLocationType.WAREHOUSE },
      });
    }
    if (!warehouse) {
      warehouse = await ensureWarehouseLocation(input.brandId, tx);
    }

    await ensureBranchStockLocation(
      {
        brandId: input.brandId,
        branchId: branch.id,
        branchName: branch.name,
      },
      tx,
    );

    const allowNeg = await brandAllowsNegative(tx, input.brandId);
    const { beforeQty, afterQty } = await changeBalance(tx, {
      stockLocationId: warehouse.id,
      brandProductId: input.brandProductId,
      delta: -input.quantity,
      allowNegative: allowNeg,
    });

    await tx.stockMovement.create({
      data: {
        brandId: input.brandId,
        brandProductId: input.brandProductId,
        type: StockMovementType.TRANSFER,
        quantity: input.quantity,
        beforeQty,
        afterQty,
        stockLocationId: warehouse.id,
        fromLocationId: warehouse.id,
        note: input.note?.trim() || "ส่งให้สาขา (รอรับ)",
        referenceType: "TRANSFER_PENDING",
        createdByAdminId: input.adminId ?? null,
      },
    });

    return tx.stockTransfer.create({
      data: {
        brandId: input.brandId,
        branchId: branch.id,
        brandProductId: input.brandProductId,
        quantity: input.quantity,
        status: "PENDING",
        note: input.note?.trim() || null,
        createdByAdminId: input.adminId ?? null,
      },
      include: {
        product: true,
        branch: { select: { id: true, name: true } },
      },
    });
  });
}

export async function confirmStockTransfer(input: {
  transferId: string;
  branchId: string;
  staffId: string;
  receivedQuantity?: number | null;
  varianceNote?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: {
        id: input.transferId,
        branchId: input.branchId,
        status: "PENDING",
      },
      include: {
        branch: { include: { brand: true } },
        product: true,
      },
    });
    if (!transfer) throw new StockError("ไม่พบรายการรอรับ หรือรับแล้ว", 404);
    if (
      !isBranchStockActive({
        brandId: transfer.branch.brandId,
        brandStockEnabled: transfer.branch.brand?.stockEnabled,
        branchStockEnabled: transfer.branch.stockEnabled,
      })
    ) {
      throw new StockError("สาขานี้ยังไม่ได้เปิดระบบสต๊อก");
    }

    const actualReceived =
      typeof input.receivedQuantity === "number" && input.receivedQuantity >= 0
        ? input.receivedQuantity
        : transfer.quantity;
    const varianceQty = actualReceived - transfer.quantity;

    const branchLoc = await ensureBranchStockLocation(
      {
        brandId: transfer.brandId,
        branchId: transfer.branchId,
        branchName: transfer.branch.name,
      },
      tx,
    );

    let fromLocationId: string | null = null;
    let receiveNote = transfer.note || "รับของจากบ้านกลาง";
    if (transfer.sourceBranchId) {
      const source = await tx.branch.findUnique({
        where: { id: transfer.sourceBranchId },
      });
      if (source) {
        const sourceLoc = await ensureBranchStockLocation(
          {
            brandId: transfer.brandId,
            branchId: source.id,
            branchName: source.name,
          },
          tx,
        );
        fromLocationId = sourceLoc.id;
        receiveNote = transfer.note || `รับโอนจากสาขา ${source.name}`;
      }
    } else {
      const warehouse = await ensureWarehouseLocation(transfer.brandId, tx);
      fromLocationId = warehouse.id;
    }

    const { beforeQty, afterQty } = await changeBalance(tx, {
      stockLocationId: branchLoc.id,
      brandProductId: transfer.brandProductId,
      delta: actualReceived,
    });
    await syncAfterBranchQtyChange(
      tx,
      branchLoc,
      transfer.brandProductId,
      afterQty,
    );

    let finalNote = receiveNote;
    if (varianceQty !== 0) {
      finalNote += ` (นับรับจริง ${actualReceived}/${transfer.quantity} ผลต่าง ${
        varianceQty > 0 ? `+${varianceQty}` : varianceQty
      }${input.varianceNote ? `: ${input.varianceNote}` : ""})`;
    }

    await tx.stockMovement.create({
      data: {
        brandId: transfer.brandId,
        brandProductId: transfer.brandProductId,
        type: StockMovementType.TRANSFER,
        quantity: actualReceived,
        beforeQty,
        afterQty,
        stockLocationId: branchLoc.id,
        fromLocationId,
        toLocationId: branchLoc.id,
        note: finalNote,
        referenceType: "STOCK_TRANSFER",
        referenceId: transfer.id,
        lotNumber: transfer.lotNumber,
        expiresAt: transfer.expiresAt,
        createdByStaffId: input.staffId,
      },
    });

    return tx.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "RECEIVED",
        receivedAt: new Date(),
        receivedByStaffId: input.staffId,
        receivedQuantity: actualReceived,
        varianceQuantity: varianceQty,
        varianceNote: input.varianceNote || null,
      },
      include: { product: true },
    });
  });
}

export async function cancelStockTransfer(input: {
  transferId: string;
  brandId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: {
        id: input.transferId,
        brandId: input.brandId,
        status: "PENDING",
      },
    });
    if (!transfer) throw new StockError("ไม่พบรายการรอรับ หรือยกเลิกไม่ได้", 404);

    let restoreLoc;
    if (transfer.sourceBranchId) {
      const source = await tx.branch.findUnique({
        where: { id: transfer.sourceBranchId },
      });
      if (!source) throw new StockError("ไม่พบสาขาต้นทาง", 404);
      restoreLoc = await ensureBranchStockLocation(
        {
          brandId: input.brandId,
          branchId: source.id,
          branchName: source.name,
        },
        tx,
      );
    } else {
      restoreLoc = await ensureWarehouseLocation(input.brandId, tx);
    }

    const { beforeQty, afterQty } = await changeBalance(tx, {
      stockLocationId: restoreLoc.id,
      brandProductId: transfer.brandProductId,
      delta: transfer.quantity,
    });

    await tx.stockMovement.create({
      data: {
        brandId: input.brandId,
        brandProductId: transfer.brandProductId,
        type: StockMovementType.ADJUST,
        quantity: transfer.quantity,
        beforeQty,
        afterQty,
        stockLocationId: restoreLoc.id,
        toLocationId: restoreLoc.id,
        note: transfer.sourceBranchId
          ? "ยกเลิกโอนสาขา — คืนต้นทาง"
          : "ยกเลิกการส่งสาขา — คืนบ้านกลาง",
        referenceType: "TRANSFER_CANCEL",
        referenceId: transfer.id,
      },
    });

    return tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: "CANCELLED" },
    });
  });
}

export async function adjustStock(input: {
  brandId: string;
  stockLocationId: string;
  brandProductId: string;
  quantity: number;
  note?: string | null;
} & Actor) {
  if (input.quantity < 0) throw new StockError("จำนวนต้องไม่ติดลบ");

  return prisma.$transaction(async (tx) => {
    const location = await tx.stockLocation.findFirst({
      where: { id: input.stockLocationId, brandId: input.brandId },
    });
    if (!location) throw new StockError("ไม่พบตำแหน่งสต๊อก", 404);

    const product = await tx.brandProduct.findFirst({
      where: { id: input.brandProductId, brandId: input.brandId },
    });
    if (!product) throw new StockError("ไม่พบสินค้า", 404);

    const beforeQty = await readQty(tx, location.id, product.id);
    const delta = input.quantity - beforeQty;
    if (delta === 0) return null;

    const allowNeg = await brandAllowsNegative(tx, input.brandId);
    const { afterQty } = await changeBalance(tx, {
      stockLocationId: location.id,
      brandProductId: product.id,
      delta,
      allowNegative: allowNeg,
    });
    await syncAfterBranchQtyChange(tx, location, product.id, afterQty);

    return tx.stockMovement.create({
      data: {
        brandId: input.brandId,
        brandProductId: product.id,
        type: StockMovementType.ADJUST,
        quantity: Math.abs(delta),
        beforeQty,
        afterQty,
        stockLocationId: location.id,
        fromLocationId: delta < 0 ? location.id : null,
        toLocationId: delta > 0 ? location.id : null,
        note:
          input.note?.trim() ||
          `ปรับยอดจาก ${beforeQty} เป็น ${input.quantity}`,
        referenceType: "ADJUST",
        createdByAdminId: input.adminId ?? null,
        createdByStaffId: input.staffId ?? null,
      },
    });
  });
}

/** DAMAGE / LOST / ISSUE (consumable) / WASTE — outbound from a location */
export async function stockOutbound(input: {
  brandId: string;
  stockLocationId: string;
  brandProductId: string;
  quantity: number;
  type: "DAMAGE" | "LOST" | "ISSUE" | "WASTE";
  note?: string | null;
  imageUrl?: string | null;
  reason?: string | null;
} & Actor) {
  if (input.quantity <= 0) throw new StockError("จำนวนต้องมากกว่า 0");

  return prisma.$transaction(async (tx) => {
    const product = await tx.brandProduct.findFirst({
      where: { id: input.brandProductId, brandId: input.brandId },
    });
    if (!product) throw new StockError("ไม่พบสินค้า", 404);

    if (input.type === "ISSUE" && product.stockType !== StockType.CONSUMABLE) {
      throw new StockError("เบิกใช้ได้เฉพาะของสิ้นเปลือง");
    }

    const location = await tx.stockLocation.findFirst({
      where: { id: input.stockLocationId, brandId: input.brandId },
    });
    if (!location) throw new StockError("ไม่พบตำแหน่งสต๊อก", 404);

    const allowNeg = await brandAllowsNegative(tx, input.brandId);
    const { beforeQty, afterQty } = await changeBalance(tx, {
      stockLocationId: location.id,
      brandProductId: product.id,
      delta: -input.quantity,
      allowNegative: allowNeg,
    });
    await syncAfterBranchQtyChange(tx, location, product.id, afterQty);

    if (
      product.stockType === StockType.EQUIPMENT &&
      (input.type === "DAMAGE" || input.type === "LOST")
    ) {
      await tx.brandProduct.update({
        where: { id: product.id },
        data: {
          equipmentStatus:
            input.type === "DAMAGE"
              ? EquipmentStatus.DAMAGED
              : EquipmentStatus.LOST,
        },
      });
    }

    const typeMap = {
      DAMAGE: StockMovementType.DAMAGE,
      LOST: StockMovementType.LOST,
      ISSUE: StockMovementType.ISSUE,
      WASTE: StockMovementType.WASTE,
    } as const;

    return tx.stockMovement.create({
      data: {
        brandId: input.brandId,
        brandProductId: product.id,
        type: typeMap[input.type],
        quantity: input.quantity,
        beforeQty,
        afterQty,
        stockLocationId: location.id,
        fromLocationId: location.id,
        note: [input.reason, input.note].filter(Boolean).join(" — ") || null,
        imageUrl: input.imageUrl || null,
        referenceType: input.type,
        createdByAdminId: input.adminId ?? null,
        createdByStaffId: input.staffId ?? null,
      },
    });
  });
}

export async function deductStockForOrder(orderId: string, tx?: Tx) {
  const run = async (client: Tx) => {
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            branchMenuItem: {
              select: { id: true, brandProductId: true, name: true },
            },
          },
        },
        branch: {
          include: {
            brand: {
              select: {
                id: true,
                stockEnabled: true,
                allowNegativeStock: true,
              },
            },
          },
        },
      },
    });
    if (!order) return;
    if (order.stockDeducted) return;
    if (order.awaitingPhotoKey) return;
    if (
      !isBranchStockActive({
        brandId: order.branch.brandId,
        brandStockEnabled: order.branch.brand?.stockEnabled,
        branchStockEnabled: order.branch.stockEnabled,
      })
    ) {
      return;
    }

    const brandId = order.branch.brandId!;
    const location = await client.stockLocation.findFirst({
      where: {
        brandId,
        branchId: order.branchId,
        type: StockLocationType.BRANCH,
      },
    });
    if (!location) {
      throw new StockError(
        "สาขานี้เปิดสต๊อกแล้วแต่ยังไม่มีตำแหน่งสต๊อก — ลองปิด/เปิดสต๊อกสาขาอีกครั้ง",
      );
    }

    type Need = { saleQty: number; freeQty: number; name: string };
    const needs = new Map<string, Need>();

    for (const item of order.items) {
      const productId = item.branchMenuItem?.brandProductId;
      if (!productId) continue;
      const product = await client.brandProduct.findFirst({
        where: {
          id: productId,
          brandId,
          trackStock: true,
          isActive: true,
          stockType: StockType.SALE_ITEM,
        },
      });
      if (!product) continue;
      const saleQty = item.quantity;
      const freeQty = item.giftQuantity ?? 0;
      if (saleQty + freeQty <= 0) continue;
      const prev = needs.get(productId);
      needs.set(productId, {
        saleQty: (prev?.saleQty ?? 0) + saleQty,
        freeQty: (prev?.freeQty ?? 0) + freeQty,
        name: product.name,
      });
    }

    const allowNeg = Boolean(order.branch.brand?.allowNegativeStock);

    for (const [brandProductId, { saleQty, freeQty }] of needs) {
      const totalSold = saleQty + freeQty;
      if (saleQty > 0) {
        const productMeta = await client.brandProduct.findUnique({
          where: { id: brandProductId },
          select: { trackLots: true },
        });
        if (productMeta?.trackLots) {
          const { deductFromLotsFefo } = await import("@/lib/stock-advanced");
          await deductFromLotsFefo(client, {
            stockLocationId: location.id,
            brandProductId,
            quantity: saleQty,
            allowNegative: allowNeg,
          });
        }
        const { beforeQty, afterQty } = await changeBalance(client, {
          stockLocationId: location.id,
          brandProductId,
          delta: -saleQty,
          allowNegative: allowNeg,
        });
        await client.stockMovement.create({
          data: {
            brandId,
            brandProductId,
            type: StockMovementType.SALE,
            quantity: saleQty,
            beforeQty,
            afterQty,
            stockLocationId: location.id,
            fromLocationId: location.id,
            orderId: order.id,
            referenceType: "ORDER",
            referenceId: order.id,
            note: `ขายออเดอร์ ${order.orderNumber}`,
          },
        });
        await syncAfterBranchQtyChange(
          client,
          location,
          brandProductId,
          afterQty,
        );
      }
      if (freeQty > 0) {
        const productMeta = await client.brandProduct.findUnique({
          where: { id: brandProductId },
          select: { trackLots: true },
        });
        if (productMeta?.trackLots) {
          const { deductFromLotsFefo } = await import("@/lib/stock-advanced");
          await deductFromLotsFefo(client, {
            stockLocationId: location.id,
            brandProductId,
            quantity: freeQty,
            allowNegative: allowNeg,
          });
        }
        const { beforeQty, afterQty } = await changeBalance(client, {
          stockLocationId: location.id,
          brandProductId,
          delta: -freeQty,
          allowNegative: allowNeg,
        });
        await client.stockMovement.create({
          data: {
            brandId,
            brandProductId,
            type: StockMovementType.FREE,
            quantity: freeQty,
            beforeQty,
            afterQty,
            stockLocationId: location.id,
            fromLocationId: location.id,
            orderId: order.id,
            referenceType: "ORDER_GIFT",
            referenceId: order.id,
            note: `ของแถมออเดอร์ ${order.orderNumber}`,
          },
        });
        await syncAfterBranchQtyChange(
          client,
          location,
          brandProductId,
          afterQty,
        );
      }

      // BOM / recipe: auto-deduct components (usually consumables)
      if (totalSold > 0) {
        const recipe = await client.productRecipeLine.findMany({
          where: { parentProductId: brandProductId },
          include: { component: true },
        });
        for (const line of recipe) {
          if (!line.component.trackStock || !line.component.isActive) continue;
          const needQty = Math.ceil(
            Number(line.quantityPerUnit) * totalSold,
          );
          if (needQty <= 0) continue;
          if (line.component.trackLots) {
            const { deductFromLotsFefo } = await import("@/lib/stock-advanced");
            await deductFromLotsFefo(client, {
              stockLocationId: location.id,
              brandProductId: line.componentProductId,
              quantity: needQty,
              allowNegative: allowNeg,
            });
          }
          const { beforeQty, afterQty } = await changeBalance(client, {
            stockLocationId: location.id,
            brandProductId: line.componentProductId,
            delta: -needQty,
            allowNegative: allowNeg,
          });
          await client.stockMovement.create({
            data: {
              brandId,
              brandProductId: line.componentProductId,
              type: StockMovementType.ISSUE,
              quantity: needQty,
              beforeQty,
              afterQty,
              stockLocationId: location.id,
              fromLocationId: location.id,
              orderId: order.id,
              referenceType: "BOM",
              referenceId: brandProductId,
              note: `สูตรจาก ${needs.get(brandProductId)?.name ?? "เมนู"} ×${totalSold} (ออเดอร์ ${order.orderNumber})`,
            },
          });
        }
      }
    }

    await client.order.update({
      where: { id: order.id },
      data: { stockDeducted: true },
    });
  };

  if (tx) return run(tx);
  return prisma.$transaction(run);
}

export async function restoreStockForOrder(orderId: string, tx?: Tx) {
  const run = async (client: Tx) => {
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: {
        branch: {
          include: { brand: { select: { id: true, stockEnabled: true } } },
        },
      },
    });
    if (!order?.stockDeducted) return;

    if (
      !isBranchStockActive({
        brandId: order.branch.brandId,
        brandStockEnabled: order.branch.brand?.stockEnabled,
        branchStockEnabled: order.branch.stockEnabled,
      })
    ) {
      await client.order.update({
        where: { id: orderId },
        data: { stockDeducted: false },
      });
      return;
    }

    const brandId = order.branch.brandId!;
    const location = await client.stockLocation.findFirst({
      where: {
        brandId,
        branchId: order.branchId,
        type: StockLocationType.BRANCH,
      },
    });
    if (!location) {
      await client.order.update({
        where: { id: orderId },
        data: { stockDeducted: false },
      });
      return;
    }

    const sales = await client.stockMovement.findMany({
      where: {
        orderId,
        type: { in: [StockMovementType.SALE, StockMovementType.FREE] },
      },
    });

    for (const sale of sales) {
      const { beforeQty, afterQty } = await changeBalance(client, {
        stockLocationId: location.id,
        brandProductId: sale.brandProductId,
        delta: sale.quantity,
      });
      await client.stockMovement.create({
        data: {
          brandId,
          brandProductId: sale.brandProductId,
          type: StockMovementType.RETURN,
          quantity: sale.quantity,
          beforeQty,
          afterQty,
          stockLocationId: location.id,
          toLocationId: location.id,
          orderId,
          referenceType: "ORDER_CANCEL",
          referenceId: orderId,
          note: `คืนสต๊อกจากยกเลิกออเดอร์ ${order.orderNumber}`,
        },
      });
      await syncAfterBranchQtyChange(
        client,
        location,
        sale.brandProductId,
        afterQty,
      );
    }

    await client.order.update({
      where: { id: orderId },
      data: { stockDeducted: false },
    });
  };

  if (tx) {
    await run(tx);
    await restoreBranchMenuStockForOrder(orderId, tx);
    return;
  }
  await prisma.$transaction(async (client) => {
    await run(client);
    await restoreBranchMenuStockForOrder(orderId, client);
  });
}

const BRANCH_MENU_ORDER_NOTE_PREFIX = "ORDER:";

function branchMenuOrderNote(orderId: string, orderNumber: string) {
  return `${BRANCH_MENU_ORDER_NOTE_PREFIX}${orderId}|${orderNumber}`;
}

/** Parse `ORDER:{orderId}|{orderNumber}` from BranchMenuItemStockHistory.note */
export function parseBranchMenuOrderNote(
  note: string | null | undefined,
): { orderId: string; orderNumber: string } | null {
  if (!note || !note.startsWith(BRANCH_MENU_ORDER_NOTE_PREFIX)) return null;
  const rest = note.slice(BRANCH_MENU_ORDER_NOTE_PREFIX.length);
  const pipe = rest.indexOf("|");
  if (pipe < 0) {
    const orderId = rest.trim();
    return orderId ? { orderId, orderNumber: "" } : null;
  }
  const orderId = rest.slice(0, pipe).trim();
  if (!orderId) return null;
  return { orderId, orderNumber: rest.slice(pipe + 1).trim() };
}

export type BranchMenuStockSaleAgg = {
  menuItemId: string;
  name: string;
  /** Positive units deducted */
  quantity: number;
  orders: Array<{ id: string; orderNumber: string }>;
};

/**
 * Aggregate SALE histories for the given orders (still stock-deducted sales).
 * quantity on history rows is negative for SALE.
 */
export async function aggregateBranchMenuStockSalesByOrders(
  branchId: string,
  orders: Array<{ id: string; orderNumber: string }>,
): Promise<BranchMenuStockSaleAgg[]> {
  if (orders.length === 0) return [];

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const orFilters = orders.map((o) => ({
    note: { startsWith: `${BRANCH_MENU_ORDER_NOTE_PREFIX}${o.id}` },
  }));

  const histories: Array<{
    menuItemId: string;
    quantity: number;
    note: string | null;
    menuItem: { id: string; name: string };
  }> = [];

  const chunkSize = 40;
  for (let i = 0; i < orFilters.length; i += chunkSize) {
    const chunk = orFilters.slice(i, i + chunkSize);
    const rows = await prisma.branchMenuItemStockHistory.findMany({
      where: {
        branchId,
        type: "SALE",
        OR: chunk,
      },
      select: {
        menuItemId: true,
        quantity: true,
        note: true,
        menuItem: { select: { id: true, name: true } },
      },
    });
    histories.push(...rows);
  }

  type Acc = {
    menuItemId: string;
    name: string;
    quantity: number;
    orderMap: Map<string, string>;
  };
  const byMenu = new Map<string, Acc>();

  for (const h of histories) {
    const parsed = parseBranchMenuOrderNote(h.note);
    if (!parsed || !orderById.has(parsed.orderId)) continue;
    const order = orderById.get(parsed.orderId)!;
    const deducted = Math.abs(h.quantity);
    if (deducted <= 0) continue;

    let acc = byMenu.get(h.menuItemId);
    if (!acc) {
      acc = {
        menuItemId: h.menuItemId,
        name: h.menuItem.name,
        quantity: 0,
        orderMap: new Map(),
      };
      byMenu.set(h.menuItemId, acc);
    }
    acc.quantity += deducted;
    acc.orderMap.set(order.id, order.orderNumber);
  }

  return [...byMenu.values()]
    .map((a) => ({
      menuItemId: a.menuItemId,
      name: a.name,
      quantity: a.quantity,
      orders: [...a.orderMap.entries()]
        .map(([id, orderNumber]) => ({ id, orderNumber }))
        .sort((x, y) => x.orderNumber.localeCompare(y.orderNumber, "th")),
    }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "th"));
}

/**
 * Deduct BranchMenuItemStock for staff/customer orders.
 * Prefers FROM_MENU option picks (promo skewers); otherwise deducts the line item itself.
 */
export async function deductBranchMenuStockForOrder(input: {
  orderId: string;
  orderNumber: string;
  branchId: string;
  staffId?: string | null;
  lines: Array<{
    branchMenuItemId: string;
    quantity: number;
    optionIds?: string[];
  }>;
  tx?: Tx;
}) {
  const run = async (client: Tx) => {
    const already = await client.branchMenuItemStockHistory.findFirst({
      where: {
        branchId: input.branchId,
        type: "SALE",
        note: { startsWith: `${BRANCH_MENU_ORDER_NOTE_PREFIX}${input.orderId}` },
      },
      select: { id: true },
    });
    if (already) return;

    const menuIds = [...new Set(input.lines.map((l) => l.branchMenuItemId))];
    const menus = await client.branchMenuItem.findMany({
      where: { id: { in: menuIds }, branchId: input.branchId },
      include: {
        optionGroupLinks: {
          include: {
            group: {
              select: {
                id: true,
                mode: true,
                menuItemSources: {
                  where: { isEnabled: true },
                  select: { menuItemId: true },
                },
              },
            },
          },
        },
        category: { select: { stockExempt: true } },
        stock: true,
      },
    });
    const menuMap = new Map(menus.map((m) => [m.id, m]));

    const needs = new Map<string, { qty: number; name: string }>();

    for (const line of input.lines) {
      if (line.quantity <= 0) continue;
      const menu = menuMap.get(line.branchMenuItemId);
      if (!menu) continue;

      const fromMenuGroups = menu.optionGroupLinks
        .filter((l) => l.group.mode === "FROM_MENU")
        .map((l) => l.group);
      const fromMenuOptionIds = new Set(
        fromMenuGroups.flatMap((g) =>
          g.menuItemSources.map((s) => s.menuItemId),
        ),
      );

      if (fromMenuOptionIds.size > 0 && (line.optionIds?.length ?? 0) > 0) {
        // Promo pack: deduct selected skewers only (ignore MANUAL option ids)
        const counts = new Map<string, number>();
        for (const optId of line.optionIds ?? []) {
          if (!fromMenuOptionIds.has(optId)) continue;
          counts.set(optId, (counts.get(optId) ?? 0) + 1);
        }
        for (const [optMenuId, perPack] of counts) {
          const total = perPack * line.quantity;
          const prev = needs.get(optMenuId);
          needs.set(optMenuId, {
            qty: (prev?.qty ?? 0) + total,
            name: prev?.name ?? optMenuId,
          });
        }
      } else if (menu.category?.stockExempt) {
        // Category exempt from stock — skip pack/line deduction
        continue;
      } else {
        const prev = needs.get(menu.id);
        needs.set(menu.id, {
          qty: (prev?.qty ?? 0) + line.quantity,
          name: menu.name,
        });
      }
    }

    if (needs.size === 0) return;

    // Resolve names for option picks
    const needIds = [...needs.keys()];
    const named = await client.branchMenuItem.findMany({
      where: { id: { in: needIds }, branchId: input.branchId },
      include: { stock: true },
    });
    const namedMap = new Map(named.map((m) => [m.id, m]));

    for (const [menuItemId, need] of needs) {
      const item = namedMap.get(menuItemId);
      if (!item) {
        throw new StockError(`ไม่พบเมนูสำหรับตัดสต๊อก`, 400);
      }
      need.name = item.name;
      // No BranchMenuItemStock row = not tracked yet (same as isMenuItemSoldOut).
      // Do not treat missing rows as quantity 0.
      if (!item.stock) continue;
      const have = item.stock.quantity;
      if (have < need.qty) {
        throw new StockError(
          `สต๊อกไม่พอ: ${item.name} (เหลือ ${have} ต้องการ ${need.qty})`,
        );
      }
    }

    const note = branchMenuOrderNote(input.orderId, input.orderNumber);

    for (const [menuItemId, need] of needs) {
      const item = namedMap.get(menuItemId)!;
      if (!item.stock) continue;
      const oldQty = item.stock.quantity;
      const newQty = oldQty - need.qty;

      await client.branchMenuItemStock.update({
        where: { menuItemId },
        data: { quantity: newQty },
      });

      await client.branchMenuItem.update({
        where: { id: menuItemId },
        data: { isOutOfStock: newQty <= 0 },
      });

      await client.branchMenuItemStockHistory.create({
        data: {
          branchId: input.branchId,
          menuItemId,
          quantity: -need.qty,
          type: "SALE",
          note,
          createdByStaffId: input.staffId ?? null,
        },
      });
    }

    await client.order.update({
      where: { id: input.orderId },
      data: { stockDeducted: true },
    });
  };

  if (input.tx) return run(input.tx);
  return prisma.$transaction(run);
}

export async function restoreBranchMenuStockForOrder(
  orderId: string,
  tx?: Tx,
) {
  const run = async (client: Tx) => {
    const histories = await client.branchMenuItemStockHistory.findMany({
      where: {
        type: "SALE",
        note: { startsWith: `${BRANCH_MENU_ORDER_NOTE_PREFIX}${orderId}` },
      },
    });
    if (histories.length === 0) return;

    for (const h of histories) {
      const stock = await client.branchMenuItemStock.findUnique({
        where: { menuItemId: h.menuItemId },
      });
      const oldQty = stock?.quantity ?? 0;
      const newQty = oldQty - h.quantity; // h.quantity is negative for SALE

      await client.branchMenuItemStock.upsert({
        where: { menuItemId: h.menuItemId },
        update: { quantity: newQty },
        create: {
          branchId: h.branchId,
          menuItemId: h.menuItemId,
          quantity: newQty,
        },
      });

      await client.branchMenuItem.update({
        where: { id: h.menuItemId },
        data: { isOutOfStock: newQty <= 0 },
      });

      await client.branchMenuItemStockHistory.create({
        data: {
          branchId: h.branchId,
          menuItemId: h.menuItemId,
          quantity: -h.quantity,
          type: "ADJUST",
          note: `คืนสต๊อกจากยกเลิกออเดอร์ ${orderId}`,
          createdByStaffId: null,
        },
      });
    }
  };

  if (tx) return run(tx);
  return prisma.$transaction(run);
}

export async function maybeDeductOnAccept(input: {
  orderId: string;
  previousStatus: import("@prisma/client").OrderStatus;
  nextStatus: import("@prisma/client").OrderStatus;
}) {
  const { OrderStatus } = await import("@prisma/client");
  if (
    input.previousStatus === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE &&
    input.nextStatus === OrderStatus.PREPARING
  ) {
    await deductStockForOrder(input.orderId);
    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      include: { items: true },
    });
    if (order) {
      await deductBranchMenuStockForOrder({
        orderId: order.id,
        orderNumber: order.orderNumber,
        branchId: order.branchId,
        lines: order.items
          .filter((i) => i.branchMenuItemId)
          .map((i) => ({
            branchMenuItemId: i.branchMenuItemId!,
            quantity: i.quantity + (i.giftQuantity ?? 0),
            optionIds: [],
          })),
      });
    }
  }
}

/** Create a stock count session with snapshot system qty */
export async function createStockCount(input: {
  brandId: string;
  stockLocationId: string;
  name: string;
  type?: StockCountType;
  stockTypes?: StockType[];
  note?: string | null;
} & Actor) {
  return prisma.$transaction(async (tx) => {
    const location = await tx.stockLocation.findFirst({
      where: { id: input.stockLocationId, brandId: input.brandId },
    });
    if (!location) throw new StockError("ไม่พบตำแหน่งสต๊อก", 404);

    const typeFilter = input.stockTypes?.length
      ? { stockType: { in: input.stockTypes } }
      : {};

    const products = await tx.brandProduct.findMany({
      where: {
        brandId: input.brandId,
        isActive: true,
        trackStock: true,
        ...typeFilter,
      },
      orderBy: { name: "asc" },
    });

    const count = await tx.stockCount.create({
      data: {
        brandId: input.brandId,
        branchId: location.branchId,
        stockLocationId: location.id,
        name: input.name.trim(),
        type: input.type ?? StockCountType.CUSTOM,
        status: StockCountStatus.IN_PROGRESS,
        note: input.note?.trim() || null,
        createdByAdminId: input.adminId ?? null,
        createdByStaffId: input.staffId ?? null,
        lines: {
          create: await Promise.all(
            products.map(async (p) => {
              const qty = await readQty(tx, location.id, p.id);
              return {
                brandProductId: p.id,
                systemQty: qty,
              };
            }),
          ),
        },
      },
      include: {
        lines: { include: { product: true }, orderBy: { product: { name: "asc" } } },
        location: true,
      },
    });

    return count;
  });
}

export async function updateStockCountLines(input: {
  countId: string;
  brandId: string;
  lines: { brandProductId: string; countedQty: number; note?: string | null }[];
}) {
  const count = await prisma.stockCount.findFirst({
    where: {
      id: input.countId,
      brandId: input.brandId,
      status: { in: [StockCountStatus.DRAFT, StockCountStatus.IN_PROGRESS] },
    },
  });
  if (!count) throw new StockError("ไม่พบรอบตรวจนับ หรือปิดแล้ว", 404);

  await prisma.$transaction(
    input.lines.map((line) =>
      prisma.stockCountLine.updateMany({
        where: {
          countId: input.countId,
          brandProductId: line.brandProductId,
        },
        data: {
          countedQty: line.countedQty,
          note: line.note?.trim() || null,
        },
      }),
    ),
  );

  return prisma.stockCount.findUnique({
    where: { id: input.countId },
    include: {
      lines: { include: { product: true }, orderBy: { product: { name: "asc" } } },
    },
  });
}

/** Complete count: create COUNT + ADJUST movements for diffs */
export async function completeStockCount(input: {
  countId: string;
  brandId: string;
} & Actor) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.stockCount.findFirst({
      where: {
        id: input.countId,
        brandId: input.brandId,
        status: { in: [StockCountStatus.DRAFT, StockCountStatus.IN_PROGRESS] },
      },
      include: { lines: true, location: true },
    });
    if (!count) throw new StockError("ไม่พบรอบตรวจนับ หรือปิดแล้ว", 404);

    const missing = count.lines.filter((l) => l.countedQty == null);
    if (missing.length > 0) {
      throw new StockError(`ยังนับไม่ครบ ${missing.length} รายการ`);
    }

    const allowNeg = await brandAllowsNegative(tx, input.brandId);

    for (const line of count.lines) {
      const counted = line.countedQty ?? line.systemQty;
      const delta = counted - line.systemQty;

      await tx.stockMovement.create({
        data: {
          brandId: input.brandId,
          brandProductId: line.brandProductId,
          type: StockMovementType.COUNT,
          quantity: Math.abs(delta),
          beforeQty: line.systemQty,
          afterQty: counted,
          stockLocationId: count.stockLocationId,
          note: line.note || `ตรวจนับ ${count.name}`,
          referenceType: "STOCK_COUNT",
          referenceId: count.id,
          createdByAdminId: input.adminId ?? null,
          createdByStaffId: input.staffId ?? null,
        },
      });

      if (delta !== 0) {
        const { beforeQty, afterQty } = await changeBalance(tx, {
          stockLocationId: count.stockLocationId,
          brandProductId: line.brandProductId,
          delta,
          allowNegative: allowNeg,
        });
        await syncAfterBranchQtyChange(
          tx,
          count.location,
          line.brandProductId,
          afterQty,
        );
        await tx.stockMovement.create({
          data: {
            brandId: input.brandId,
            brandProductId: line.brandProductId,
            type: StockMovementType.ADJUST,
            quantity: Math.abs(delta),
            beforeQty,
            afterQty,
            stockLocationId: count.stockLocationId,
            fromLocationId: delta < 0 ? count.stockLocationId : null,
            toLocationId: delta > 0 ? count.stockLocationId : null,
            note: `ปรับจากตรวจนับ ${count.name}`,
            referenceType: "STOCK_COUNT",
            referenceId: count.id,
            createdByAdminId: input.adminId ?? null,
            createdByStaffId: input.staffId ?? null,
          },
        });
      }
    }

    return tx.stockCount.update({
      where: { id: count.id },
      data: {
        status: StockCountStatus.COMPLETED,
        completedAt: new Date(),
        endsAt: new Date(),
      },
      include: {
        lines: { include: { product: true } },
      },
    });
  });
}

export async function getStockDashboard(brandId: string) {
  const [products, warehouse, branches, todayDamage, pendingTransfers] =
    await Promise.all([
      prisma.brandProduct.findMany({
        where: { brandId },
        include: {
          balances: { include: { location: true } },
        },
      }),
      prisma.stockLocation.findFirst({
        where: { brandId, type: StockLocationType.WAREHOUSE },
      }),
      prisma.branch.findMany({
        where: { brandId, stockEnabled: true },
        select: { id: true, name: true },
      }),
      prisma.stockMovement.findMany({
        where: {
          brandId,
          type: { in: [StockMovementType.DAMAGE, StockMovementType.LOST, StockMovementType.WASTE] },
          createdAt: { gte: startOfBangkokDay() },
        },
        include: { product: { select: { name: true, unit: true } } },
      }),
      prisma.stockTransfer.count({
        where: { brandId, status: "PENDING" },
      }),
    ]);

  let totalSku = products.filter((p) => p.isActive).length;
  let lowStock = 0;
  let outOfStock = 0;
  let stockValue = 0;
  let consumableLow = 0;
  let equipmentDue = 0;

  const lowItems: { id: string; name: string; qty: number; type: StockType }[] =
    [];

  for (const p of products) {
    if (!p.isActive || !p.trackStock) continue;
    const totalQty = p.balances.reduce((s, b) => s + b.quantity, 0);
    const cost = p.costPrice ? Number(p.costPrice) : 0;
    stockValue += totalQty * cost;

    if (totalQty <= 0) {
      outOfStock += 1;
      lowItems.push({ id: p.id, name: p.name, qty: totalQty, type: p.stockType });
    } else if (p.lowStockAlert != null && totalQty <= p.lowStockAlert) {
      lowStock += 1;
      lowItems.push({ id: p.id, name: p.name, qty: totalQty, type: p.stockType });
      if (p.stockType === StockType.CONSUMABLE) consumableLow += 1;
    }

    if (
      p.stockType === StockType.EQUIPMENT &&
      (p.equipmentStatus === EquipmentStatus.DAMAGED ||
        p.equipmentStatus === EquipmentStatus.LOST)
    ) {
      equipmentDue += 1;
    }
  }

  return {
    totalSku,
    lowStock,
    outOfStock,
    stockValue,
    damageLostToday: todayDamage.length,
    damageLostTodayItems: todayDamage.slice(0, 20),
    consumableLow,
    equipmentAttention: equipmentDue,
    pendingTransfers,
    branchCount: branches.length,
    warehouseName: warehouse?.name ?? "บ้านกลาง",
    lowItems: lowItems.slice(0, 30),
  };
}

function startOfBangkokDay() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = fmt.format(new Date()); // YYYY-MM-DD
  // Approximate UTC instant for Bangkok midnight
  return new Date(`${day}T00:00:00+07:00`);
}
