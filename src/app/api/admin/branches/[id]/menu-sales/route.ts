import { BranchOperatingMode, OrderStatus, SkewerOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { bangkokDateKey } from "@/lib/branch-hours";
import {
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { getCalendarDayState } from "@/lib/operating-day";
import {
  BESTSELLER_MIN_QTY,
  BESTSELLER_TOP_N,
} from "@/lib/menu-bestsellers";
import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";
import {
  requestedDateToKey,
  skewerLineSubtotalBaht,
  skewerOrderUsesConfirmedQty,
} from "@/lib/skewer-order";
import {
  addCookSlice,
  COOK_METHOD_LABEL,
  emptyCookBreakdown,
  parseCookMethod,
  roundCookBreakdown,
  type CookBreakdown,
  type CookMethod,
} from "@/lib/cook-method";
import {
  extractFilterableOptionTokens,
  OPTION_FILTER_NONE,
  optionSummaryFromMap,
} from "@/lib/order-option-tokens";

type Params = { params: Promise<{ id: string }> };

const TREND_SERIES_TOP = 5;

type QtyRev = { quantity: number; revenue: number };

function emptyQtyRev(): QtyRev {
  return { quantity: 0, revenue: 0 };
}

/** Prefer explicit option=…; map legacy cook= for older clients. */
function parseOptionFilter(searchParams: URLSearchParams): string | null {
  const option = searchParams.get("option")?.trim();
  if (option) {
    if (option === OPTION_FILTER_NONE) return OPTION_FILTER_NONE;
    return option.slice(0, 80);
  }
  const cook = searchParams.get("cook")?.trim();
  if (cook === "grill") return "ย่าง";
  if (cook === "fry") return "ทอด";
  if (cook === "unknown") return OPTION_FILTER_NONE;
  return null;
}

function addDaysYmd(dateYmd: string, delta: number): string {
  const start = new Date(`${dateYmd}T12:00:00+07:00`);
  start.setTime(start.getTime() + delta * 24 * 60 * 60 * 1000);
  return bangkokDateKey(start);
}

function dayLabelTh(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00+07:00`);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function buildDayWindow(fromYmd: string, toYmd: string) {
  const days: { date: string; label: string }[] = [];
  let cur = fromYmd;
  for (let i = 0; i < 93; i += 1) {
    days.push({ date: cur, label: dayLabelTh(cur) });
    if (cur >= toYmd) break;
    cur = addDaysYmd(cur, 1);
  }
  return days;
}

function normalizeRange(fromRaw: string, toRaw: string) {
  return fromRaw <= toRaw
    ? { from: fromRaw, to: toRaw }
    : { from: toRaw, to: fromRaw };
}

type DayAgg = {
  quantity: number;
  revenue: number;
  byCook: CookBreakdown;
  byOption: Map<string, QtyRev>;
  none: QtyRev;
};

type MenuAgg = {
  quantity: number;
  revenue: number;
  byCook: CookBreakdown;
  byOption: Map<string, QtyRev>;
  none: QtyRev;
  orderIds: Set<string>;
  byDay: Map<string, DayAgg>;
};

function emptyDayAgg(): DayAgg {
  return {
    quantity: 0,
    revenue: 0,
    byCook: emptyCookBreakdown(),
    byOption: new Map(),
    none: emptyQtyRev(),
  };
}

function emptyMenuAgg(): MenuAgg {
  return {
    quantity: 0,
    revenue: 0,
    byCook: emptyCookBreakdown(),
    byOption: new Map(),
    none: emptyQtyRev(),
    orderIds: new Set(),
    byDay: new Map(),
  };
}

function addQtyRev(target: QtyRev, quantity: number, revenue: number) {
  target.quantity += quantity;
  target.revenue += revenue;
}

function addOptionQtyRev(
  map: Map<string, QtyRev>,
  name: string,
  quantity: number,
  revenue: number,
) {
  const cur = map.get(name) ?? emptyQtyRev();
  addQtyRev(cur, quantity, revenue);
  map.set(name, cur);
}

function accumulateLine(
  byMenu: Map<string, MenuAgg>,
  rangeOrderIds: Set<string>,
  cookSummary: CookBreakdown,
  optionSummary: Map<string, QtyRev>,
  noneSummary: QtyRev,
  input: {
    menuId: string;
    orderId: string;
    day: string;
    quantity: number;
    lineRev: number;
    optionsText: string | null | undefined;
    from: string;
    to: string;
  },
) {
  if (input.quantity <= 0) return;
  const cook = parseCookMethod(input.optionsText);
  const tokens = extractFilterableOptionTokens(input.optionsText);
  const prev = byMenu.get(input.menuId) ?? emptyMenuAgg();
  const dayPrev = prev.byDay.get(input.day) ?? emptyDayAgg();

  dayPrev.quantity += input.quantity;
  dayPrev.revenue += input.lineRev;
  addCookSlice(dayPrev.byCook, cook, input.quantity, input.lineRev);
  if (tokens.length === 0) {
    addQtyRev(dayPrev.none, input.quantity, input.lineRev);
  } else {
    for (const token of tokens) {
      addOptionQtyRev(dayPrev.byOption, token, input.quantity, input.lineRev);
    }
  }
  prev.byDay.set(input.day, dayPrev);

  if (input.day >= input.from && input.day <= input.to) {
    prev.quantity += input.quantity;
    prev.revenue += input.lineRev;
    addCookSlice(prev.byCook, cook, input.quantity, input.lineRev);
    addCookSlice(cookSummary, cook, input.quantity, input.lineRev);
    if (tokens.length === 0) {
      addQtyRev(prev.none, input.quantity, input.lineRev);
      addQtyRev(noneSummary, input.quantity, input.lineRev);
    } else {
      for (const token of tokens) {
        addOptionQtyRev(prev.byOption, token, input.quantity, input.lineRev);
        addOptionQtyRev(optionSummary, token, input.quantity, input.lineRev);
      }
    }
    prev.orderIds.add(input.orderId);
    rangeOrderIds.add(input.orderId);
  }
  byMenu.set(input.menuId, prev);
}

function sliceForOption(
  quantity: number,
  revenue: number,
  byOption: Map<string, QtyRev>,
  none: QtyRev,
  optionFilter: string | null,
): QtyRev {
  if (!optionFilter) return { quantity, revenue };
  if (optionFilter === OPTION_FILTER_NONE) {
    return { quantity: none.quantity, revenue: none.revenue };
  }
  const hit = byOption.get(optionFilter);
  return hit
    ? { quantity: hit.quantity, revenue: hit.revenue }
    : emptyQtyRev();
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, operatingMode: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const dayState = getCalendarDayState();
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    const dateParam = searchParams.get("date")?.trim();
    const optionFilter = parseOptionFilter(searchParams);

    let from: string;
    let to: string;
    if (
      fromParam &&
      toParam &&
      isBangkokDateKey(fromParam) &&
      isBangkokDateKey(toParam)
    ) {
      ({ from, to } = normalizeRange(fromParam, toParam));
    } else {
      const date =
        dateParam && isBangkokDateKey(dateParam)
          ? dateParam
          : dayState.operatingDay;
      from = date;
      to = date;
    }

    const includeTrend = searchParams.get("trend") !== "0";
    const trendDays = buildDayWindow(from, to);
    const dayStart = queueBusinessDateFromKey(trendDays[0]!.date);
    const dayEnd = queueBusinessDateFromKey(to);
    const isSkewer = branch.operatingMode === BranchOperatingMode.SKEWER;

    const menuItems = await prisma.branchMenuItem.findMany({
      where: { branchId },
      select: {
        id: true,
        name: true,
        itemCode: true,
        imageUrl: true,
        isHidden: true,
        isOutOfStock: true,
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    const menuIds = menuItems.map((m) => m.id);
    const byMenu = new Map<string, MenuAgg>();
    const rangeOrderIds = new Set<string>();
    const cookSummary = emptyCookBreakdown();
    const optionSummaryMap = new Map<string, QtyRev>();
    const noneSummary = emptyQtyRev();

    if (isSkewer) {
      const skewerItems = await prisma.skewerOrderItem.findMany({
        where: {
          skewerOrder: {
            branchId,
            status: {
              in: [SkewerOrderStatus.CONFIRMED, SkewerOrderStatus.DELIVERED],
            },
            requestedDate: { gte: dayStart, lte: dayEnd },
          },
          ...(menuIds.length ? { branchMenuItemId: { in: menuIds } } : {}),
        },
        select: {
          branchMenuItemId: true,
          requestedQuantity: true,
          confirmedQuantity: true,
          unitPriceBaht: true,
          skewerOrderId: true,
          skewerOrder: {
            select: { requestedDate: true, status: true },
          },
        },
      });

      for (const row of skewerItems) {
        if (!row.branchMenuItemId) continue;
        const useConfirmed = skewerOrderUsesConfirmedQty(row.skewerOrder.status);
        const quantity = useConfirmed
          ? Math.max(0, row.confirmedQuantity ?? 0)
          : Math.max(0, row.requestedQuantity);
        const unit = Number(row.unitPriceBaht ?? 0);
        const lineRev = skewerLineSubtotalBaht(
          quantity,
          Number.isFinite(unit) ? unit : 0,
        );
        accumulateLine(
          byMenu,
          rangeOrderIds,
          cookSummary,
          optionSummaryMap,
          noneSummary,
          {
            menuId: row.branchMenuItemId,
            orderId: row.skewerOrderId,
            day: requestedDateToKey(row.skewerOrder.requestedDate),
            quantity,
            lineRev,
            optionsText: null,
            from,
            to,
          },
        );
      }
    } else {
      const orderItems = await prisma.orderItem.findMany({
        where: {
          order: {
            branchId,
            status: OrderStatus.COMPLETED,
            queueBusinessDate: { gte: dayStart, lte: dayEnd },
          },
          ...(menuIds.length ? { branchMenuItemId: { in: menuIds } } : {}),
        },
        select: {
          branchMenuItemId: true,
          quantity: true,
          unitPrice: true,
          optionsPrice: true,
          optionsText: true,
          orderId: true,
          order: { select: { queueBusinessDate: true } },
        },
      });

      for (const row of orderItems) {
        if (!row.branchMenuItemId) continue;
        const lineRev =
          (Number(row.unitPrice) + Number(row.optionsPrice)) * row.quantity;
        accumulateLine(
          byMenu,
          rangeOrderIds,
          cookSummary,
          optionSummaryMap,
          noneSummary,
          {
            menuId: row.branchMenuItemId,
            orderId: row.orderId,
            day: bangkokDateKey(row.order.queueBusinessDate),
            quantity: row.quantity,
            lineRev,
            optionsText: row.optionsText,
            from,
            to,
          },
        );
      }
    }

    const ranked = [...byMenu.entries()]
      .map(([menuItemId, agg]) => {
        const sliced = sliceForOption(
          agg.quantity,
          agg.revenue,
          agg.byOption,
          agg.none,
          optionFilter,
        );
        return {
          menuItemId,
          quantity: sliced.quantity,
          revenue: Math.round(sliced.revenue * 100) / 100,
        };
      })
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
        const agg = byMenu.get(m.id) ?? emptyMenuAgg();
        const byCook = roundCookBreakdown(agg.byCook);
        const sliced = sliceForOption(
          agg.quantity,
          agg.revenue,
          agg.byOption,
          agg.none,
          optionFilter,
        );
        return {
          id: m.id,
          name: m.name,
          productCode: resolveMenuItemProductCode({
            id: m.id,
            itemCode: m.itemCode ?? null,
          }),
          imageUrl: m.imageUrl,
          isHidden: m.isHidden,
          isOutOfStock: m.isOutOfStock,
          category: m.category,
          quantity: sliced.quantity,
          revenue: Math.round(sliced.revenue * 100) / 100,
          byCook,
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

    type TrendSeries = {
      id: string;
      name: string;
      totalQty: number;
      totalRevenue: number;
      points: { date: string; quantity: number; revenue: number }[];
    };

    let trend: {
      days: { date: string; label: string }[];
      series: TrendSeries[];
      cookSeries: TrendSeries[];
    } | null = null;

    if (includeTrend) {
      const windowTotals = menuItems.map((m) => {
        const agg = byMenu.get(m.id);
        let totalQtyW = 0;
        let totalRevW = 0;
        if (agg) {
          for (const d of trendDays) {
            const p = agg.byDay.get(d.date);
            if (!p) continue;
            const sliced = sliceForOption(
              p.quantity,
              p.revenue,
              p.byOption,
              p.none,
              optionFilter,
            );
            totalQtyW += sliced.quantity;
            totalRevW += sliced.revenue;
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

      const cookDayTotals = new Map<
        string,
        { grill: QtyRev; fry: QtyRev }
      >();
      for (const d of trendDays) {
        cookDayTotals.set(d.date, {
          grill: emptyQtyRev(),
          fry: emptyQtyRev(),
        });
      }
      for (const agg of byMenu.values()) {
        for (const d of trendDays) {
          const p = agg.byDay.get(d.date);
          if (!p) continue;
          const bucket = cookDayTotals.get(d.date)!;
          addQtyRev(
            bucket.grill,
            p.byCook.grill.quantity,
            p.byCook.grill.revenueBaht,
          );
          addQtyRev(
            bucket.fry,
            p.byCook.fry.quantity,
            p.byCook.fry.revenueBaht,
          );
        }
      }

      const buildCookSeries = (
        id: "grill" | "fry",
        label: string,
      ): TrendSeries => {
        const points = trendDays.map((d) => {
          const bucket = cookDayTotals.get(d.date)!;
          const slice = bucket[id];
          return {
            date: d.date,
            quantity: slice.quantity,
            revenue: Math.round(slice.revenue * 100) / 100,
          };
        });
        const totalQty = points.reduce((s, p) => s + p.quantity, 0);
        const totalRevenue =
          Math.round(points.reduce((s, p) => s + p.revenue, 0) * 100) / 100;
        return {
          id,
          name: label,
          totalQty,
          totalRevenue,
          points,
        };
      };

      const cookSeries = [
        buildCookSeries("grill", COOK_METHOD_LABEL.grill),
        buildCookSeries("fry", COOK_METHOD_LABEL.fry),
      ].filter((s) => s.totalQty > 0);

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
              if (!p) {
                return { date: d.date, quantity: 0, revenue: 0 };
              }
              const sliced = sliceForOption(
                p.quantity,
                p.revenue,
                p.byOption,
                p.none,
                optionFilter,
              );
              return {
                date: d.date,
                quantity: sliced.quantity,
                revenue: Math.round(sliced.revenue * 100) / 100,
              };
            }),
          };
        }),
        cookSeries,
      };
    }

    const optionSummary = optionSummaryFromMap(
      new Map(
        [...optionSummaryMap].map(([name, v]) => [
          name,
          { quantity: v.quantity, revenueBaht: v.revenue },
        ]),
      ),
      noneSummary.quantity,
      noneSummary.revenue,
    );

    // Legacy cook field for older UI — derived from option filter when possible
    let cookLegacy: CookMethod | null = null;
    if (optionFilter === "ย่าง") cookLegacy = "grill";
    else if (optionFilter === "ทอด") cookLegacy = "fry";
    else if (optionFilter === OPTION_FILTER_NONE) cookLegacy = "unknown";

    return jsonOk({
      from,
      to,
      date: to,
      operatingDay: dayState.operatingDay,
      option: optionFilter,
      optionSummary,
      cook: cookLegacy,
      cookSummary: roundCookBreakdown(cookSummary),
      summary: {
        completedOrders: rangeOrderIds.size,
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
