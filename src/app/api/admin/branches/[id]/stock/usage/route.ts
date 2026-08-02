import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";

type Params = { params: Promise<{ id: string }> };

const OUTBOUND_TYPES = new Set(["ISSUE", "DAMAGE", "LOST"]);

/**
 * GET — consumable/equipment usage summary for a Bangkok date range.
 * ใช้ไป = คงเหลือต้นงวด + รับเข้า − คงเหลือปลายงวด
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from")?.trim() ?? "";
    const toStr = searchParams.get("to")?.trim() ?? fromStr;
    const stockTypeRaw = (searchParams.get("stockType")?.trim() || "CONSUMABLE").toUpperCase();
    const stockType =
      stockTypeRaw === "EQUIPMENT" ? "EQUIPMENT" : "CONSUMABLE";

    if (!fromStr || !isBangkokDateKey(fromStr)) {
      return jsonError("กรุณาระบุวันที่เริ่มต้น (YYYY-MM-DD)");
    }
    if (!toStr || !isBangkokDateKey(toStr)) {
      return jsonError("กรุณาระบุวันที่สิ้นสุด (YYYY-MM-DD)");
    }
    if (fromStr > toStr) {
      return jsonError("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด");
    }

    const rangeStart = new Date(`${fromStr}T00:00:00+07:00`);
    const rangeEnd = new Date(`${toStr}T23:59:59.999+07:00`);

    const items = await prisma.branchNonMenuItem.findMany({
      where: { branchId, stockType },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        unit: true,
        price: true,
        quantity: true,
        stockType: true,
      },
    });

    if (items.length === 0) {
      return jsonOk({
        from: fromStr,
        to: toStr,
        stockType,
        items: [],
        totals: {
          stockInQty: 0,
          issuedQty: 0,
          usedQty: 0,
          usedCostBaht: 0,
          openingQty: 0,
          closingQty: 0,
        },
      });
    }

    const itemIds = items.map((i) => i.id);
    const histories = await prisma.branchNonMenuItemHistory.findMany({
      where: {
        branchNonMenuItemId: { in: itemIds },
        createdAt: { gte: rangeStart },
      },
      select: {
        branchNonMenuItemId: true,
        quantity: true,
        type: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    type Agg = {
      deltaFromStart: number;
      deltaAfterEnd: number;
      stockInQty: number;
      issuedQty: number;
      adjustQty: number;
    };
    const byItem = new Map<string, Agg>();
    for (const id of itemIds) {
      byItem.set(id, {
        deltaFromStart: 0,
        deltaAfterEnd: 0,
        stockInQty: 0,
        issuedQty: 0,
        adjustQty: 0,
      });
    }

    for (const row of histories) {
      const agg = byItem.get(row.branchNonMenuItemId);
      if (!agg) continue;
      const q = row.quantity;
      // All movements from rangeStart onward affect "qty at start"
      agg.deltaFromStart += q;
      if (row.createdAt > rangeEnd) {
        agg.deltaAfterEnd += q;
        continue;
      }
      // Inside [rangeStart, rangeEnd]
      const type = row.type.toUpperCase();
      if (type === "STOCK_IN") {
        agg.stockInQty += Math.max(0, q);
      } else if (OUTBOUND_TYPES.has(type)) {
        agg.issuedQty += Math.abs(q);
      } else if (type === "ADJUST") {
        agg.adjustQty += q;
      }
    }

    const rows = items.map((item) => {
      const agg = byItem.get(item.id)!;
      const currentQty = item.quantity;
      const openingQty = currentQty - agg.deltaFromStart;
      const closingQty = currentQty - agg.deltaAfterEnd;
      const usedQty = Math.max(0, openingQty + agg.stockInQty - closingQty);
      const unitPrice = Number(item.price ?? 0);
      const usedCostBaht = usedQty * unitPrice;

      return {
        id: item.id,
        name: item.name,
        unit: item.unit,
        stockType: item.stockType,
        unitPrice,
        openingQty,
        stockInQty: agg.stockInQty,
        issuedQty: agg.issuedQty,
        adjustQty: agg.adjustQty,
        closingQty,
        usedQty,
        usedCostBaht,
      };
    });

    // Sort: highest usage first, then name
    rows.sort((a, b) => {
      if (b.usedQty !== a.usedQty) return b.usedQty - a.usedQty;
      if (b.usedCostBaht !== a.usedCostBaht) return b.usedCostBaht - a.usedCostBaht;
      return a.name.localeCompare(b.name, "th");
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.stockInQty += r.stockInQty;
        acc.issuedQty += r.issuedQty;
        acc.usedQty += r.usedQty;
        acc.usedCostBaht += r.usedCostBaht;
        acc.openingQty += r.openingQty;
        acc.closingQty += r.closingQty;
        return acc;
      },
      {
        stockInQty: 0,
        issuedQty: 0,
        usedQty: 0,
        usedCostBaht: 0,
        openingQty: 0,
        closingQty: 0,
      },
    );

    return jsonOk({
      from: fromStr,
      to: toStr,
      stockType,
      formula: "ใช้ไป = คงเหลือต้นงวด + รับเข้า − คงเหลือปลายงวด",
      items: rows,
      totals,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
