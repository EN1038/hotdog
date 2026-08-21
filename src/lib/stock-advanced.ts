import {
  Prisma,
  PurchaseOrderStatus,
  StockLocationType,
  StockMovementType,
  StockTransferKind,
  StockType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ensureBranchStockLocation,
  ensureWarehouseLocation,
  StockError,
  stockIn,
  isBranchStockActive,
} from "@/lib/stock";
import { assertBrandWriteAllowedByBrandId } from "@/lib/brand-plan";

type Tx = Prisma.TransactionClient;
type Actor = { adminId?: string | null; staffId?: string | null };

function dec(n: number | string | Prisma.Decimal | null | undefined) {
  if (n == null) return null;
  return n instanceof Prisma.Decimal ? n : new Prisma.Decimal(n);
}

/** Add qty into a lot (+ aggregate balance handled by caller via stockIn extras) */
export async function addToLot(
  tx: Tx,
  input: {
    brandId: string;
    brandProductId: string;
    stockLocationId: string;
    lotNumber: string;
    quantity: number;
    expiresAt?: Date | null;
    unitCost?: number | null;
    receivedAt?: Date | null;
  },
) {
  const lotNumber = input.lotNumber.trim();
  if (!lotNumber) throw new StockError("ต้องระบุเลขล็อต");
  const existing = await tx.stockLot.findUnique({
    where: {
      stockLocationId_brandProductId_lotNumber: {
        stockLocationId: input.stockLocationId,
        brandProductId: input.brandProductId,
        lotNumber,
      },
    },
  });
  if (existing) {
    return tx.stockLot.update({
      where: { id: existing.id },
      data: {
        quantity: { increment: input.quantity },
        ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
        ...(input.unitCost != null && { unitCost: dec(input.unitCost) }),
        ...(input.receivedAt != null && { receivedAt: input.receivedAt }),
      },
    });
  }
  return tx.stockLot.create({
    data: {
      brandId: input.brandId,
      brandProductId: input.brandProductId,
      stockLocationId: input.stockLocationId,
      lotNumber,
      quantity: input.quantity,
      expiresAt: input.expiresAt ?? null,
      unitCost: dec(input.unitCost),
      ...(input.receivedAt != null && { receivedAt: input.receivedAt }),
    },
  });
}

/** FEFO deduct from lots; returns lot movement slices */
export async function deductFromLotsFefo(
  tx: Tx,
  input: {
    stockLocationId: string;
    brandProductId: string;
    quantity: number;
    allowNegative?: boolean;
  },
): Promise<{ lotId: string; lotNumber: string; expiresAt: Date | null; qty: number }[]> {
  const lots = await tx.stockLot.findMany({
    where: {
      stockLocationId: input.stockLocationId,
      brandProductId: input.brandProductId,
      quantity: { gt: 0 },
    },
    orderBy: [{ expiresAt: "asc" }, { receivedAt: "asc" }],
  });

  let remain = input.quantity;
  const slices: { lotId: string; lotNumber: string; expiresAt: Date | null; qty: number }[] =
    [];

  for (const lot of lots) {
    if (remain <= 0) break;
    const take = Math.min(lot.quantity, remain);
    await tx.stockLot.update({
      where: { id: lot.id },
      data: { quantity: { decrement: take } },
    });
    slices.push({
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      expiresAt: lot.expiresAt,
      qty: take,
    });
    remain -= take;
  }

  if (remain > 0 && !input.allowNegative) {
    throw new StockError(
      `ล็อตไม่พอตัด (ขาดอีก ${remain}) — ตรวจ Lot/วันหมดอายุ`,
    );
  }

  return slices;
}

export async function stockInWithLot(input: {
  brandId: string;
  stockLocationId: string;
  brandProductId: string;
  quantity: number;
  unitCost?: number | null;
  supplier?: string | null;
  note?: string | null;
  lotNumber?: string | null;
  expiresAt?: Date | null;
  /** วันผลิต / วันรับเข้าของล็อต */
  receivedAt?: Date | null;
  documentNo?: string | null;
} & Actor) {
  await assertBrandWriteAllowedByBrandId(input.brandId);
  const product = await prisma.brandProduct.findFirst({
    where: { id: input.brandProductId, brandId: input.brandId, isActive: true },
  });
  if (!product) throw new StockError("ไม่พบสินค้า", 404);
  if (product.trackLots && !input.lotNumber?.trim()) {
    throw new StockError("สินค้านี้ติดตามล็อต — ต้องระบุเลขล็อต");
  }
  return stockInLotTx(input);
}

