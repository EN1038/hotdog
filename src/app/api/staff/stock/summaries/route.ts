import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { listShiftsForBranchDate } from "@/lib/branch-shift";

type NoteLine = {
  name: string;
  systemQty: number;
  countedQty: number;
  unitPrice?: number;
};

type NotePayload = {
  cash?: number;
  transfer?: number;
  change?: number;
  customers?: number;
  lines?: NoteLine[];
};

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
          status: "COMPLETED",
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
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
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
        select: { name: true, price: true },
      }),
    ]);

    const priceByName = new Map<string, number>();
    for (const item of menuItems) {
      if (!priceByName.has(item.name)) {
        priceByName.set(item.name, Number(item.price ?? 0));
      }
    }

    const summaries = counts
      .map((c) => {
        const note = parseNote(c.note);
        const lines = (Array.isArray(note.lines) ? note.lines : []).map(
          (line) => {
            const unitPrice =
              typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice)
                ? line.unitPrice
                : (priceByName.get(line.name) ?? 0);
            return {
              name: line.name,
              systemQty: Number(line.systemQty) || 0,
              countedQty: Number(line.countedQty) || 0,
              unitPrice,
            };
          },
        );
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

        return {
          id: c.id,
          name: c.name,
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
