import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  branchHistoryGroupKey,
  branchHistoryKindOfType,
  branchHistoryLabel,
  historyTypesForKind,
  orderFromHistoryNote,
  type BranchHistoryFlatRow,
  type BranchHistoryKind,
} from "@/lib/branch-stock-history";
import { mergeMovementImageUrls, parseMovementImages } from "@/lib/stock-movement-images";

function bangkokDayRange(from: string, to: string) {
  const startKey = from <= to ? from : to;
  const endKey = from <= to ? to : from;
  return {
    start: new Date(`${startKey}T00:00:00.000+07:00`),
    end: new Date(`${endKey}T23:59:59.999+07:00`),
  };
}

function schemaTable(name: string) {
  const schema = (process.env.DATABASE_SCHEMA ?? "public").replace(/"/g, "");
  return Prisma.raw(`"${schema}"."${name}"`);
}

async function loadCancelMeta(
  menuIds: string[],
  nonMenuIds: string[],
): Promise<Map<string, { cancelledAt: Date | null; cancelNote: string | null }>> {
  const map = new Map<
    string,
    { cancelledAt: Date | null; cancelNote: string | null }
  >();
  try {
    const { ensureStockHistoryCancelColumns } = await import(
      "@/lib/stock-history-cancel"
    );
    await ensureStockHistoryCancelColumns();
  } catch {
    /* ignore */
  }
  try {
    if (menuIds.length > 0) {
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          cancelledAt: Date | null;
          cancelNote: string | null;
        }>
      >`
        SELECT id, "cancelledAt", "cancelNote"
        FROM ${schemaTable("BranchMenuItemStockHistory")}
        WHERE id IN (${Prisma.join(menuIds)})
      `;
      for (const r of rows) {
        map.set(r.id, {
          cancelledAt: r.cancelledAt ?? null,
          cancelNote: r.cancelNote ?? null,
        });
      }
    }
    if (nonMenuIds.length > 0) {
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          cancelledAt: Date | null;
          cancelNote: string | null;
        }>
      >`
        SELECT id, "cancelledAt", "cancelNote"
        FROM ${schemaTable("BranchNonMenuItemHistory")}
        WHERE id IN (${Prisma.join(nonMenuIds)})
      `;
      for (const r of rows) {
        map.set(r.id, {
          cancelledAt: r.cancelledAt ?? null,
          cancelNote: r.cancelNote ?? null,
        });
      }
    }
  } catch (e) {
    console.error("[branch-stock-history] cancel meta", e);
  }
  return map;
}