export async function createSupplier(input: {
  brandId: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
}) {
  await assertBrandWriteAllowedByBrandId(input.brandId);
  const name = input.name.trim();
  if (!name) throw new StockError("ต้องระบุชื่อผู้ขาย");
  const dup = await prisma.supplier.findFirst({
    where: { brandId: input.brandId, name },
  });
  if (dup) throw new StockError("มีผู้ขายชื่อนี้อยู่แล้ว");
  return prisma.supplier.create({
    data: {
      brandId: input.brandId,
      name,
      code: input.code?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      note: input.note?.trim() || null,
    },
  });
}

export async function createPurchaseOrder(input: {
  brandId: string;
  supplierId: string;
  stockLocationId?: string | null;
  note?: string | null;
  expectedAt?: Date | null;
  lines: { brandProductId: string; quantityOrdered: number; unitCost?: number | null }[];
  adminId?: string | null;
}) {
  await assertBrandWriteAllowedByBrandId(input.brandId);
  if (!input.lines.length) throw new StockError("ต้องมีอย่างน้อย 1 รายการ");
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, brandId: input.brandId, isActive: true },
  });
  if (!supplier) throw new StockError("ไม่พบผู้ขาย", 404);

  const count = await prisma.purchaseOrder.count({ where: { brandId: input.brandId } });
  const orderNumber = `PO-${String(count + 1).padStart(5, "0")}`;

  return prisma.purchaseOrder.create({
    data: {
      brandId: input.brandId,
      supplierId: input.supplierId,
      stockLocationId: input.stockLocationId ?? null,
      orderNumber,
      status: PurchaseOrderStatus.DRAFT,
      note: input.note?.trim() || null,
      expectedAt: input.expectedAt ?? null,
      createdByAdminId: input.adminId ?? null,
      lines: {
        create: input.lines.map((l) => ({
          brandProductId: l.brandProductId,
          quantityOrdered: l.quantityOrdered,
          unitCost: dec(l.unitCost),
        })),
      },
    },
    include: {
      supplier: true,
      lines: { include: { product: true } },
    },
  });
}

export async function markPurchaseOrderOrdered(input: {
  brandId: string;
  purchaseOrderId: string;
}) {
  await assertBrandWriteAllowedByBrandId(input.brandId);
  const po = await prisma.purchaseOrder.findFirst({
    where: {
      id: input.purchaseOrderId,
      brandId: input.brandId,
      status: PurchaseOrderStatus.DRAFT,
    },
  });
  if (!po) throw new StockError("ไม่พบ PO สถานะร่าง", 404);
  return prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: PurchaseOrderStatus.ORDERED, orderedAt: new Date() },
  });
}

