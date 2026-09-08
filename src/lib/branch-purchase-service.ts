import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  encodePurchaseImages,
  parsePurchaseImages,
  purchaseDateFromKey,
  purchaseDateKey,
  type PurchaseCreateInput,
  type PurchaseUpdateInput,
} from "@/lib/branch-purchase";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

type LinkedNonMenu = {
  kind: "nonMenu";
  id: string;
  unit: string;
  name: string;
  itemCode: string | null;
  stockType: string;
  price: Prisma.Decimal | null;
  imageUrl: string | null;
};

type LinkedMenu = {
  kind: "menu";
  id: string;
  unit: string;
  name: string;
  itemCode: string | null;
  stockType: "RAW_MATERIAL";
  price: Prisma.Decimal | null;
  imageUrl: string | null;
};

type LinkedMaster = LinkedNonMenu | LinkedMenu;

export function serializePurchaseOrder<
  T extends {
    id: string;
    branchId: string;
    documentDate: Date;
    documentNo: string;
    channel: string;
    channelNote: string | null;
    status: string;
    imageUrls: string | null;
    note: string | null;
    stockBatchId: string | null;
    createdByStaffId: string | null;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    lines?: Array<{
      id: string;
      branchNonMenuItemId: string | null;
      branchMenuItemId?: string | null;
      itemName: string;
      itemCode: string | null;
      unit: string;
      unitPrice: Prisma.Decimal | null;
      systemUnitPrice?: Prisma.Decimal | null;
      quantity: number;
      stockType: string;
      sortOrder: number;
      item?: { imageUrl: string | null } | null;
      menuItem?: { imageUrl: string | null } | null;
    }>;
  },
>(row: T) {
  return {
    id: row.id,
    branchId: row.branchId,
    documentDate: purchaseDateKey(row.documentDate),
    documentNo: row.documentNo,
    channel: row.channel,
    channelNote: row.channelNote,
    status: row.status,
    imageUrls: parsePurchaseImages(row.imageUrls),
    note: row.note,
    stockBatchId: row.stockBatchId,
    createdByStaffId: row.createdByStaffId,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: (row.lines ?? []).map((l) => ({
      id: l.id,
      branchNonMenuItemId: l.branchNonMenuItemId,
      branchMenuItemId: l.branchMenuItemId ?? null,
      itemName: l.itemName,
      itemCode: l.itemCode,
      unit: l.unit,
      unitPrice: l.unitPrice != null ? Number(l.unitPrice) : null,
      systemUnitPrice:
        l.systemUnitPrice != null ? Number(l.systemUnitPrice) : null,
      quantity: l.quantity,
      stockType: l.stockType,
      sortOrder: l.sortOrder,
      imageUrl: l.menuItem?.imageUrl ?? l.item?.imageUrl ?? null,
    })),
  };
}

const lineInclude = {
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      item: { select: { imageUrl: true } },
      menuItem: { select: { imageUrl: true } },
    },
  },
};

