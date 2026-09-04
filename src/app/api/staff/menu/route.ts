import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import type { MenuPriceChannel } from "@/lib/menu-pricing";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";
import { serializePromoSchedule } from "@/lib/promo-schedule";
import { loadBrandSkewerImageLookup, withBrandSkewerImages } from "@/lib/menu-skewer-image";

function parseChannel(raw: string | null): MenuPriceChannel {
  return raw === "delivery" ? "delivery" : "storefront";
}

function parseImageMode(raw: string | null): "default" | "skewer" {
  return raw === "skewer" ? "skewer" : "default";
}

function parsePackageIn(raw: string | null): boolean {
  return raw === "1" || raw === "true";
}

export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const channel = parseChannel(searchParams.get("channel"));
    const imageMode = parseImageMode(searchParams.get("imageMode"));
    const forPackageIn = parsePackageIn(searchParams.get("packageIn"));

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        id: true,
        name: true,
        brandId: true,
        stockEnabled: true,
        brand: { select: { stockEnabled: true } },
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
          where: {
            stockType: "CONSUMABLE",
            ...(forPackageIn ? {} : { showOnKeyOrder: true }),
          },
          orderBy: [{ keyOrderSortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            unit: true,
            quantity: true,
            imageUrl: true,
            itemCode: true,
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

    // Match stock UI: missing BranchMenuItemStock row displays as 0 — not "untracked".
    const stockActive = Boolean(
      branch.brandId && branch.brand?.stockEnabled && branch.stockEnabled,
    );

    const menuItems = branch.menuItems.map((item) => {
      const flattened = flattenMenuItemOptionGroups(item);
      const rawStockQty = item.stock?.quantity ?? null;
      const isPromo = (flattened.optionGroups ?? []).some(
        (g) => g.mode === "FROM_MENU",
      );
      const stockExempt = Boolean(item.category?.stockExempt) || isPromo;
      const stockQuantity = stockExempt
        ? null
        : stockActive
          ? (rawStockQty ?? 0)
          : rawStockQty;
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
        stockQuantity,
        // Promo packs / exempt categories: manual sold-out only (not pack stock qty)
        isOutOfStock: stockExempt
          ? flattened.isOutOfStock
          : stockQuantity != null
            ? stockQuantity <= 0
            : flattened.isOutOfStock,
      };
    });

    const skewerLookup =
      imageMode === "skewer" && branch.brandId
        ? await loadBrandSkewerImageLookup(prisma, branch.brandId)
        : null;

    return jsonOk({
      branchId: branch.id,
      branchName: branch.name,
      channel,
      imageMode,
      consumables: branch.branchNonMenuItems,
      menuItems:
        skewerLookup != null
          ? withBrandSkewerImages(menuItems, skewerLookup)
          : menuItems,
      deliveryLocations: branch.deliveryLocations,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