/** Receive PO lines into location (partial OK) */
export async function receivePurchaseOrder(input: {
  brandId: string;
  purchaseOrderId: string;
  lines: {
    brandProductId: string;
    quantity: number;
    lotNumber?: string | null;
    expiresAt?: Date | null;
  }[];
  adminId?: string | null;
}) {
  await assertBrandWriteAllowedByBrandId(input.brandId);
  const po = await prisma.purchaseOrder.findFirst({
    where: {
      id: input.purchaseOrderId,
      brandId: input.brandId,
      status: {
        in: [
          PurchaseOrderStatus.ORDERED,
          PurchaseOrderStatus.PARTIAL,
          PurchaseOrderStatus.DRAFT,
        ],
      },
    },
    include: { lines: true, supplier: true },
  });
  if (!po) throw new StockError("ไม่พบ PO ที่รับของได้", 404);

  let locationId = po.stockLocationId;
  if (!locationId) {
    const wh = await ensureWarehouseLocation(input.brandId);
    locationId = wh.id;
  }

  for (const recv of input.lines) {
    if (recv.quantity <= 0) continue;
    const line = po.lines.find((l) => l.brandProductId === recv.brandProductId);
    if (!line) throw new StockError("รายการไม่อยู่ใน PO");
    const remain = line.quantityOrdered - line.quantityReceived;
    if (recv.quantity > remain) {
      throw new StockError(
        `รับเกินจำนวนค้างรับ (ค้าง ${remain})`,
      );
    }

    await stockInLotTx({
      brandId: input.brandId,
      stockLocationId: locationId,
      brandProductId: recv.brandProductId,
      quantity: recv.quantity,
      unitCost: line.unitCost != null ? Number(line.unitCost) : null,
      supplier: po.supplier.name,
      note: `รับจาก PO ${po.orderNumber}`,
      lotNumber: recv.lotNumber,
      expiresAt: recv.expiresAt,
      adminId: input.adminId,
    });

    await prisma.purchaseOrderLine.update({
      where: { id: line.id },
      data: { quantityReceived: { increment: recv.quantity } },
    });
  }

  const refreshed = await prisma.purchaseOrder.findUnique({
    where: { id: po.id },
    include: { lines: true },
  });
  const allDone = refreshed!.lines.every(
    (l) => l.quantityReceived >= l.quantityOrdered,
  );
  const anyRecv = refreshed!.lines.some((l) => l.quantityReceived > 0);

  return prisma.purchaseOrder.update({
    where: { id: po.id },
    data: {
      status: allDone
        ? PurchaseOrderStatus.RECEIVED
        : anyRecv
          ? PurchaseOrderStatus.PARTIAL
          : po.status,
      receivedAt: allDone ? new Date() : po.receivedAt,
      stockLocationId: locationId,
    },
    include: {
      supplier: true,
      lines: { include: { product: true } },
    },
  });
}

export async function transferBranchToBranch(input: {
  brandId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  brandProductId: string;
  quantity: number;
  note?: string | null;
  lotNumber?: string | null;
  adminId?: string | null;
  staffId?: string | null;
}) {
  await assertBrandWriteAllowedByBrandId(input.brandId);
  if (input.sourceBranchId === input.destinationBranchId) {
    throw new StockError("สาขาต้นทางและปลายทางต้องต่างกัน");
  }
  if (input.quantity <= 0) throw new StockError("จำนวนต้องมากกว่า 0");

  return prisma.$transaction(async (tx) => {
    const [source, dest, product] = await Promise.all([
      tx.branch.findFirst({
        where: { id: input.sourceBranchId, brandId: input.brandId },
        include: { brand: true },
      }),
      tx.branch.findFirst({
        where: { id: input.destinationBranchId, brandId: input.brandId },
        include: { brand: true },
      }),
      tx.brandProduct.findFirst({
        where: { id: input.brandProductId, brandId: input.brandId, isActive: true },
      }),
    ]);
    if (!source || !dest) throw new StockError("ไม่พบสาขา", 404);
    if (!product) throw new StockError("ไม่พบสินค้า", 404);
    if (
      !isBranchStockActive({
        brandId: input.brandId,
        brandStockEnabled: source.brand?.stockEnabled,
        branchStockEnabled: source.stockEnabled,
      }) ||
      !isBranchStockActive({
        brandId: input.brandId,
        brandStockEnabled: dest.brand?.stockEnabled,
        branchStockEnabled: dest.stockEnabled,
      })
    ) {
      throw new StockError("ทั้งสองสาขาต้องเปิดสต๊อก");
    }

    const fromLoc = await ensureBranchStockLocation(
      {
        brandId: input.brandId,
        branchId: source.id,
        branchName: source.name,
      },
      tx,
    );
    await ensureBranchStockLocation(
      {
        brandId: input.brandId,
        branchId: dest.id,
        branchName: dest.name,
      },
      tx,
    );

    // Deduct source balance
    const bal = await tx.stockBalance.findUnique({
      where: {
        stockLocationId_brandProductId: {
          stockLocationId: fromLoc.id,
          brandProductId: product.id,
        },
      },
    });
    const beforeQty = bal?.quantity ?? 0;
    if (beforeQty < input.quantity && !source.brand?.allowNegativeStock) {
      throw new StockError(`สต๊อกสาขาต้นทางไม่พอ (เหลือ ${beforeQty})`);
    }

    if (product.trackLots) {
      await deductFromLotsFefo(tx, {
        stockLocationId: fromLoc.id,
        brandProductId: product.id,
        quantity: input.quantity,
        allowNegative: Boolean(source.brand?.allowNegativeStock),
      });
    }

    await tx.stockBalance.upsert({
      where: {
        stockLocationId_brandProductId: {
          stockLocationId: fromLoc.id,
          brandProductId: product.id,
        },
      },
      create: {
        stockLocationId: fromLoc.id,
        brandProductId: product.id,
        quantity: -input.quantity,
      },
      update: { quantity: { decrement: input.quantity } },
    });

    const afterQty = beforeQty - input.quantity;
    await tx.stockMovement.create({
      data: {
        brandId: input.brandId,
        brandProductId: product.id,
        type: StockMovementType.TRANSFER,
        quantity: input.quantity,
        beforeQty,
        afterQty,
        stockLocationId: fromLoc.id,
        fromLocationId: fromLoc.id,
        note: input.note?.trim() || `โอนไปสาขา ${dest.name} (รอรับ)`,
        referenceType: "BRANCH_TRANSFER_PENDING",
        lotNumber: input.lotNumber?.trim() || null,
        createdByAdminId: input.adminId ?? null,
      },
    });

    return tx.stockTransfer.create({
      data: {
        brandId: input.brandId,
        kind: StockTransferKind.BRANCH_TO_BRANCH,
        branchId: dest.id,
        sourceBranchId: source.id,
        brandProductId: product.id,
        quantity: input.quantity,
        status: "PENDING",
        note: input.note?.trim() || null,
        lotNumber: input.lotNumber?.trim() || null,
        createdByAdminId: input.adminId ?? null,
      },
      include: {
        product: true,
        branch: { select: { id: true, name: true } },
        sourceBranch: { select: { id: true, name: true } },
      },
    });
  });
}

