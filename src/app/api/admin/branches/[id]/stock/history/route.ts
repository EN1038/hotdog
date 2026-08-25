import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { parseBranchMenuOrderNote } from "@/lib/branch-menu-order-note";

type Params = { params: Promise<{ id: string }> };

const HISTORY_TYPES = [
  "SALE",
  "STOCK_IN",
  "ISSUE",
  "ADJUST",
  "DAMAGE",
  "LOST",
] as const;

type HistoryType = (typeof HISTORY_TYPES)[number];
type StockType = "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

function isHistoryType(v: string): v is HistoryType {
  return (HISTORY_TYPES as readonly string[]).includes(v);
}

type FlatMovement = {
  id: string;
  type: string;
  quantity: number;
  note: string | null;
  imageUrl: string | null;
  batchId: string | null;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelNote: string | null;
  stockType: StockType;
  unit: string;
  source: "menu" | "non_menu";
  menuItem: { id: string; name: string };
  createdByStaff: { id: string; name: string | null } | null;
  order: { id: string; orderNumber: string } | null;
};

function fallbackGroupKey(row: FlatMovement) {
  const minuteKey = new Date(row.createdAt);
  minuteKey.setSeconds(0, 0);
  return [
    "fb",
    row.type,
    row.createdByStaff?.id ?? "none",
    row.note ?? "",
    row.imageUrl ?? "",
    minuteKey.toISOString(),
  ].join("|");
}