async function assertDocumentNoAvailable(
  documentNo: string,
  exceptId?: string,
) {
  const clash = await prisma.branchPurchaseOrder.findFirst({
    where: {
      documentNo,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new Error("เลขที่เอกสารนี้มีอยู่แล้ว");
}

async function loadLinkedMasters(
  branchId: string,
  lines: PurchaseCreateInput["lines"],
) {
  const nonMenuIds = [
    ...new Set(
      lines
        .map((l) => l.branchNonMenuItemId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const menuIds = [
    ...new Set(
      lines
        .map((l) => l.branchMenuItemId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const masters = new Map<string, LinkedMaster>();

  if (nonMenuIds.length > 0) {
    const found = await prisma.branchNonMenuItem.findMany({
      where: { branchId, id: { in: nonMenuIds } },
      select: {
        id: true,
        unit: true,
        name: true,
        itemCode: true,
        stockType: true,
        price: true,
        imageUrl: true,
      },
    });
    if (found.length !== nonMenuIds.length) {
      throw new Error("มีสินค้าในรายการที่ไม่พบในสาขานี้");
    }
    for (const item of found) {
      masters.set(item.id, {
        kind: "nonMenu",
        id: item.id,
        unit: item.unit,
        name: item.name,
        itemCode: item.itemCode,
        stockType: item.stockType,
        price: item.price,
        imageUrl: item.imageUrl,
      });
    }
  }

  if (menuIds.length > 0) {
    const found = await prisma.branchMenuItem.findMany({
      where: { branchId, id: { in: menuIds }, isHidden: false },
      select: {
        id: true,
        quantityUnit: true,
        name: true,
        itemCode: true,
        price: true,
        storefrontPrice: true,
        imageUrl: true,
      },
    });
    if (found.length !== menuIds.length) {
      throw new Error("มีรายการขายในเอกสารที่ไม่พบในสาขานี้");
    }
    for (const item of found) {
      masters.set(item.id, {
        kind: "menu",
        id: item.id,
        unit: item.quantityUnit?.trim() || "ชิ้น",
        name: item.name,
        itemCode: item.itemCode,
        stockType: "RAW_MATERIAL",
        price: item.storefrontPrice ?? item.price,
        imageUrl: item.imageUrl,
      });
    }
  }

  return masters;
}

/** Lock unit (and snapshot name/code/type/system price) from master. */
function lineCreateData(
  line: PurchaseCreateInput["lines"][number],
  index: number,
  masters: Awaited<ReturnType<typeof loadLinkedMasters>>,
) {
  const nonMenuId = line.branchNonMenuItemId?.trim() || null;
  const menuId = line.branchMenuItemId?.trim() || null;
  const master = nonMenuId
    ? masters.get(nonMenuId)
    : menuId
      ? masters.get(menuId)
      : undefined;
  const systemFromMaster =
    master?.price != null ? Number(master.price) : null;
  const systemUnitPrice =
    systemFromMaster != null && Number.isFinite(systemFromMaster)
      ? systemFromMaster
      : line.systemUnitPrice != null && Number.isFinite(line.systemUnitPrice)
        ? line.systemUnitPrice
        : null;
  return {
    branchNonMenuItemId: nonMenuId,
    branchMenuItemId: menuId,
    itemName: master?.name?.trim() || line.itemName.trim(),
    itemCode: master?.itemCode?.trim() || line.itemCode?.trim() || null,
    unit: (master?.unit?.trim() || line.unit.trim() || "ชิ้น").slice(0, 40),
    unitPrice:
      line.unitPrice != null ? new Prisma.Decimal(line.unitPrice) : null,
    systemUnitPrice:
      systemUnitPrice != null ? new Prisma.Decimal(systemUnitPrice) : null,
    quantity: line.quantity,
    stockType: master?.stockType || line.stockType,
    sortOrder: index,
  };
}

export async function createPurchaseOrder(input: {
  branchId: string;
  staffId: string | null;
  data: PurchaseCreateInput;
}) {
  await ensureProdSchemaCompat();
  await assertDocumentNoAvailable(input.data.documentNo);
  const masters = await loadLinkedMasters(input.branchId, input.data.lines);

  const shouldConfirm = Boolean(input.data.confirm);
  const po = await prisma.branchPurchaseOrder.create({
    data: {
      branchId: input.branchId,
      documentDate: purchaseDateFromKey(input.data.documentDate),
      documentNo: input.data.documentNo.trim(),
      channel: input.data.channel,
      channelNote: input.data.channelNote?.trim() || null,
      status: "DRAFT",
      imageUrls: encodePurchaseImages(input.data.imageUrls ?? []),
      note: input.data.note?.trim() || null,
      createdByStaffId: input.staffId,
      lines: {
        create: input.data.lines.map((line, index) =>
          lineCreateData(line, index, masters),
        ),
      },
    },
    include: lineInclude,
  });

  if (shouldConfirm) {
    return confirmPurchaseOrder({
      branchId: input.branchId,
      purchaseOrderId: po.id,
      staffId: input.staffId,
    });
  }
  return serializePurchaseOrder(po);
}

type StockLineRef = {
  branchNonMenuItemId: string | null;
  branchMenuItemId?: string | null;
  itemName: string;
  quantity: number;
};

async function reverseConfirmedStock(
  tx: Prisma.TransactionClient,
  input: {
    branchId: string;
    staffId: string | null;
    documentNo: string;
    stockBatchId: string | null;
    lines: StockLineRef[];
  },
) {
  if (input.stockBatchId) {
    await tx.branchNonMenuItemHistory.updateMany({
      where: {
        batchId: input.stockBatchId,
        cancelledAt: null,
      },
      data: {
        cancelledAt: new Date(),
        cancelNote: `ยกเลิกจัดซื้อ ${input.documentNo}`,
      },
    });
    await tx.branchMenuItemStockHistory.updateMany({
      where: {
        batchId: input.stockBatchId,
        cancelledAt: null,
      },
      data: {
        cancelledAt: new Date(),
        cancelNote: `ยกเลิกจัดซื้อ ${input.documentNo}`,
      },
    });
  }

  const reverseBatchId = randomUUID();
  for (const line of input.lines) {
    if (line.branchMenuItemId) {
      const stock = await tx.branchMenuItemStock.findFirst({
        where: {
          menuItemId: line.branchMenuItemId,
          branchId: input.branchId,
        },
      });
      const oldQty = stock?.quantity ?? 0;
      const nextQty = oldQty - line.quantity;
      if (nextQty < 0) {
        throw new Error(
          `สต๊อก “${line.itemName}” ไม่พอที่จะยกเลิกจัดซื้อ (คงเหลือ ${oldQty})`,
        );
      }
      await tx.branchMenuItemStock.upsert({
        where: { menuItemId: line.branchMenuItemId },
        update: { quantity: nextQty },
        create: {
          branchId: input.branchId,
          menuItemId: line.branchMenuItemId,
          quantity: nextQty,
        },
      });
      await tx.branchMenuItem.update({
        where: { id: line.branchMenuItemId },
        data: { isOutOfStock: nextQty <= 0 },
      });
      await tx.branchMenuItemStockHistory.create({
        data: {
          branchId: input.branchId,
          menuItemId: line.branchMenuItemId,
          quantity: -line.quantity,
          type: "ISSUE",
          note: `ยกเลิกจัดซื้อ ${input.documentNo}`,
          batchId: reverseBatchId,
          documentNo: input.documentNo,
          createdByStaffId: input.staffId,
        },
      });
      continue;
    }

    if (!line.branchNonMenuItemId) continue;
    const item = await tx.branchNonMenuItem.findFirst({
      where: { id: line.branchNonMenuItemId, branchId: input.branchId },
    });
    if (!item) {
      throw new Error(`ไม่พบสินค้า “${line.itemName}” ในสต๊อกสาขา`);
    }
    const nextQty = item.quantity - line.quantity;
    if (nextQty < 0) {
      throw new Error(
        `สต๊อก “${line.itemName}” ไม่พอที่จะยกเลิกจัดซื้อ (คงเหลือ ${item.quantity})`,
      );
    }
    await tx.branchNonMenuItem.update({
      where: { id: item.id },
      data: { quantity: nextQty },
    });
    await tx.branchNonMenuItemHistory.create({
      data: {
        branchNonMenuItemId: item.id,
        quantity: -line.quantity,
        type: "ISSUE",
        note: `ยกเลิกจัดซื้อ ${input.documentNo}`,
        batchId: reverseBatchId,
        documentNo: input.documentNo,
        createdByStaffId: input.staffId,
      },
    });
  }
  return reverseBatchId;
}

async function applyConfirmedStock(
  tx: Prisma.TransactionClient,
  input: {
    branchId: string;
    staffId: string | null;
    documentNo: string;
    lines: StockLineRef[];
  },
) {
  const batchId = randomUUID();
  const noteBase = `จัดซื้อ ${input.documentNo}`;
  for (const line of input.lines) {
    if (line.branchMenuItemId) {
      const stock = await tx.branchMenuItemStock.findFirst({
        where: {
          menuItemId: line.branchMenuItemId,
          branchId: input.branchId,
        },
      });
      const oldQty = stock?.quantity ?? 0;
      const nextQty = oldQty + line.quantity;
      await tx.branchMenuItemStock.upsert({
        where: { menuItemId: line.branchMenuItemId },
        update: { quantity: nextQty },
        create: {
          branchId: input.branchId,
          menuItemId: line.branchMenuItemId,
          quantity: nextQty,
        },
      });
      await tx.branchMenuItem.update({
        where: { id: line.branchMenuItemId },
        data: { isOutOfStock: nextQty <= 0 },
      });
      await tx.branchMenuItemStockHistory.create({
        data: {
          branchId: input.branchId,
          menuItemId: line.branchMenuItemId,
          quantity: line.quantity,
          type: "STOCK_IN",
          note: noteBase,
          batchId,
          documentNo: input.documentNo,
          createdByStaffId: input.staffId,
        },
      });
      continue;
    }

    if (!line.branchNonMenuItemId) continue;
    const item = await tx.branchNonMenuItem.findFirst({
      where: { id: line.branchNonMenuItemId, branchId: input.branchId },
    });
    if (!item) {
      throw new Error(`ไม่พบสินค้า “${line.itemName}” ในสต๊อกสาขา`);
    }
    await tx.branchNonMenuItem.update({
      where: { id: item.id },
      data: { quantity: item.quantity + line.quantity },
    });
    await tx.branchNonMenuItemHistory.create({
      data: {
        branchNonMenuItemId: item.id,
        quantity: line.quantity,
        type: "STOCK_IN",
        note: noteBase,
        batchId,
        documentNo: input.documentNo,
        createdByStaffId: input.staffId,
      },
    });
  }
  return batchId;
}

export async function updatePurchaseOrder(input: {
  branchId: string;
  purchaseOrderId: string;
  staffId?: string | null;
  data: PurchaseUpdateInput;
}) {
  await ensureProdSchemaCompat();
  const existing = await prisma.branchPurchaseOrder.findFirst({
    where: { id: input.purchaseOrderId, branchId: input.branchId },
    include: lineInclude,
  });
  if (!existing) throw new Error("ไม่พบรายการจัดซื้อ");
  if (existing.status === "CANCELLED") {
    throw new Error("ไม่สามารถแก้ไขรายการที่ยกเลิกแล้ว");
  }

  if (input.data.documentNo && input.data.documentNo !== existing.documentNo) {
    await assertDocumentNoAvailable(input.data.documentNo, existing.id);
  }

  const masters = input.data.lines
    ? await loadLinkedMasters(input.branchId, input.data.lines)
    : null;
  const wasConfirmed = existing.status === "CONFIRMED";
  const nextDocumentNo = input.data.documentNo?.trim() || existing.documentNo;

  const po = await prisma.$transaction(async (tx) => {
    if (wasConfirmed && input.data.lines) {
      await reverseConfirmedStock(tx, {
        branchId: input.branchId,
        staffId: input.staffId ?? null,
        documentNo: existing.documentNo,
        stockBatchId: existing.stockBatchId,
        lines: existing.lines,
      });
    }

    if (input.data.lines && masters) {
      await tx.branchPurchaseOrderLine.deleteMany({
        where: { purchaseOrderId: existing.id },
      });
      await tx.branchPurchaseOrderLine.createMany({
        data: input.data.lines.map((line, index) => ({
          ...lineCreateData(line, index, masters),
          purchaseOrderId: existing.id,
        })),
      });
    }

    let stockBatchId = existing.stockBatchId;
    if (wasConfirmed && input.data.lines) {
      const refreshedLines = await tx.branchPurchaseOrderLine.findMany({
        where: { purchaseOrderId: existing.id },
        orderBy: { sortOrder: "asc" },
      });
      stockBatchId = await applyConfirmedStock(tx, {
        branchId: input.branchId,
        staffId: input.staffId ?? null,
        documentNo: nextDocumentNo,
        lines: refreshedLines,
      });
    }

    return tx.branchPurchaseOrder.update({
      where: { id: existing.id },
      data: {
        ...(input.data.documentDate
          ? { documentDate: purchaseDateFromKey(input.data.documentDate) }
          : {}),
        ...(input.data.documentNo
          ? { documentNo: input.data.documentNo.trim() }
          : {}),
        ...(input.data.channel ? { channel: input.data.channel } : {}),
        ...(input.data.channelNote !== undefined
          ? { channelNote: input.data.channelNote?.trim() || null }
          : {}),
        ...(input.data.note !== undefined
          ? { note: input.data.note?.trim() || null }
          : {}),
        ...(input.data.imageUrls
          ? { imageUrls: encodePurchaseImages(input.data.imageUrls) }
          : {}),
        ...(wasConfirmed && input.data.lines
          ? { stockBatchId, confirmedAt: new Date() }
          : {}),
      },
      include: lineInclude,
    });
  });

  return serializePurchaseOrder(po);
}

export async function deletePurchaseOrder(input: {
  branchId: string;
  purchaseOrderId: string;
  staffId?: string | null;
}) {
  await ensureProdSchemaCompat();
  const existing = await prisma.branchPurchaseOrder.findFirst({
    where: { id: input.purchaseOrderId, branchId: input.branchId },
    include: lineInclude,
  });
  if (!existing) throw new Error("ไม่พบรายการจัดซื้อ");
  if (existing.status === "CANCELLED") {
    throw new Error("รายการนี้ถูกยกเลิกแล้ว");
  }

  await prisma.$transaction(async (tx) => {
    if (existing.status === "CONFIRMED") {
      await reverseConfirmedStock(tx, {
        branchId: input.branchId,
        staffId: input.staffId ?? null,
        documentNo: existing.documentNo,
        stockBatchId: existing.stockBatchId,
        lines: existing.lines,
      });
    }
    await tx.branchPurchaseOrder.delete({ where: { id: existing.id } });
  });

  return { id: existing.id, documentNo: existing.documentNo };
}

export async function confirmPurchaseOrder(input: {
  branchId: string;
  purchaseOrderId: string;
  staffId: string | null;
}) {
  await ensureProdSchemaCompat();
  const existing = await prisma.branchPurchaseOrder.findFirst({
    where: { id: input.purchaseOrderId, branchId: input.branchId },
    include: lineInclude,
  });
  if (!existing) throw new Error("ไม่พบรายการจัดซื้อ");
  if (existing.status === "CONFIRMED") {
    return serializePurchaseOrder(existing);
  }
  if (existing.status !== "DRAFT") {
    throw new Error("ยืนยันได้เฉพาะฉบับร่าง");
  }
  if (existing.lines.length === 0) {
    throw new Error("ต้องมีอย่างน้อย 1 รายการ");
  }

  const batchId = await prisma.$transaction(async (tx) => {
    const id = await applyConfirmedStock(tx, {
      branchId: input.branchId,
      staffId: input.staffId,
      documentNo: existing.documentNo,
      lines: existing.lines,
    });
    await tx.branchPurchaseOrder.update({
      where: { id: existing.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        stockBatchId: id,
      },
    });
    return id;
  });

  void batchId;

  const refreshed = await prisma.branchPurchaseOrder.findFirstOrThrow({
    where: { id: existing.id },
    include: lineInclude,
  });
  return serializePurchaseOrder(refreshed);
}
