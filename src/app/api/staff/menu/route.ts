import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import type { MenuPriceChannel } from "@/lib/menu-pricing";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";
import { serializePromoSchedule } from "@/lib/promo-schedule";

function parseChannel(raw: string | null): MenuPriceChannel {
  return raw === "delivery" ? "delivery" : "storefront";
}

export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const channel = parseChannel(searchParams.get("channel"));

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        id: true,
        name: true,
        menuItems: {
          where: { isHidden: false, hideFromStaff: false },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          include: {
            category: {
              select: {
                id: true,
                name: true,
                sortOrder: true,
                stockExempt: true,
              },
            },
            stock: true,
            ...menuItemOptionGroupInclude,
          },
        },
        branchNonMenuItems: {
          where: { stockType: "CONSUMABLE", showOnKeyOrder: true },
          orderBy: [{ keyOrderSortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            unit: true,
            quantity: true,
            imageUrl: true,
          },
        },
        deliveryLocations: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            deliveryFee: true,
            isCustomAddress: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    });

    if (!branch) {
      return jsonOk({
        menuItems: [],
        consumables: [],
        deliveryLocations: [],
        channel,
      });
    }

    return jsonOk({
      branchId: branch.id,
      branchName: branch.name,
      channel,
      consumables: branch.branchNonMenuItems,
      menuItems: branch.menuItems.map((item) => {
        const flattened = flattenMenuItemOptionGroups(item);
        const stockQuantity = item.stock?.quantity ?? null;
        const isPromo = (flattened.optionGroups ?? []).some(
          (g) => g.mode === "FROM_MENU",
        );
        const stockExempt = Boolean(item.category?.stockExempt) || isPromo;
        const schedule = serializePromoSchedule(item);
        return {
          ...flattened,
          ...schedule,
          category: item.category
            ? {
                id: item.category.id,
                name: item.category.name,
                sortOrder: item.category.sortOrder,
                stockExempt: Boolean(item.category.stockExempt) || isPromo,
              }
            : null,
          stockQuantity: stockExempt ? null : stockQuantity,
          // Promo packs / exempt categories: manual sold-out only (not pack stock qty)
          isOutOfStock: stockExempt
            ? flattened.isOutOfStock
            : stockQuantity != null
              ? stockQuantity <= 0
              : flattened.isOutOfStock,
        };
      }),
      deliveryLocations: branch.deliveryLocations,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
