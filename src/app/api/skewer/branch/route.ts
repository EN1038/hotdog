import { BranchOperatingMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";

/** Public menu + branch meta for skewer ordering (no prices required). */
export async function GET(request: Request) {
  try {
    const branchId = new URL(request.url).searchParams.get("branchId");
    if (!branchId) return jsonError("ต้องระบุสาขา");

    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        isHidden: false,
        operatingMode: BranchOperatingMode.SKEWER,
      },
      include: {
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
        menuItems: {
          where: { isHidden: false },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          include: {
            category: { select: { id: true, name: true, sortOrder: true } },
            ...menuItemOptionGroupInclude,
          },
        },
      },
    });

    if (!branch) return jsonError("ไม่พบสาขาเสียบไม้", 404);

    return jsonOk({
      id: branch.id,
      name: branch.name,
      nameTh: branch.nameTh,
      nameEn: branch.nameEn,
      code: branch.code,
      imageUrl: branch.imageUrl,
      address: branch.address,
      latitude: branch.latitude,
      longitude: branch.longitude,
      phone: branch.phone,
      isOpen: branch.isOpen,
      operatingMode: branch.operatingMode,
      brand: branch.brand,
      menuItems: branch.menuItems.map((item) => ({
        ...flattenMenuItemOptionGroups(item),
        // Skewer UI does not show prices
        price: undefined,
        pickupPrice: undefined,
        storefrontPrice: undefined,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