function matchesQuery(row: BranchHistoryFlatRow, q: string) {
  if (!q) return true;
  const hay = [
    row.name,
    row.note ?? "",
    row.documentNo ?? "",
    row.createdByStaff?.name ?? "",
    row.order?.orderNumber ?? "",
    row.branchName ?? "",
    branchHistoryLabel(row.type),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export type BranchStockHistoryBatch = {
  id: string;
  branchId: string;
  branchName: string | null;
  kind: Exclude<BranchHistoryKind, "all">;
  historyType: string;
  label: string;
  createdAt: string;
  note: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  documentNo: string | null;
  receivedAt: string | null;
  orderNumber: string | null;
  createdByStaff: { id: string; name: string } | null;
  itemCount: number;
  totalQty: number;
  isCancelled: boolean;
  cancelledAt: string | null;
  cancelNote: string | null;
  lines: Array<{
    id: string;
    name: string;
    quantity: number;
    signedQuantity: number;
    unit: string;
    stockType: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
    isCancelled: boolean;
    imageUrl: string | null;
  }>;
};

export type LoadBranchStockHistoryResult = {
  from: string;
  to: string;
  kind: BranchHistoryKind;
  batches: BranchStockHistoryBatch[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number;
  hasMore: boolean;
};

export async function loadBranchStockHistoryBatches(opts: {
  branchIds: string[];
  branchNames?: Record<string, string>;
  from: string;
  to: string;
  kind: BranchHistoryKind;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<LoadBranchStockHistoryResult> {
  const fromStr = opts.from;
  const toStr = opts.to;
  const rangeFrom = fromStr <= toStr ? fromStr : toStr;
  const rangeTo = fromStr <= toStr ? toStr : fromStr;
  const kind = opts.kind;
  const q = (opts.q ?? "").trim().toLowerCase();
  const types = historyTypesForKind(kind);
  const { start, end } = bangkokDayRange(fromStr, toStr);
  const limit = Number.isFinite(opts.limit)
    ? Math.min(80, Math.max(10, Math.floor(opts.limit!)))
    : 40;
  const offset = Number.isFinite(opts.offset)
    ? Math.max(0, Math.floor(opts.offset!))
    : 0;

  const branchIds = [...new Set(opts.branchIds.filter(Boolean))];
  const branchNames = opts.branchNames ?? {};

  if (branchIds.length === 0) {
    return {
      from: rangeFrom,
      to: rangeTo,
      kind,
      batches: [],
      total: 0,
      limit,
      offset,
      nextOffset: offset,
      hasMore: false,
    };
  }

  type MenuRow = {
    id: string;
    branchId: string;
    type: string;
    quantity: number;
    note: string | null;
    imageUrl: string | null;
    batchId: string | null;
    documentNo: string | null;
    receivedAt: Date | null;
    createdAt: Date;
    menuItem: { name: string };
    createdByStaff: { id: string; name: string | null } | null;
  };
  type NonMenuRow = {
    id: string;
    type: string;
    quantity: number;
    note: string | null;
    imageUrl: string | null;
    batchId: string | null;
    documentNo: string | null;
    createdAt: Date;
    item: {
      branchId: string;
      name: string;
      unit: string;
      stockType: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
    };
    createdByStaff: { id: string; name: string | null } | null;
  };

  let menuRows: MenuRow[] = [];
  let nonMenuRows: NonMenuRow[] = [];

  try {
    const [menu, nonMenu] = await Promise.all([
      prisma.branchMenuItemStockHistory.findMany({
        where: {
          branchId: { in: branchIds },
          type: { in: types },
          createdAt: { gte: start, lte: end },
        },
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: {
          id: true,
          branchId: true,
          type: true,
          quantity: true,
          note: true,
          imageUrl: true,
          batchId: true,
          documentNo: true,
          receivedAt: true,
          createdAt: true,
          menuItem: { select: { name: true } },
          createdByStaff: { select: { id: true, name: true } },
        },
      }),
      prisma.branchNonMenuItemHistory.findMany({
        where: {
          type: { in: types },
          createdAt: { gte: start, lte: end },
          item: { branchId: { in: branchIds } },
        },
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: {
          id: true,
          type: true,
          quantity: true,
          note: true,
          imageUrl: true,
          batchId: true,
          documentNo: true,
          createdAt: true,
          item: {
            select: {
              branchId: true,
              name: true,
              unit: true,
              stockType: true,
            },
          },
          createdByStaff: { select: { id: true, name: true } },
        },
      }),
    ]);
    menuRows = menu as MenuRow[];
    nonMenuRows = nonMenu as NonMenuRow[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/documentNo|receivedAt|Unknown arg|column/i.test(msg)) throw e;
    const [menu, nonMenu] = await Promise.all([
      prisma.branchMenuItemStockHistory.findMany({
        where: {
          branchId: { in: branchIds },
          type: { in: types },
          createdAt: { gte: start, lte: end },
        },
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: {
          id: true,
          branchId: true,
          type: true,
          quantity: true,
          note: true,
          imageUrl: true,
          batchId: true,
          createdAt: true,
          menuItem: { select: { name: true } },
          createdByStaff: { select: { id: true, name: true } },
        },
      }),
      prisma.branchNonMenuItemHistory.findMany({
        where: {
          type: { in: types },
          createdAt: { gte: start, lte: end },
          item: { branchId: { in: branchIds } },
        },
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: {
          id: true,
          type: true,
          quantity: true,
          note: true,
          imageUrl: true,
          batchId: true,
          createdAt: true,
          item: {
            select: {
              branchId: true,
              name: true,
              unit: true,
              stockType: true,
            },
          },
          createdByStaff: { select: { id: true, name: true } },
        },
      }),
    ]);
    menuRows = menu.map((r) => ({
      ...r,
      documentNo: null,
      receivedAt: null,
    }));
    nonMenuRows = nonMenu.map((r) => ({
      ...r,
      documentNo: null,
      item: {
        ...r.item,
        stockType: r.item.stockType as NonMenuRow["item"]["stockType"],
      },
    }));
  }

  const cancelMeta = await loadCancelMeta(
    menuRows.map((m) => m.id),
    nonMenuRows.map((m) => m.id),
  );

  const flat: BranchHistoryFlatRow[] = [
    ...menuRows.map((m) => {
      const meta = cancelMeta.get(m.id);
      const order = orderFromHistoryNote(m.note);
      return {
        id: m.id,
        branchId: m.branchId,
        branchName: branchNames[m.branchId] ?? null,
        type: m.type,
        quantity: m.quantity,
        note: m.note,
        imageUrl: m.imageUrl,
        batchId: m.batchId,
        documentNo: m.documentNo,
        receivedAt: m.receivedAt,
        createdAt: m.createdAt,
        cancelledAt: meta?.cancelledAt ?? null,
        cancelNote: meta?.cancelNote ?? null,
        stockType: "SALE_ITEM" as const,
        unit: "รายการ",
        name: m.menuItem.name,
        createdByStaff: m.createdByStaff,
        order: order
          ? { id: order.orderId, orderNumber: order.orderNumber }
          : null,
      };
    }),
    ...nonMenuRows.map((m) => {
      const meta = cancelMeta.get(m.id);
      const branchId = m.item.branchId;
      return {
        id: m.id,
        branchId,
        branchName: branchNames[branchId] ?? null,
        type: m.type,
        quantity: m.quantity,
        note: m.note,
        imageUrl: m.imageUrl,
        batchId: m.batchId,
        documentNo: m.documentNo,
        receivedAt: null,
        createdAt: m.createdAt,
        cancelledAt: meta?.cancelledAt ?? null,
        cancelNote: meta?.cancelNote ?? null,
        stockType: m.item.stockType,
        unit: m.item.unit,
        name: m.item.name,
        createdByStaff: m.createdByStaff,
        order: null,
      };
    }),
  ]
    .filter((row) => matchesQuery(row, q))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  type Acc = {
    key: string;
    branchId: string;
    branchName: string | null;
    historyType: string;
    createdAt: Date;
    note: string | null;
    documentNo: string | null;
    receivedAt: Date | null;
    orderNumber: string | null;
    createdByStaff: { id: string; name: string | null } | null;
    lines: BranchHistoryFlatRow[];
  };

  const groups = new Map<string, Acc>();
  for (const row of flat) {
    const key = `b:${row.branchId}|${branchHistoryGroupKey(row)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        branchId: row.branchId,
        branchName: row.branchName ?? null,
        historyType: row.type,
        createdAt: row.createdAt,
        note: row.type === "SALE" ? null : row.note,
        documentNo: row.documentNo,
        receivedAt: row.receivedAt,
        orderNumber: row.order?.orderNumber?.trim() || null,
        createdByStaff: row.createdByStaff,
        lines: [row],
      });
    } else {
      existing.lines.push(row);
      if (row.createdAt > existing.createdAt) {
        existing.createdAt = row.createdAt;
      }
      if (!existing.note && row.type !== "SALE" && row.note) {
        existing.note = row.note;
      }
      if (!existing.documentNo && row.documentNo) {
        existing.documentNo = row.documentNo;
      }
      if (!existing.receivedAt && row.receivedAt) {
        existing.receivedAt = row.receivedAt;
      }
      if (!existing.orderNumber && row.order?.orderNumber?.trim()) {
        existing.orderNumber = row.order.orderNumber.trim();
      }
      if (!existing.createdByStaff && row.createdByStaff) {
        existing.createdByStaff = row.createdByStaff;
      }
      if (!existing.branchName && row.branchName) {
        existing.branchName = row.branchName;
      }
    }
  }

  const allBatches = Array.from(groups.values())
    .map((g) => {
      const lines = g.lines
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "th"));
      const totalQty = lines.reduce((s, l) => s + Math.abs(l.quantity), 0);
      const cancelledLines = lines.filter((l) => l.cancelledAt);
      const isCancelled =
        lines.length > 0 && cancelledLines.length === lines.length;
      const cancelTimes = cancelledLines
        .map((l) => l.cancelledAt?.getTime() ?? 0)
        .filter((n) => n > 0);
      const cancelledAt =
        cancelTimes.length > 0
          ? new Date(Math.max(...cancelTimes)).toISOString()
          : null;
      const cancelNote =
        cancelledLines.find((l) => l.cancelNote)?.cancelNote ?? null;
      const kindOf = branchHistoryKindOfType(g.historyType);
      const documentLabel =
        kindOf === "sale"
          ? g.orderNumber || g.documentNo || null
          : g.documentNo || null;
      const imageUrl = mergeMovementImageUrls(lines.map((l) => l.imageUrl));
      const imageUrls = parseMovementImages(imageUrl);
      const orderFromNote = orderFromHistoryNote(g.note);
      const displayNote =
        g.note && orderFromNote
          ? `ออเดอร์ ${orderFromNote.orderNumber}`
          : g.note;

      return {
        id: g.key,
        branchId: g.branchId,
        branchName: g.branchName,
        kind: kindOf,
        historyType: g.historyType,
        label: branchHistoryLabel(g.historyType),
        createdAt: g.createdAt.toISOString(),
        note: displayNote,
        imageUrl,
        imageUrls,
        documentNo:
          documentLabel ||
          (orderFromNote ? orderFromNote.orderNumber : null) ||
          null,
        receivedAt: g.receivedAt?.toISOString() ?? null,
        orderNumber: g.orderNumber || orderFromNote?.orderNumber || null,
        createdByStaff: g.createdByStaff
          ? {
              id: g.createdByStaff.id,
              name: g.createdByStaff.name?.trim() || "—",
            }
          : null,
        itemCount: lines.length,
        totalQty,
        isCancelled,
        cancelledAt,
        cancelNote,
        lines: lines.map((l) => ({
          id: l.id,
          name: l.name,
          quantity: Math.abs(l.quantity),
          signedQuantity: l.quantity,
          unit: l.unit,
          stockType: l.stockType,
          isCancelled: Boolean(l.cancelledAt),
          imageUrl: l.imageUrl,
        })),
      } satisfies BranchStockHistoryBatch;
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const total = allBatches.length;
  const batches = allBatches.slice(offset, offset + limit);
  const nextOffset = offset + batches.length;
  const hasMore = nextOffset < total;

  return {
    from: rangeFrom,
    to: rangeTo,
    kind,
    batches,
    total,
    limit,
    offset,
    nextOffset,
    hasMore,
  };
}
