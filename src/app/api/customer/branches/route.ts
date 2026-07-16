import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";
import {
  attachBestsellerFlag,
  getBestsellerMenuItemIdsByBranch,
} from "@/lib/menu-bestsellers";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandCode = searchParams.get("brand");
    const branchCode = searchParams.get("branch");
    const query = searchParams.get("q")?.trim();

    const branches = await prisma.branch.findMany({
      where: {
        isHidden: false,
        ...(brandCode && { brand: { code: brandCode } }),
        ...(branchCode && { code: branchCode }),
        ...(query && { name: { contains: query, mode: "insensitive" } }),
      },
      include: {
        brand: true,
        menuItems: {
          where: { isHidden: false },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          include: {
            category: { select: { id: true, name: true, sortOrder: true } },
            ...menuItemOptionGroupInclude,
          },
        },
        deliveryLocations: { orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    });

    const bestsellers = await getBestsellerMenuItemIdsByBranch(
      branches.map((b) => b.id),
    );

    return jsonOk(
      branches.map((b) => ({
        ...b,
        menuItems: attachBestsellerFlag(
          b.menuItems.map(flattenMenuItemOptionGroups),
          bestsellers.get(b.id),
        ),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
