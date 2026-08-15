import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getCalendarDayState } from "@/lib/operating-day";
import { buildSalesReport } from "@/lib/sales-report";
import {
  loadShopDailySeries,
  loadShopTopSellers,
} from "@/lib/shop-overview-metrics";

async function loadSaleStockSnapshot(branchId: string) {
  // Count from BranchMenuItemStock even when brandProductId is not linked yet
  // (many live branches track qty on menu rows without SKU link).
  const items = await prisma.branchMenuItem.findMany({
    where: {
      branchId,
      isHidden: false,
    },
    select: {
      price: true,
      category: { select: { stockExempt: true } },
      stock: { select: { quantity: true } },
      optionGroupLinks: {
        select: { group: { select: { mode: true } } },
      },
    },
  });

  let saleStockQty = 0;
  let saleStockValue = 0;
  for (const item of items) {
    const isPromo = item.optionGroupLinks.some(
      (l) => l.group.mode === "FROM_MENU",
    );
    if (isPromo || item.category?.stockExempt) continue;
    const quantity = Math.max(0, Number(item.stock?.quantity ?? 0));
    const price = Number(item.price ?? 0);
    saleStockQty += quantity;
    saleStockValue += quantity * price;
  }

  return {
    saleStockQty,
    saleStockValue: Math.round(saleStockValue * 100) / 100,
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const url = new URL(request.url);
    const dayState = getCalendarDayState();
    const today = dayState.operatingDay;

    const fromParam = url.searchParams.get("from") ?? "";
    const toParam = url.searchParams.get("to") ?? "";
    const dateParam = url.searchParams.get("date") ?? "";
    const period =
      url.searchParams.get("period") === "month" ? "month" : "day";

    let from = today;
    let to = today;

    if (isBangkokDateKey(fromParam) && isBangkokDateKey(toParam)) {
      from = fromParam <= toParam ? fromParam : toParam;
      to = fromParam <= toParam ? toParam : fromParam;
      if (to > today) to = today;
      if (from > today) from = today;
    } else if (period === "month") {
      const [y, m] = today.split("-");
      from = `${y}-${m}-01`;
      to = today;
    } else if (isBangkokDateKey(dateParam) && dateParam <= today) {
      from = dateParam;
      to = dateParam;
    }

    const branchIds = [session.branchId];

    const [report, stock, branch, lastStockCount, lastSale, topSellers, days] =
      await Promise.all([
        buildSalesReport({
          branchIds,
          from,
          to,
        }),
        loadSaleStockSnapshot(session.branchId),
        prisma.branch.findUnique({
          where: { id: session.branchId },
          select: {
            stockEnabled: true,
            brand: { select: { stockEnabled: true } },
          },
        }),
        prisma.stockCount.findFirst({
          where: {
            branchId: session.branchId,
            status: { in: ["IN_PROGRESS", "COMPLETED"] },
          },
          orderBy: [{ createdAt: "desc" }],
          select: { createdAt: true, completedAt: true },
        }),
        prisma.order.findFirst({
          where: {
            branchId: session.branchId,
            awaitingPhotoKey: false,
            status: {
              in: [
                "WAITING_FOR_STORE_ACCEPTANCE",
                "PREPARING",
                "READY_FOR_PICKUP",
                "READY_FOR_DELIVERY",
                "DELIVERING",
                "COMPLETED",
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        loadShopTopSellers(branchIds, from, to),
        loadShopDailySeries(branchIds, from, to),
      ]);

    const stockEnabled = Boolean(
      branch?.stockEnabled && branch?.brand?.stockEnabled,
    );

    const lastStockCountAt = lastStockCount
      ? (lastStockCount.completedAt ?? lastStockCount.createdAt).toISOString()
      : null;
    const lastSaleAt = lastSale?.createdAt.toISOString() ?? null;

    return jsonOk({
      period,
      from,
      to,
      brandName: session.brand?.name ?? "",
      branchName: session.branchName ?? "",
      stockEnabled,
      saleStockQty: stockEnabled ? stock.saleStockQty : 0,
      saleStockValue: stockEnabled ? stock.saleStockValue : 0,
      lastStockCountAt: stockEnabled ? lastStockCountAt : null,
      lastSaleAt,
      stats: report.stats,
      byChannel: report.byChannel,
      byPayment: report.byPayment,
      wasteItems: report.wasteItems,
      topSellers,
      days,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
