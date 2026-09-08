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
      itemName: string;
      itemCode: string | null;
      unit: string;
      unitPrice: Prisma.Decimal | null;
      systemUnitPrice?: Prisma.Decimal | null;
      quantity: number;
      stockType: string;
      sortOrder: number;
      item?: { imageUrl: string | null } | null;
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
      itemName: l.itemName,
      itemCode: l.itemCode,
      unit: l.unit,
      unitPrice: l.unitPrice != null ? Number(l.unitPrice) : null,
      systemUnitPrice:
        l.systemUnitPrice != null ? Number(l.systemUnitPrice) : null,
      quantity: l.quantity,
      stockType: l.stockType,
      sortOrder: l.sortOrder,
      imageUrl: l.item?.imageUrl ?? null,
    })),
  };
}

const lineInclude = {
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      item: { select: { imageUrl: true } },
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
  const ids = [
    ...new Set(
      lines
        .map((l) => l.branchNonMenuItemId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) {
    return new Map<
      string,
      {
        id: string;
        unit: string;
        name: string;
        itemCode: string | null;
        stockType: string;
        price: Prisma.Decimal | null;
      }
    >();
  }
  const found = await prisma.branchNonMenuItem.findMany({
    where: { branchId, id: { in: ids } },
    select: {
      id: true,
      unit: true,
      name: true,
      itemCode: true,
      stockType: true,
      price: true,
    },
  });
  if (found.length !== ids.length) {
    throw new Error("มีสินค้าในรายการที่ไม่พบในสาขานี้");
  }
  return new Map(found.map((item) => [item.id, item]));
}

/** Lock unit (and snapshot name/code/type/system price) from master. */
function lineCreateData(
  line: PurchaseCreateInput["lines"][number],
  index: number,
  masters: Awaited<ReturnType<typeof loadLinkedMasters>>,
) {
  const itemId = line.branchNonMenuItemId?.trim() || null;
  const master = itemId ? masters.get(itemId) : undefined;
  const systemFromMaster =
    master?.price != null ? Number(master.price) : null;
  const systemUnitPrice =
    systemFromMaster != null && Number.isFinite(systemFromMaster)
      ? systemFromMaster
      : line.systemUnitPrice != null && Number.isFinite(line.systemUnitPrice)
        ? line.systemUnitPrice
        : null;
  return {
    branchNonMenuItemId: itemId,
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

async function reverseConfirmedStock(
  tx: Prisma.TransactionClient,
  input: {
    branchId: string;
    staffId: string | null;
    documentNo: string;
    stockBatchId: string | null;
    lines: Array<{
      branchNonMenuItemId: string | null;
      itemName: string;
      quantity: number;
    }>;
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
  }

  const reverseBatchId = randomUUID();
  for (const line of input.lines) {
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
    lines: Array<{
      branchNonMenuItemId: string | null;
      itemName: string;
      quantity: number;
    }>;
  },
) {
  const batchId = randomUUID();
  const noteBase = `จัดซื้อ ${input.documentNo}`;
  for (const line of input.lines) {
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

  const batchId = randomUUID();
  const noteBase = `จัดซื้อ ${existing.documentNo}`;

  await prisma.$transaction(async (tx) => {
    for (const line of existing.lines) {
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
          documentNo: existing.documentNo,
          createdByStaffId: input.staffId,
        },
      });
    }

    await tx.branchPurchaseOrder.update({
      where: { id: existing.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        stockBatchId: batchId,
      },
    });
  });

  const refreshed = await prisma.branchPurchaseOrder.findFirstOrThrow({
    where: { id: existing.id },
    include: lineInclude,
  });
  return serializePurchaseOrder(refreshed);
}
