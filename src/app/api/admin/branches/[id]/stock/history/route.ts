import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { parseBranchMenuOrderNote } from "@/lib/stock";

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

function isHistoryType(v: string): v is HistoryType {
  return (HISTORY_TYPES as readonly string[]).includes(v);
}

/** GET — BranchMenuItemStockHistory for admin movements tab */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date")?.trim() ?? "";
    const shiftId = searchParams.get("shiftId")?.trim() || null;
    const typeRaw = searchParams.get("type")?.trim().toUpperCase() || "ALL";

    if (!dateStr || !isBangkokDateKey(dateStr)) {
      return jsonError("กรุณาระบุวันที่ (YYYY-MM-DD)");
    }

    let rangeStart = new Date(`${dateStr}T00:00:00+07:00`);
    let rangeEnd = new Date(`${dateStr}T23:59:59.999+07:00`);
    let shiftOrderIds: Set<string> | null = null;

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

    const typeFilter =
      typeRaw === "ALL" || !isHistoryType(typeRaw) ? undefined : typeRaw;

    const rows = await prisma.branchMenuItemStockHistory.findMany({
      where: {
        branchId,
        createdAt: { gte: rangeStart, lte: rangeEnd },
        ...(typeFilter ? { type: typeFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        menuItem: { select: { id: true, name: true } },
        createdByStaff: { select: { id: true, name: true } },
      },
    });

    const movements = rows
      .map((r) => {
        const parsed = parseBranchMenuOrderNote(r.note);
        return {
          id: r.id,
          type: r.type,
          quantity: r.quantity,
          note: r.note,
          createdAt: r.createdAt.toISOString(),
          menuItem: r.menuItem,
          createdByStaff: r.createdByStaff,
          order: parsed
            ? { id: parsed.orderId, orderNumber: parsed.orderNumber }
            : null,
        };
      })
      .filter((m) => {
        if (!shiftOrderIds) return true;
        // Within shift window already; SALE rows must belong to this shift's orders
        if (m.type !== "SALE") return true;
        if (!m.order) return false;
        return shiftOrderIds.has(m.order.id);
      });

    return jsonOk({
      date: dateStr,
      shiftId,
      type: typeRaw === "ALL" || !isHistoryType(typeRaw) ? "ALL" : typeRaw,
      movements,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
