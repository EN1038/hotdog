import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandCode = searchParams.get("brand");
    const branchCode = searchParams.get("branch");
    const query = searchParams.get("q")?.trim();

    const branches = await prisma.branch.findMany({
      where: {
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
    return jsonOk(
      branches.map((b) => ({
        ...b,
        menuItems: b.menuItems.map(flattenMenuItemOptionGroups),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
