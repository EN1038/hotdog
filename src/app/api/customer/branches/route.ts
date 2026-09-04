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

const liteBranchSelect = {
  id: true,
  code: true,
  name: true,
  nameTh: true,
  nameEn: true,
  imageUrl: true,
  address: true,
  latitude: true,
  longitude: true,
  phone: true,
  primaryCategory: true,
  secondaryCategories: true,
  priceRange: true,
  isOpen: true,
  operatingMode: true,
  opensAt: true,
  closesAt: true,
  storefrontHours: true,
  deliveryHours: true,
  allowAdvanceOrder: true,
  brand: {
    select: {
      id: true,
      code: true,
      name: true,
      nameTh: true,
      nameEn: true,
      logoUrl: true,
      coverImageUrl: true,
      color: true,
      contactPhone: true,
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    await ensureProdSchemaCompat();
    const { searchParams } = new URL(request.url);
    const brandCode = searchParams.get("brand");
    const branchCode = searchParams.get("branch");
    const query = searchParams.get("q")?.trim();
    const lite =
      searchParams.get("lite") === "1" ||
      searchParams.get("lite") === "true";

    const where = publicCustomerBranchWhere({
      brandCode,
      branchCode,
      query,
    });

    if (lite) {
      const branches = await prisma.branch.findMany({
        where,
        select: liteBranchSelect,
        orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
      });
      return jsonOk(
        branches.map((b) => ({
          ...b,
          menuItems: [],
          deliveryLocations: [],
        })),
      );
    }

    const branches = await prisma.branch.findMany({
      where,
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
          b.menuItems.map((item) => flattenMenuItemOptionGroups(item)),
          bestsellers.get(b.id),
        ),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
