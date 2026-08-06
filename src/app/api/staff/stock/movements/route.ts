import { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";

type Kind = "stock_in" | "issue";

type HistoryLine = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  stockType: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
  createdAt: Date;
  note: string | null;
  imageUrl: string | null;
  batchId: string | null;
  cancelledAt: Date | null;
  cancelNote: string | null;
  createdByStaff: { id: string; name: string | null } | null;
};

function bangkokDayRange(dateStr: string) {
  return {
    start: new Date(`${dateStr}T00:00:00+07:00`),
    end: new Date(`${dateStr}T23:59:59.999+07:00`),
  };
}

function fallbackGroupKey(row: HistoryLine, type: string) {
  const minuteKey = new Date(row.createdAt);
  minuteKey.setSeconds(0, 0);
  return [
    "fb",
    type,
    row.createdByStaff?.id ?? "none",
    row.note ?? "",
    row.imageUrl ?? "",
    minuteKey.toISOString(),
  ].join("|");
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
    /* columns may already exist */
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
    console.error("[staff/stock/movements] cancel meta", e);
  }
  return map;
}

/** GET — staff stock_in / issue history batches for a Bangkok calendar day */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date")?.trim() ?? "";
    const kindRaw = searchParams.get("kind")?.trim() ?? "";

    if (!dateStr || !isBangkokDateKey(dateStr)) {
      return jsonError("กรุณาระบุวันที่ (YYYY-MM-DD)");
    }
    if (kindRaw !== "stock_in" && kindRaw !== "issue") {
      return jsonError("กรุณาระบุ kind=stock_in หรือ kind=issue");
    }
    const kind = kindRaw as Kind;
    const type = kind === "stock_in" ? "STOCK_IN" : "ISSUE";
    const { start, end } = bangkokDayRange(dateStr);

    const [menuRows, nonMenuRows] = await Promise.all([
      prisma.branchMenuItemStockHistory.findMany({
        where: {
          branchId: session.branchId,
          type,
          createdAt: { gte: start, lte: end },
        },
        orderBy: { createdAt: "desc" },
        include: {
          menuItem: { select: { name: true } },
          createdByStaff: { select: { id: true, name: true } },
        },
      }),
      prisma.branchNonMenuItemHistory.findMany({
        where: {
          type,
          createdAt: { gte: start, lte: end },
          item: { branchId: session.branchId },
        },
        orderBy: { createdAt: "desc" },
        include: {
          item: { select: { name: true, unit: true, stockType: true } },
          createdByStaff: { select: { id: true, name: true } },
        },
      }),
    ]);

    const cancelMeta = await loadCancelMeta(
      menuRows.map((m) => m.id),
      nonMenuRows.map((m) => m.id),
    );

    const flat: HistoryLine[] = [
      ...menuRows.map((m) => {
        const meta = cancelMeta.get(m.id);
        return {
          id: m.id,
          name: m.menuItem.name,
          quantity: m.quantity,
          unit: "รายการ",
          stockType: "SALE_ITEM" as const,
          createdAt: m.createdAt,
          note: m.note,
          imageUrl: m.imageUrl,
          batchId: m.batchId,
          cancelledAt: meta?.cancelledAt ?? null,
          cancelNote: meta?.cancelNote ?? null,
          createdByStaff: m.createdByStaff,
        };
      }),
      ...nonMenuRows.map((m) => {
        const meta = cancelMeta.get(m.id);
        return {
          id: m.id,
          name: m.item.name,
          quantity: m.quantity,
          unit: m.item.unit,
          stockType: m.item.stockType as HistoryLine["stockType"],
          createdAt: m.createdAt,
          note: m.note,
          imageUrl: m.imageUrl,
          batchId: m.batchId,
          cancelledAt: meta?.cancelledAt ?? null,
          cancelNote: meta?.cancelNote ?? null,
          createdByStaff: m.createdByStaff,
        };
      }),
    ];

    type Acc = {
      id: string;
      createdAt: Date;
      note: string | null;
      imageUrl: string | null;
      createdByStaff: { id: string; name: string | null } | null;
      lines: Array<{
        id: string;
        name: string;
        quantity: number;
        displayQty: number;
        unit: string;
        stockType: HistoryLine["stockType"];
        isCancelled: boolean;
        cancelledAt: Date | null;
        cancelNote: string | null;
      }>;
    };

    const groups = new Map<string, Acc>();

    for (const row of flat) {
      const key = row.batchId?.trim()
        ? `batch:${row.batchId.trim()}`
        : fallbackGroupKey(row, type);
      const existing = groups.get(key);
      const displayQty = Math.abs(row.quantity);
      const line = {
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        displayQty,
        unit: row.unit,
        stockType: row.stockType,
        isCancelled: Boolean(row.cancelledAt),
        cancelledAt: row.cancelledAt,
        cancelNote: row.cancelNote,
      };
      if (!existing) {
        groups.set(key, {
          id: row.batchId?.trim() || key,
          createdAt: row.createdAt,
          note: row.note,
          imageUrl: row.imageUrl,
          createdByStaff: row.createdByStaff,
          lines: [line],
        });
      } else {
        existing.lines.push(line);
        if (row.createdAt > existing.createdAt) {
          existing.createdAt = row.createdAt;
        }
        if (!existing.note && row.note) existing.note = row.note;
        if (!existing.imageUrl && row.imageUrl) existing.imageUrl = row.imageUrl;
        if (!existing.createdByStaff && row.createdByStaff) {
          existing.createdByStaff = row.createdByStaff;
        }
      }
    }

    const batches = Array.from(groups.values())
      .map((g) => {
        const lines = g.lines
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "th"));
        const totalQty = lines.reduce((s, l) => s + l.displayQty, 0);
        const cancelledLines = lines.filter((l) => l.isCancelled);
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
          kind,
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
          isCancelled,
          cancelledAt,
          cancelNote,
          lines: lines.map((l) => ({
            id: l.id,
            name: l.name,
            quantity: l.displayQty,
            signedQuantity: l.quantity,
            unit: l.unit,
            stockType: l.stockType,
            isCancelled: l.isCancelled,
          })),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return jsonOk({ date: dateStr, kind, batches });
  } catch (error) {
    return handleApiError(error);
  }
}