export async function setProductRecipe(input: {
  brandId: string;
  parentProductId: string;
  lines: { componentProductId: string; quantityPerUnit: number; note?: string | null }[];
}) {
  const parent = await prisma.brandProduct.findFirst({
    where: { id: input.parentProductId, brandId: input.brandId },
  });
  if (!parent) throw new StockError("ไม่พบสินค้าแม่", 404);

  for (const line of input.lines) {
    if (line.componentProductId === input.parentProductId) {
      throw new StockError("วัตถุดิบต้องไม่ใช่สินค้าเดียวกัน");
    }
    if (line.quantityPerUnit <= 0) throw new StockError("ปริมาณต่อหน่วยต้องมากกว่า 0");
    const comp = await prisma.brandProduct.findFirst({
      where: { id: line.componentProductId, brandId: input.brandId },
    });
    if (!comp) throw new StockError("ไม่พบวัตถุดิบในสูตร", 404);
  }

  return prisma.$transaction(async (tx) => {
    await tx.productRecipeLine.deleteMany({
      where: { parentProductId: input.parentProductId },
    });
    if (input.lines.length) {
      await tx.productRecipeLine.createMany({
        data: input.lines.map((l) => ({
          parentProductId: input.parentProductId,
          componentProductId: l.componentProductId,
          quantityPerUnit: new Prisma.Decimal(l.quantityPerUnit),
          note: l.note?.trim() || null,
        })),
      });
    }
    return tx.productRecipeLine.findMany({
      where: { parentProductId: input.parentProductId },
      include: { component: true },
    });
  });
}

