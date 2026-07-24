import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { bangkokDateKey } from "@/lib/branch-hours";
import { queueBusinessDateFromKey } from "@/lib/constants";
import { getCalendarDayState } from "@/lib/operating-day";
import {
  BESTSELLER_MIN_QTY,
  BESTSELLER_TOP_N,
} from "@/lib/menu-bestsellers";

type Params = { params: Promise<{ id: string }> };

const TREND_DAYS = 7;
const TREND_SERIES_TOP = 5;

function addDaysYmd(dateYmd: string, delta: number): string {
  const start = new Date(`${dateYmd}T12:00:00+07:00`);
  start.setTime(start.getTime() + delta * 24 * 60 * 60 * 1000);
  return bangkokDateKey(start);
}

function dayLabelTh(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00+07:00`);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function buildDayWindow(endYmd: string, count: number) {
  const days: { date: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = addDaysYmd(endYmd, -i);
    days.push({ date, label: dayLabelTh(date) });
  }
  return days;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const dayState = getCalendarDayState();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date")?.trim() || dayState.operatingDay;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError("รูปแบบวันที่ไม่ถูกต้อง (ใช้ YYYY-MM-DD)");
    }

    const includeTrend = searchParams.get("trend") !== "0";
    const trendDays = buildDayWindow(date, TREND_DAYS);
    const dayStart = queueBusinessDateFromKey(trendDays[0]!.date);
    const dayEnd = queueBusinessDateFromKey(date);

    const menuItems = await prisma.branchMenuItem.findMany({
      where: { branchId },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        isHidden: true,
        isOutOfStock: true,
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    const menuIds = menuItems.map((m) => m.id);

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          branchId,
          status: OrderStatus.COMPLETED,
          queueBusinessDate: includeTrend
            ? { gte: dayStart, lte: dayEnd }
            : dayEnd,
        },
        ...(menuIds.length ? { branchMenuItemId: { in: menuIds } } : {}),
      },
      select: {
        branchMenuItemId: true,
        quantity: true,
        unitPrice: true,
        optionsPrice: true,
        orderId: true,
        order: { select: { queueBusinessDate: true } },
      },
    });

    type DayAgg = { quantity: number; revenue: number };
    type MenuAgg = {
      quantity: number;
      revenue: number;
      orderIds: Set<string>;
      byDay: Map<string, DayAgg>;
    };

    const byMenu = new Map<string, MenuAgg>();
    const dayOrderIds = new Set<string>();

    for (const row of orderItems) {
      if (!row.branchMenuItemId) continue;
      const menuId = row.branchMenuItemId;
      const day = bangkokDateKey(row.order.queueBusinessDate);
      const lineRev =
        (Number(row.unitPrice) + Number(row.optionsPrice)) * row.quantity;
      const prev = byMenu.get(menuId) ?? {
        quantity: 0,
        revenue: 0,
        orderIds: new Set<string>(),
        byDay: new Map(),
      };
      const dayPrev = prev.byDay.get(day) ?? { quantity: 0, revenue: 0 };
      dayPrev.quantity += row.quantity;
      dayPrev.revenue += lineRev;
      prev.byDay.set(day, dayPrev);

      if (day === date) {
        prev.quantity += row.quantity;
        prev.revenue += lineRev;
        prev.orderIds.add(row.orderId);
        dayOrderIds.add(row.orderId);
      }
      byMenu.set(menuId, prev);
    }

    const ranked = [...byMenu.entries()]
      .map(([menuItemId, agg]) => ({
        menuItemId,
        quantity: agg.quantity,
        revenue: Math.round(agg.revenue * 100) / 100,
      }))
      .filter((r) => r.quantity >= BESTSELLER_MIN_QTY)
      .sort(
        (a, b) =>
          b.quantity - a.quantity || a.menuItemId.localeCompare(b.menuItemId),
      );
    const bestsellerIds = new Set(
      ranked.slice(0, BESTSELLER_TOP_N).map((r) => r.menuItemId),
    );

    const items = menuItems
      .map((m) => {
        const agg = byMenu.get(m.id);
        return {
          id: m.id,
          name: m.name,
          imageUrl: m.imageUrl,
          isHidden: m.isHidden,
          isOutOfStock: m.isOutOfStock,
          category: m.category,
          quantity: agg?.quantity ?? 0,
          revenue: Math.round((agg?.revenue ?? 0) * 100) / 100,
          isBestSeller: bestsellerIds.has(m.id),
        };
      })
      .sort(
        (a, b) =>
          b.quantity - a.quantity ||
          b.revenue - a.revenue ||
          a.name.localeCompare(b.name, "th"),
      );

    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    const menuRevenue =
      Math.round(items.reduce((s, i) => s + i.revenue, 0) * 100) / 100;
    const menusSold = items.filter((i) => i.quantity > 0).length;

    // Trend series: top menus by qty over the whole window
    let trend: {
      days: { date: string; label: string }[];
      series: {
        id: string;
        name: string;
        totalQty: number;
        totalRevenue: number;
        points: { date: string; quantity: number; revenue: number }[];
      }[];
    } | null = null;

    if (includeTrend) {
      const windowTotals = menuItems.map((m) => {
        const agg = byMenu.get(m.id);
        let totalQtyW = 0;
        let totalRevW = 0;
        if (agg) {
          for (const d of trendDays) {
            const p = agg.byDay.get(d.date);
            if (p) {
              totalQtyW += p.quantity;
              totalRevW += p.revenue;
            }
          }
        }
        return { id: m.id, name: m.name, totalQtyW, totalRevW };
      });

      const top = [...windowTotals]
        .filter((m) => m.totalQtyW > 0)
        .sort(
          (a, b) =>
            b.totalQtyW - a.totalQtyW || a.name.localeCompare(b.name, "th"),
        )
        .slice(0, TREND_SERIES_TOP);

      trend = {
        days: trendDays,
        series: top.map((m) => {
          const agg = byMenu.get(m.id);
          return {
            id: m.id,
            name: m.name,
            totalQty: m.totalQtyW,
            totalRevenue: Math.round(m.totalRevW * 100) / 100,
            points: trendDays.map((d) => {
              const p = agg?.byDay.get(d.date);
              return {
                date: d.date,
                quantity: p?.quantity ?? 0,
                revenue: Math.round((p?.revenue ?? 0) * 100) / 100,
              };
            }),
          };
        }),
      };
    }

    return jsonOk({
      date,
      operatingDay: dayState.operatingDay,
      summary: {
        completedOrders: dayOrderIds.size,
        totalQty,
        menuRevenue,
        menusSold,
        menusUnsold: items.length - menusSold,
        menuCount: items.length,
      },
      items,
      trend,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
