import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getCalendarDayState } from "@/lib/operating-day";
import { buildSalesReport } from "@/lib/sales-report";

async function loadSaleStockSnapshot(branchId: string) {
  const items = await prisma.branchMenuItem.findMany({
    where: {
      branchId,
      isHidden: false,
      brandProductId: { not: null },
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

    const [report, stock, branch] = await Promise.all([
      buildSalesReport({
        branchIds: [session.branchId],
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
    ]);

    const stockEnabled = Boolean(
      branch?.stockEnabled && branch?.brand?.stockEnabled,
    );

    return jsonOk({
      period,
      from,
      to,
      brandName: session.brand?.name ?? "",
      branchName: session.branchName ?? "",
      stockEnabled,
      saleStockQty: stockEnabled ? stock.saleStockQty : 0,
      saleStockValue: stockEnabled ? stock.saleStockValue : 0,
      stats: report.stats,
      byChannel: report.byChannel,
      byPayment: report.byPayment,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
