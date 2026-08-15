import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { listShiftsForBranchDate } from "@/lib/branch-shift";
import {
  assignStableMenuSequence,
  sortStaffMenuItems,
  withMenuOrderFields,
} from "@/lib/staff-menu-order";
import {
  resolveStockCountTiming,
  type StockCountTiming,
} from "@/lib/stock-count-timing";

type NoteLine = {
  name: string;
  systemQty: number;
  countedQty: number;
  unitPrice?: number;
  seq?: number;
};

type NotePayload = {
  stockType?: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
  timing?: StockCountTiming;
  cash?: number;
  transfer?: number;
  change?: number;
  customers?: number;
  pendingAdminApply?: boolean;
  lines?: NoteLine[];
};

function inferTiming(
  name: string,
  note: NotePayload,
): StockCountTiming {
  return resolveStockCountTiming({ timing: note.timing, name });
}

function inferStockType(
  name: string,
  note: NotePayload,
): "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT" {
  if (
    note.stockType === "SALE_ITEM" ||
    note.stockType === "CONSUMABLE" ||
    note.stockType === "EQUIPMENT"
  ) {
    return note.stockType;
  }
  if (name.includes("ของสิ้นเปลือง")) return "CONSUMABLE";
  if (name.includes("อุปกรณ์")) return "EQUIPMENT";
  return "SALE_ITEM";
}

function parseNote(note: string | null): NotePayload {
  if (!note) return {};
  try {
    const data = JSON.parse(note) as NotePayload;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** GET — daily sales/stock summaries for staff branch by Bangkok date */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date")?.trim() ?? "";

    if (!dateStr || !isBangkokDateKey(dateStr)) {
      return jsonError("กรุณาระบุวันที่ (YYYY-MM-DD)");
    }

    const startOfDay = new Date(`${dateStr}T00:00:00+07:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999+07:00`);

    const [shifts, counts, menuItems] = await Promise.all([
      listShiftsForBranchDate(session.branchId, dateStr),
      prisma.stockCount.findMany({
        where: {
          branchId: session.branchId,
          status: { in: ["IN_PROGRESS", "COMPLETED", "CANCELLED"] },
          OR: [
            {
              completedAt: {
                gte: startOfDay,
                lte: endOfDay,
              },
            },
            {
              completedAt: null,
              createdAt: {
                gte: startOfDay,
                lte: endOfDay,
              },
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { completedAt: "desc" }],
        include: {
          shift: {
            select: {
              id: true,
              roundNumber: true,
              openedAt: true,
              closedAt: true,
            },
          },
          createdByStaff: { select: { id: true, name: true } },
        },
      }),
      prisma.branchMenuItem.findMany({
        where: { branchId: session.branchId, isHidden: false },
        select: {
          id: true,
          name: true,
          price: true,
          sortOrder: true,
          category: { select: { sortOrder: true, stockExempt: true } },
          optionGroupLinks: {
            select: { group: { select: { mode: true } } },
          },
        },
      }),
    ]);

    const priceByName = new Map<string, number>();
    const priceById = new Map(
      menuItems.map((item) => [item.id, Number(item.price ?? 0)] as const),
    );
    const saleMenus = menuItems.filter((item) => {
      const isPromo = item.optionGroupLinks.some(
        (l) => l.group.mode === "FROM_MENU",
      );
      return !isPromo && !item.category?.stockExempt;
    });
    const sortedSaleMenus = sortStaffMenuItems(
      saleMenus.map((item) =>
        withMenuOrderFields({
          id: item.id,
          name: item.name,
          sortOrder: item.sortOrder,
          category: item.category,
        }),
      ),
    );
    const seqById = assignStableMenuSequence(sortedSaleMenus);
    const seqByName = new Map<string, number>();
    for (const item of sortedSaleMenus) {
      if (!priceByName.has(item.name)) {
        priceByName.set(item.name, priceById.get(item.id) ?? 0);
      }
      if (!seqByName.has(item.name)) {
        seqByName.set(item.name, seqById.get(item.id) ?? 0);
      }
    }
    for (const item of menuItems) {
      if (!priceByName.has(item.name)) {
        priceByName.set(item.name, Number(item.price ?? 0));
      }
    }

    const summaries = counts
      .map((c) => {
        const note = parseNote(c.note);
        const lines = (Array.isArray(note.lines) ? note.lines : [])
          .map((line) => {
            const unitPrice =
              typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice)
                ? line.unitPrice
                : (priceByName.get(line.name) ?? 0);
            const seq =
              typeof line.seq === "number" &&
              Number.isFinite(line.seq) &&
              line.seq > 0
                ? line.seq
                : (seqByName.get(line.name) ?? 0);
            return {
              name: line.name,
              systemQty: Number(line.systemQty) || 0,
              countedQty: Number(line.countedQty) || 0,
              unitPrice,
              seq,
            };
          })
          .sort((a, b) => {
            if (a.seq && b.seq && a.seq !== b.seq) return a.seq - b.seq;
            if (a.seq && !b.seq) return -1;
            if (!a.seq && b.seq) return 1;
            return a.name.localeCompare(b.name, "th");
          });
        const systemQtyTotal = lines.reduce((s, l) => s + l.systemQty, 0);
        const countedQtyTotal = lines.reduce((s, l) => s + l.countedQty, 0);
        const systemValueBaht = lines.reduce(
          (s, l) => s + l.systemQty * l.unitPrice,
          0,
        );
        const countedValueBaht = lines.reduce(
          (s, l) => s + l.countedQty * l.unitPrice,
          0,
        );

        const stockType = inferStockType(c.name, note);
        const timing = inferTiming(c.name, note);

        return {
          id: c.id,
          name: c.name,
          status: c.status,
          pendingAdminApply: Boolean(
            note.pendingAdminApply || c.status === "IN_PROGRESS",
          ),
          completedAt: (c.completedAt ?? c.createdAt).toISOString(),
          shiftId: c.shiftId,
          shift: c.shift
            ? {
                id: c.shift.id,
                roundNumber: c.shift.roundNumber,
                openedAt: c.shift.openedAt.toISOString(),
                closedAt: c.shift.closedAt?.toISOString() ?? null,
              }
            : null,
          createdByStaff: c.createdByStaff,
          stockType,
          timing,
          cash: Number(note.cash) || 0,
          transfer: Number(note.transfer) || 0,
          change: Number(note.change) || 0,
          customers: Number(note.customers) || 0,
          lines,
          stockTotals: {
            systemQty: systemQtyTotal,
            countedQty: countedQtyTotal,
            systemValueBaht,
            countedValueBaht,
          },
          rawNote: note.lines ? null : c.note,
          isDailySales:
            c.name.includes("สรุปยอดขายรายวัน") ||
            c.name.includes("สรุปยอดสต๊อกและขายราย") ||
            c.name.includes("สรุปยอดสต๊อก") ||
            (typeof note.cash === "number" && Array.isArray(note.lines)),
        };
      })
      .filter((s) => s.isDailySales)
      .map(({ isDailySales: _drop, ...rest }) => rest);

    return jsonOk({
      date: dateStr,
      shifts,
      summaries,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
