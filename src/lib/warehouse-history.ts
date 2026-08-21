import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isBangkokDateKey } from "@/lib/constants";

export const warehouseMovementInclude = {
  product: { select: { id: true, name: true, unit: true, stockType: true } },
  fromLocation: { select: { id: true, name: true, type: true } },
  toLocation: { select: { id: true, name: true, type: true } },
  stockLocation: { select: { id: true, name: true, type: true } },
  createdByStaff: { select: { id: true, name: true } },
  createdByAdmin: { select: { id: true, username: true } },
  lot: {
    select: {
      receivedAt: true,
      expiresAt: true,
      lotNumber: true,
      createdAt: true,
    },
  },
} satisfies Prisma.StockMovementInclude;

function isBangkokMidnight(d: Date) {
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return clock === "00:00";
}

/** รายการเก่าเคยเขียน createdAt = วันผลิต (เที่ยงคืน) — ใช้เวลาสร้างล็อตถ้ามี */
function movementRecordedAt(row: {
  createdAt: Date;
  lot: { createdAt: Date } | null;
}) {
  if (!isBangkokMidnight(row.createdAt)) return row.createdAt;
  if (row.lot?.createdAt && !isBangkokMidnight(row.lot.createdAt)) {
    return row.lot.createdAt;
  }
  return row.createdAt;
}

function bangkokDayRange(from: string, to: string) {
  const startKey = from <= to ? from : to;
  const endKey = from <= to ? to : from;
  return {
    start: new Date(`${startKey}T00:00:00.000+07:00`),
    end: new Date(`${endKey}T23:59:59.999+07:00`),
  };
}

export async function listWarehouseMovements(input: {
  brandId: string;
  from?: string | null;
  to?: string | null;
  q?: string | null;
  take?: number;
}) {
  const from = input.from && isBangkokDateKey(input.from) ? input.from : null;
  const to = input.to && isBangkokDateKey(input.to) ? input.to : from;
  const q = input.q?.trim() ?? "";
  const take = Math.min(Math.max(input.take ?? 300, 1), 500);

  const dateFilter = from && to ? bangkokDayRange(from, to) : null;
  const dateRange =
    dateFilter != null
      ? { gte: dateFilter.start, lte: dateFilter.end }
      : null;

  const andFilters: Prisma.StockMovementWhereInput[] = [
    {
      OR: [
        { stockLocation: { type: "WAREHOUSE" } },
        { fromLocation: { type: "WAREHOUSE" } },
        { toLocation: { type: "WAREHOUSE" } },
      ],
    },
  ];

  if (dateRange) {
    andFilters.push({
      OR: [{ createdAt: dateRange }, { lot: { receivedAt: dateRange } }],
    });
  }

  if (q) {
    andFilters.push({
      OR: [
        { documentNo: { contains: q, mode: "insensitive" } },
        { note: { contains: q, mode: "insensitive" } },
        { lotNumber: { contains: q, mode: "insensitive" } },
        { product: { name: { contains: q, mode: "insensitive" } } },
        {
          createdByStaff: {
            name: { contains: q, mode: "insensitive" },
          },
        },
        {
          createdByAdmin: {
            username: { contains: q, mode: "insensitive" },
          },
        },
      ],
    });
  }

  const rows = await prisma.stockMovement.findMany({
    where: {
      brandId: input.brandId,
      AND: andFilters,
    },
    include: warehouseMovementInclude,
    orderBy: { createdAt: "desc" },
    take,
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    quantity: row.quantity,
    beforeQty: row.beforeQty,
    afterQty: row.afterQty,
    note: row.note,
    documentNo: row.documentNo,
    supplier: row.supplier,
    lotNumber: row.lotNumber ?? row.lot?.lotNumber ?? null,
    expiresAt:
      row.expiresAt?.toISOString() ?? row.lot?.expiresAt?.toISOString() ?? null,
    receivedAt: row.lot?.receivedAt?.toISOString() ?? null,
    imageUrl: row.imageUrl,
    createdAt: movementRecordedAt(row).toISOString(),
    product: row.product,
    stockLocation: row.stockLocation,
    fromLocation: row.fromLocation,
    toLocation: row.toLocation,
    createdByStaff: row.createdByStaff,
    createdByAdmin: row.createdByAdmin,
  }));
}
