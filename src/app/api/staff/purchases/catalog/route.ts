import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  isPurchaseStockType,
  purchaseStockTypeLabel,
} from "@/lib/branch-purchase";

export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const stockType = searchParams.get("stockType")?.trim() || null;
    if (stockType && !isPurchaseStockType(stockType)) {
      return jsonError("ประเภทสินค้าไม่ถูกต้อง", 400);
    }

    const items = await prisma.branchNonMenuItem.findMany({
      where: {
        branchId: session.branchId,
        ...(stockType ? { stockType } : {}),
      },
      orderBy: [{ stockType: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        itemCode: true,
        unit: true,
        price: true,
        imageUrl: true,
        stockType: true,
        quantity: true,
      },
    });

    return jsonOk({
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        itemCode: item.itemCode,
        unit: item.unit,
        unitPrice: item.price != null ? Number(item.price) : null,
        imageUrl: item.imageUrl,
        stockType: item.stockType,
        stockTypeLabel: purchaseStockTypeLabel(item.stockType),
        quantity: item.quantity,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
