import {
  StockLocationType,
  StockMovementType,
  StockTransferKind,
  StockTransferStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { isTestBranch } from "@/lib/branch-test";

export type WarehouseFlowBranchRow = {
  branchId: string;
  branchName: string;
  sentQty: number;
  receivedQty: number;
  pendingQty: number;
  /** sent − received − pending; >0 = รับไม่ครบ, <0 = รับเกิน */
  gapQty: number;
};

export type WarehouseStockFlow = {
  enabled: boolean;
  warehouseName: string;
  issueMode: "TRANSFER" | "ISSUE" | "BOTH" | null;
  onHandQty: number;
  onHandValue: number;
  receiveQty: number;
  receiveValue: number;
  wasteQty: number;
  /** ส่งจากคลังในช่วงที่เลือก (ไม่นับที่ยกเลิก) */
  sentQty: number;
  /** สาขารับจริงของรายการที่ส่งในช่วงนี้ */
  receivedQty: number;
  /** ยังรอรับ จากรายการที่ส่งในช่วงนี้ */
  pendingQty: number;
  /** ของรอรับทั้งหมดตอนนี้ (รวมที่ส่งก่อนช่วงวันที่) */
  pendingNowQty: number;
  /** sent − received − pending */
  gapQty: number;
  balanced: boolean;
  branches: WarehouseFlowBranchRow[];
};

const INBOUND_TYPES: StockMovementType[] = [
  StockMovementType.STOCK_IN,
  StockMovementType.RECEIVE,
];

const WASTE_TYPES: StockMovementType[] = [
  StockMovementType.DAMAGE,
  StockMovementType.LOST,
  StockMovementType.WASTE,
];

function emptyFlow(): WarehouseStockFlow {
  return {
    enabled: false,
    warehouseName: "สต๊อกกลาง",
    issueMode: null,
    onHandQty: 0,
    onHandValue: 0,
    receiveQty: 0,
    receiveValue: 0,
    wasteQty: 0,
    sentQty: 0,
    receivedQty: 0,
    pendingQty: 0,
    pendingNowQty: 0,
    gapQty: 0,
    balanced: true,
    branches: [],
  };
}

function rangeCreatedAt(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00+07:00`),
    lte: new Date(`${to}T23:59:59.999+07:00`),
  };
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * สต๊อกกลางแยกจากสาขาขาย — รับเข้าคลัง / คงเหลือ / นำส่งสาขา
 * ตรวจยอด: ส่งคลัง = รับสาขา + รอรับ (ส่วนต่าง = รับไม่ครบหรือรับเกิน)
 */
export async function buildWarehouseStockFlow(input: {
  brandId: string;
  from: string;
  to: string;
  branchId?: string | null;
  includeTest?: boolean;
}): Promise<WarehouseStockFlow> {
  const brand = await prisma.brand.findUnique({
    where: { id: input.brandId },
    select: { stockEnabled: true },
  });
  if (!brand?.stockEnabled) return emptyFlow();

  const warehouse = await prisma.branch.findFirst({
    where: { brandId: input.brandId, kind: "WAREHOUSE" },
    select: {
      id: true,
      name: true,
      warehouseIssueMode: true,
    },
  });
  if (!warehouse) return emptyFlow();

  const createdAtRange = rangeCreatedAt(input.from, input.to);
  const filterBranchId = input.branchId?.trim() || null;
  const includeTest = input.includeTest === true;

  const [warehouseLoc, transfers, pendingNowRows, storeBranches] =
    await Promise.all([
      prisma.stockLocation.findFirst({
        where: { brandId: input.brandId, type: StockLocationType.WAREHOUSE },
        select: { id: true },
      }),
      prisma.stockTransfer.findMany({
        where: {
          brandId: input.brandId,
          kind: StockTransferKind.WAREHOUSE_TO_BRANCH,
          createdAt: createdAtRange,
          ...(filterBranchId ? { branchId: filterBranchId } : {}),
        },
        select: {
          branchId: true,
          quantity: true,
          receivedQuantity: true,
          status: true,
          branch: { select: { id: true, name: true, isTest: true } },
        },
      }),
      prisma.stockTransfer.findMany({
        where: {
          brandId: input.brandId,
          kind: StockTransferKind.WAREHOUSE_TO_BRANCH,
          status: StockTransferStatus.PENDING,
          ...(filterBranchId ? { branchId: filterBranchId } : {}),
        },
        select: {
          quantity: true,
          branch: { select: { isTest: true } },
        },
      }),
      prisma.branch.findMany({
        where: {
          brandId: input.brandId,
          kind: { not: "WAREHOUSE" },
          ...(filterBranchId ? { id: filterBranchId } : {}),
        },
        select: { id: true, name: true, isTest: true },
        orderBy: { name: "asc" },
      }),
    ]);

  const keepBranch = (b: { isTest?: boolean | null }) =>
    includeTest || !isTestBranch(b);

  const liveTransfers = transfers.filter(
    (t) =>
      t.status !== StockTransferStatus.CANCELLED && keepBranch(t.branch),
  );
  const pendingNowQty = pendingNowRows
    .filter((t) => keepBranch(t.branch))
    .reduce((s, t) => s + t.quantity, 0);

  const byBranch = new Map<string, WarehouseFlowBranchRow>();
  for (const b of storeBranches.filter(keepBranch)) {
    byBranch.set(b.id, {
      branchId: b.id,
      branchName: b.name,
      sentQty: 0,
      receivedQty: 0,
      pendingQty: 0,
      gapQty: 0,
    });
  }

  let sentQty = 0;
  let receivedQty = 0;
  let pendingQty = 0;

  for (const t of liveTransfers) {
    const received =
      t.status === StockTransferStatus.RECEIVED
        ? t.receivedQuantity ?? t.quantity
        : 0;
    const pending =
      t.status === StockTransferStatus.PENDING ? t.quantity : 0;
    sentQty += t.quantity;
    receivedQty += received;
    pendingQty += pending;

    let row = byBranch.get(t.branchId);
    if (!row) {
      row = {
        branchId: t.branchId,
        branchName: t.branch.name,
        sentQty: 0,
        receivedQty: 0,
        pendingQty: 0,
        gapQty: 0,
      };
      byBranch.set(t.branchId, row);
    }
    row.sentQty += t.quantity;
    row.receivedQty += received;
    row.pendingQty += pending;
  }

  const branches = [...byBranch.values()]
    .map((row) => ({
      ...row,
      gapQty: row.sentQty - row.receivedQty - row.pendingQty,
    }))
    .filter(
      (row) =>
        row.sentQty > 0 ||
        row.receivedQty > 0 ||
        row.pendingQty > 0 ||
        Boolean(filterBranchId),
    )
    .sort(
      (a, b) =>
        b.sentQty - a.sentQty || a.branchName.localeCompare(b.branchName, "th"),
    );

  const gapQty = sentQty - receivedQty - pendingQty;

  let onHandQty = 0;
  let onHandValue = 0;
  let receiveQty = 0;
  let receiveValue = 0;
  let wasteQty = 0;

  if (warehouseLoc) {
    const [balances, movements] = await Promise.all([
      prisma.stockBalance.findMany({
        where: { stockLocationId: warehouseLoc.id },
        select: {
          quantity: true,
          product: { select: { costPrice: true, sellingPrice: true } },
        },
      }),
      prisma.stockMovement.findMany({
        where: {
          brandId: input.brandId,
          stockLocationId: warehouseLoc.id,
          createdAt: createdAtRange,
          type: { in: [...INBOUND_TYPES, ...WASTE_TYPES] },
        },
        select: {
          type: true,
          quantity: true,
          totalCost: true,
          unitCost: true,
        },
      }),
    ]);

    for (const b of balances) {
      const qty = b.quantity;
      if (qty <= 0) continue;
      onHandQty += qty;
      const unit =
        b.product.costPrice != null
          ? Number(b.product.costPrice)
          : b.product.sellingPrice != null
            ? Number(b.product.sellingPrice)
            : 0;
      onHandValue += qty * unit;
    }

    for (const m of movements) {
      const qty = Math.abs(m.quantity);
      if (qty <= 0) continue;
      if (INBOUND_TYPES.includes(m.type)) {
        receiveQty += qty;
        const lineValue =
          m.totalCost != null
            ? Number(m.totalCost)
            : m.unitCost != null
              ? Number(m.unitCost) * qty
              : 0;
        receiveValue += lineValue;
      } else if (WASTE_TYPES.includes(m.type)) {
        wasteQty += qty;
      }
    }
  }

  return {
    enabled: true,
    warehouseName: warehouse.name || "สต๊อกกลาง",
    issueMode: warehouse.warehouseIssueMode,
    onHandQty,
    onHandValue: money(onHandValue),
    receiveQty,
    receiveValue: money(receiveValue),
    wasteQty,
    sentQty,
    receivedQty,
    pendingQty,
    pendingNowQty,
    gapQty,
    balanced: gapQty === 0,
    branches,
  };
}
