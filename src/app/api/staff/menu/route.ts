import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import type { MenuPriceChannel } from "@/lib/menu-pricing";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";

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
      include: {
        menuItems: {
          where: { isHidden: false, hideFromStaff: false },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          include: {
            category: { select: { id: true, name: true, sortOrder: true } },
            ...menuItemOptionGroupInclude,
          },
        },
        deliveryLocations: { orderBy: { name: "asc" } },
      },
    });

    if (!branch) {
      return jsonOk({
        menuItems: [],
        deliveryLocations: [],
        channel,
      });
    }

    return jsonOk({
      branchId: branch.id,
      branchName: branch.name,
      channel,
      menuItems: branch.menuItems.map(flattenMenuItemOptionGroups),
      deliveryLocations: branch.deliveryLocations,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