export async function getReorderForecast(brandId: string, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const products = await prisma.brandProduct.findMany({
    where: { brandId, isActive: true, trackStock: true },
    include: { balances: true },
  });

  const outbound = await prisma.stockMovement.groupBy({
    by: ["brandProductId"],
    where: {
      brandId,
      createdAt: { gte: since },
      type: {
        in: [
          StockMovementType.SALE,
          StockMovementType.FREE,
          StockMovementType.ISSUE,
          StockMovementType.DAMAGE,
          StockMovementType.LOST,
          StockMovementType.WASTE,
        ],
      },
    },
    _sum: { quantity: true },
  });
  const usedMap = new Map(
    outbound.map((o) => [o.brandProductId, o._sum.quantity ?? 0]),
  );

  return products.map((p) => {
    const onHand = p.balances.reduce((s, b) => s + b.quantity, 0);
    const used = usedMap.get(p.id) ?? 0;
    const avgDaily = used / Math.max(days, 1);
    const daysCover = avgDaily > 0 ? onHand / avgDaily : null;
    const reorderPoint = p.lowStockAlert ?? Math.ceil(avgDaily * 7);
    const suggestedOrder = Math.max(0, Math.ceil(reorderPoint * 2 - onHand));
    return {
      productId: p.id,
      name: p.name,
      stockType: p.stockType,
      unit: p.unit,
      onHand,
      usedLastDays: used,
      avgDaily: Math.round(avgDaily * 100) / 100,
      daysCover: daysCover != null ? Math.round(daysCover * 10) / 10 : null,
      lowStockAlert: p.lowStockAlert,
      reorderPoint,
      suggestedOrder,
      needsReorder: onHand <= reorderPoint,
    };
  }).sort((a, b) => Number(b.needsReorder) - Number(a.needsReorder) || a.daysCover! - b.daysCover!);
}

export async function exportMovementsForAccounting(input: {
  brandId: string;
  from: Date;
  to: Date;
}) {
  const rows = await prisma.stockMovement.findMany({
    where: {
      brandId: input.brandId,
      createdAt: { gte: input.from, lte: input.to },
    },
    include: {
      product: { select: { name: true, sku: true, stockType: true, unit: true } },
      stockLocation: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const header = [
    "date",
    "movement_id",
    "type",
    "sku",
    "product",
    "stock_type",
    "qty",
    "unit",
    "before_qty",
    "after_qty",
    "unit_cost",
    "total_cost",
    "location",
    "lot",
    "expires_at",
    "reference_type",
    "reference_id",
    "note",
  ];

  const lines = rows.map((r) =>
    [
      r.createdAt.toISOString(),
      r.id,
      r.type,
      r.product.sku ?? "",
      r.product.name,
      r.product.stockType,
      r.quantity,
      r.product.unit,
      r.beforeQty ?? "",
      r.afterQty ?? "",
      r.unitCost?.toString() ?? "",
      r.totalCost?.toString() ?? "",
      r.stockLocation?.name ?? "",
      r.lotNumber ?? "",
      r.expiresAt?.toISOString().slice(0, 10) ?? "",
      r.referenceType ?? "",
      r.referenceId ?? "",
      (r.note ?? "").replace(/"/g, '""'),
    ]
      .map((c) => `"${c}"`)
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
}

async function stockInLotTx(input: {
  brandId: string;
  stockLocationId: string;
  brandProductId: string;
  quantity: number;
  unitCost?: number | null;
  supplier?: string | null;
  note?: string | null;
  lotNumber?: string | null;
  expiresAt?: Date | null;
  receivedAt?: Date | null;
  documentNo?: string | null;
} & Actor) {
  const movement = await stockIn({
    brandId: input.brandId,
    stockLocationId: input.stockLocationId,
    brandProductId: input.brandProductId,
    quantity: input.quantity,
    unitCost: input.unitCost,
    supplier: input.supplier,
    note: input.note,
    receivedAt: input.receivedAt,
    documentNo: input.documentNo,
    adminId: input.adminId,
    staffId: input.staffId,
  });

  const wantLot =
    Boolean(input.lotNumber?.trim()) ||
    input.expiresAt != null ||
    input.receivedAt != null;

  if (wantLot) {
    const lotNumber =
      input.lotNumber?.trim() ||
      `IN-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    const lot = await prisma.$transaction((tx) =>
      addToLot(tx, {
        brandId: input.brandId,
        brandProductId: input.brandProductId,
        stockLocationId: input.stockLocationId,
        lotNumber,
        quantity: input.quantity,
        expiresAt: input.expiresAt,
        unitCost: input.unitCost,
        receivedAt: input.receivedAt,
      }),
    );
    await prisma.stockMovement.update({
      where: { id: movement.id },
      data: {
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        expiresAt: input.expiresAt ?? lot.expiresAt,
      },
    });
  } else if (input.expiresAt != null) {
    await prisma.stockMovement.update({
      where: { id: movement.id },
      data: { expiresAt: input.expiresAt },
    });
  }

  return movement;
}

export { stockInLotTx, StockError };
