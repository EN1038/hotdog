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
import { publicCustomerBranchWhere } from "@/lib/brand-plan";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

export async function GET(request: Request) {
  try {
    await ensureProdSchemaCompat();
    const { searchParams } = new URL(request.url);
    const brandCode = searchParams.get("brand");
    const branchCode = searchParams.get("branch");
    const query = searchParams.get("q")?.trim();

    const branches = await prisma.branch.findMany({
      where: publicCustomerBranchWhere({
        brandCode,
        branchCode,
        query,
      }),
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