function matchesQuery(row: FlatMovement, q: string) {
  if (!q) return true;
  const hay = [
    row.menuItem.name,
    row.note ?? "",
    row.createdByStaff?.name ?? "",
    row.order?.orderNumber ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/** GET — branch stock history (menu + non-menu) for admin movements tab */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from")?.trim() ?? "";
    const toStr = searchParams.get("to")?.trim() ?? "";
    const dateStr = searchParams.get("date")?.trim() ?? "";
    const shiftId = searchParams.get("shiftId")?.trim() || null;
    const typeRaw = searchParams.get("type")?.trim().toUpperCase() || "ALL";
    const q = searchParams.get("q")?.trim().toLowerCase() || "";

    const WASTE_TYPES = ["DAMAGE", "LOST"] as const;

    let rangeStart: Date;
    let rangeEnd: Date;
    let shiftOrderIds: Set<string> | null = null;

    if (isBangkokDateKey(fromStr) && isBangkokDateKey(toStr)) {
      const startKey = fromStr <= toStr ? fromStr : toStr;
      const endKey = fromStr <= toStr ? toStr : fromStr;
      rangeStart = new Date(`${startKey}T00:00:00+07:00`);
      rangeEnd = new Date(`${endKey}T23:59:59.999+07:00`);
    } else if (dateStr && isBangkokDateKey(dateStr)) {
      rangeStart = new Date(`${dateStr}T00:00:00+07:00`);
      rangeEnd = new Date(`${dateStr}T23:59:59.999+07:00`);
    } else {
      return jsonError("กรุณาระบุวันที่ (YYYY-MM-DD)");
    }

    if (shiftId) {
      const shift = await prisma.branchShift.findFirst({
        where: { id: shiftId, branchId },
        select: {
          id: true,
          openedAt: true,
          closedAt: true,
        },
      });
      if (!shift) return jsonError("ไม่พบรอบขาย", 404);
      rangeStart = shift.openedAt;
      rangeEnd = shift.closedAt ?? new Date();
      const orders = await prisma.order.findMany({
        where: { shiftId: shift.id },
        select: { id: true },
      });
      shiftOrderIds = new Set(orders.map((o) => o.id));
    }

    const typeWhere =
      typeRaw === "WASTE"
        ? { type: { in: [...WASTE_TYPES] } }
        : typeRaw === "ALL" || !isHistoryType(typeRaw)
          ? {}
          : { type: typeRaw };
    const take = isBangkokDateKey(fromStr) && isBangkokDateKey(toStr) ? 2000 : 500;

    const [menuRows, nonMenuRows] = await Promise.all([
      prisma.branchMenuItemStockHistory.findMany({
        where: {
          branchId,
          createdAt: { gte: rangeStart, lte: rangeEnd },
          ...typeWhere,
        },
        orderBy: { createdAt: "desc" },
        take,
        include: {
          menuItem: { select: { id: true, name: true } },
          createdByStaff: { select: { id: true, name: true } },
        },
      }),
      prisma.branchNonMenuItemHistory.findMany({
        where: {
          createdAt: { gte: rangeStart, lte: rangeEnd },
          item: { branchId },
          ...typeWhere,
        },
        orderBy: { createdAt: "desc" },
        take,
        include: {
          item: {
            select: { id: true, name: true, unit: true, stockType: true },
          },
          createdByStaff: { select: { id: true, name: true } },
        },
      }),
    ]);

    // Cancel meta may be missing on old DBs — ensure columns then load via SQL
    const menuIds = menuRows.map((r) => r.id);
    const nonMenuIds = nonMenuRows.map((r) => r.id);
    const cancelMeta = new Map<
      string,
      { cancelledAt: Date | null; cancelNote: string | null }
    >();
    const schema = (process.env.DATABASE_SCHEMA ?? "public").replace(/"/g, "");
    try {
      const { ensureStockHistoryCancelColumns } = await import(
        "@/lib/stock-history-cancel"
      );
      await ensureStockHistoryCancelColumns();
    } catch (e) {
      console.error("[stock/history] ensure cancel columns", e);
    }
    try {
      if (menuIds.length > 0) {
        const { Prisma } = await import("@prisma/client");
        const rows = await prisma.$queryRaw<
          Array<{
            id: string;
            cancelledAt: Date | null;
            cancelNote: string | null;
          }>
        >`
          SELECT id, "cancelledAt", "cancelNote"
          FROM ${Prisma.raw(`"${schema}"."BranchMenuItemStockHistory"`)}
          WHERE id IN (${Prisma.join(menuIds)})
        `;
        for (const r of rows) {
          cancelMeta.set(r.id, {
            cancelledAt: r.cancelledAt ?? null,
            cancelNote: r.cancelNote ?? null,
          });
        }
      }
      if (nonMenuIds.length > 0) {
        const { Prisma } = await import("@prisma/client");
        const rows = await prisma.$queryRaw<
          Array<{
            id: string;
            cancelledAt: Date | null;
            cancelNote: string | null;
          }>
        >`
          SELECT id, "cancelledAt", "cancelNote"
          FROM ${Prisma.raw(`"${schema}"."BranchNonMenuItemHistory"`)}
          WHERE id IN (${Prisma.join(nonMenuIds)})
        `;
        for (const r of rows) {
          cancelMeta.set(r.id, {
            cancelledAt: r.cancelledAt ?? null,
            cancelNote: r.cancelNote ?? null,
          });
        }
      }
    } catch (e) {
      console.error("[stock/history] load cancel meta failed", e);
    }

    const flat: FlatMovement[] = [
      ...menuRows.map((r) => {
        const parsed = parseBranchMenuOrderNote(r.note);
        const meta = cancelMeta.get(r.id);
        return {
          id: r.id,
          type: r.type,
          quantity: r.quantity,
          note: r.note,
          imageUrl: r.imageUrl,
          batchId: r.batchId,
          createdAt: r.createdAt,
          cancelledAt: meta?.cancelledAt ?? null,
          cancelNote: meta?.cancelNote ?? null,
          stockType: "SALE_ITEM" as const,
          unit: "รายการ",
          source: "menu" as const,
          menuItem: r.menuItem,
          createdByStaff: r.createdByStaff,
          order: parsed
            ? { id: parsed.orderId, orderNumber: parsed.orderNumber }
            : null,
        };
      }),
      ...nonMenuRows.map((r) => {
        const meta = cancelMeta.get(r.id);
        return {
          id: r.id,
          type: r.type,
          quantity: r.quantity,
          note: r.note,
          imageUrl: r.imageUrl,
          batchId: r.batchId,
          createdAt: r.createdAt,
          cancelledAt: meta?.cancelledAt ?? null,
          cancelNote: meta?.cancelNote ?? null,
          stockType: r.item.stockType as StockType,
          unit: r.item.unit,
          source: "non_menu" as const,
          menuItem: { id: r.item.id, name: r.item.name },
          createdByStaff: r.createdByStaff,
          order: null,
        };
      }),
    ];

    const filtered = flat
      .filter((m) => {
        if (!shiftOrderIds) return true;
        if (m.type !== "SALE") return true;
        if (!m.order) return false;
        return shiftOrderIds.has(m.order.id);
      })
      .filter((m) => matchesQuery(m, q))
      .sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(0, 500);

    const movements = filtered.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      note: m.note,
      imageUrl: m.imageUrl,
      batchId: m.batchId,
      createdAt: m.createdAt.toISOString(),
      cancelledAt: m.cancelledAt?.toISOString() ?? null,
      cancelNote: m.cancelNote,
      isCancelled: Boolean(m.cancelledAt),
      stockType: m.stockType,
      unit: m.unit,
      source: m.source,
      menuItem: m.menuItem,
      createdByStaff: m.createdByStaff
        ? {
            id: m.createdByStaff.id,
            name: m.createdByStaff.name?.trim() || "—",
          }
        : null,
      order: m.order,
    }));

    const resolvedType =
      typeRaw === "ALL" || !isHistoryType(typeRaw) ? "ALL" : typeRaw;

    let batches: Array<{
      id: string;
      type: string;
      createdAt: string;
      note: string | null;
      imageUrl: string | null;
      createdByStaff: { id: string; name: string } | null;
      itemCount: number;
      totalQty: number;
      stockTypes: string[];
      isCancelled: boolean;
      cancelledAt: string | null;
      cancelNote: string | null;
      lines: Array<{
        id: string;
        name: string;
        quantity: number;
        signedQuantity: number;
        unit: string;
        stockType: StockType;
        source: "menu" | "non_menu";
        isCancelled: boolean;
      }>;
    }> | null = null;

    if (resolvedType === "STOCK_IN" || resolvedType === "ISSUE") {
      type Acc = {
        id: string;
        type: string;
        createdAt: Date;
        note: string | null;
        imageUrl: string | null;
        createdByStaff: { id: string; name: string | null } | null;
        lines: FlatMovement[];
      };
      const groups = new Map<string, Acc>();
      for (const row of filtered) {
        const key = row.batchId?.trim()
          ? `batch:${row.batchId.trim()}`
          : fallbackGroupKey(row);
        const existing = groups.get(key);
        if (!existing) {
          groups.set(key, {
            id: row.batchId?.trim() || key,
            type: row.type,
            createdAt: row.createdAt,
            note: row.note,
            imageUrl: row.imageUrl,
            createdByStaff: row.createdByStaff,
            lines: [row],
          });
        } else {
          existing.lines.push(row);
          if (row.createdAt > existing.createdAt) {
            existing.createdAt = row.createdAt;
          }
          if (!existing.note && row.note) existing.note = row.note;
          if (!existing.imageUrl && row.imageUrl) {
            existing.imageUrl = row.imageUrl;
          }
          if (!existing.createdByStaff && row.createdByStaff) {
            existing.createdByStaff = row.createdByStaff;
          }
        }
      }

      batches = Array.from(groups.values())
        .map((g) => {
          const lines = g.lines
            .slice()
            .sort((a, b) =>
              a.menuItem.name.localeCompare(b.menuItem.name, "th"),
            );
          const totalQty = lines.reduce((s, l) => s + Math.abs(l.quantity), 0);
          const stockTypes = Array.from(
            new Set(lines.map((l) => l.stockType)),
          );
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
          return {
            id: g.id,
            type: g.type,
            createdAt: g.createdAt.toISOString(),
            note: g.note,
            imageUrl: g.imageUrl,
            createdByStaff: g.createdByStaff
              ? {
                  id: g.createdByStaff.id,
                  name: g.createdByStaff.name?.trim() || "—",
                }
              : null,
            itemCount: lines.length,
            totalQty,
            stockTypes,
            isCancelled,
            cancelledAt,
            cancelNote,
            lines: lines.map((l) => ({
              id: l.id,
              name: l.menuItem.name,
              quantity: Math.abs(l.quantity),
              signedQuantity: l.quantity,
              unit: l.unit,
              stockType: l.stockType,
              source: l.source,
              isCancelled: Boolean(l.cancelledAt),
            })),
          };
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }

    return jsonOk({
      date: dateStr,
      shiftId,
      type: resolvedType,
      q: q || null,
      movements,
      batches,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
