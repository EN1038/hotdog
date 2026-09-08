import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  isPurchaseStockType,
  purchaseStockTypeLabel,
} from "@/lib/branch-purchase";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

export async function GET(request: Request) {
  try {
    await ensureProdSchemaCompat();
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const stockType = searchParams.get("stockType")?.trim() || null;
    if (stockType && !isPurchaseStockType(stockType)) {
      return jsonError("ประเภทสินค้าไม่ถูกต้อง", 400);
    }

    // วัตถุดิบ = รายการขายจาก master เมนู
    if (stockType === "RAW_MATERIAL") {
      const items = await prisma.branchMenuItem.findMany({
        where: {
          branchId: session.branchId,
          isHidden: false,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          itemCode: true,
          quantityUnit: true,
          price: true,
          storefrontPrice: true,
          imageUrl: true,
          stock: { select: { quantity: true } },
        },
      });

      return jsonOk({
        items: items.map((item) => {
          const unitPrice =
            item.storefrontPrice != null
              ? Number(item.storefrontPrice)
              : Number(item.price);
          return {
            id: item.id,
            kind: "menu" as const,
            name: item.name,
            itemCode: item.itemCode,
            unit: item.quantityUnit?.trim() || "ชิ้น",
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
            imageUrl: item.imageUrl,
            stockType: "RAW_MATERIAL",
            stockTypeLabel: purchaseStockTypeLabel("RAW_MATERIAL"),
            quantity: item.stock?.quantity ?? 0,
          };
        }),
      });
    }

    const items = await prisma.branchNonMenuItem.findMany({
      where: {
        branchId: session.branchId,
        ...(stockType ? { stockType } : { stockType: { not: "RAW_MATERIAL" } }),
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
        kind: "nonMenu" as const,
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
