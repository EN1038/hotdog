import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";
import {
  buildMenuPricingWriteData,
  menuItemCreateSchema,
} from "@/lib/menu-item-payload";

type Params = { params: Promise<{ id: string }> };

const itemInclude = {
  category: { select: { id: true, name: true, sortOrder: true } },
  ...menuItemOptionGroupInclude,
} as const;

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const items = await prisma.branchMenuItem.findMany({
      where: { branchId },
      include: itemInclude,
      orderBy: [{ isHidden: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return jsonOk(items.map(flattenMenuItemOptionGroups));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const body = menuItemCreateSchema.parse(await request.json());
    const categoryId = body.categoryId || null;
    const optionGroupIds = body.optionGroupIds ?? [];
    const pricing = buildMenuPricingWriteData(body);
    if (!pricing) return jsonError("ราคาสินค้าไม่ถูกต้อง");

    if (categoryId) {
      const cat = await prisma.menuCategory.findFirst({
        where: { id: categoryId, branchId },
      });
      if (!cat) return jsonError("ไม่พบหมวดหมู่", 404);
    }

    if (optionGroupIds.length > 0) {
      const groups = await prisma.branchOptionGroup.findMany({
        where: { id: { in: optionGroupIds }, branchId },
        select: { id: true },
      });
      if (groups.length !== optionGroupIds.length) {
        return jsonError("มีหัวข้อตัวเลือกที่ไม่ใช่ของสาขานี้");
      }
    }

    const promoEnabled = body.promoEnabled ?? false;
    const promoContinuous = body.promoContinuous ?? false;

    const item = await prisma.branchMenuItem.create({
      data: {
        branchId,
        name: body.name,
        price: pricing.price!,
        pickupPrice: pricing.pickupPrice!,
        storefrontPrice: pricing.storefrontPrice!,
        sellDelivery: body.sellDelivery ?? true,
        sellPickup: body.sellPickup ?? true,
        sellStorefront: body.sellStorefront ?? true,
        promoEnabled,
        promoType: promoEnabled ? (body.promoType ?? null) : null,
        promoValue: promoEnabled ? (body.promoValue ?? null) : null,
        promoContinuous,
        promoStartsAt:
          promoEnabled && !promoContinuous && body.promoStartsAt
            ? new Date(body.promoStartsAt)
            : null,
        promoEndsAt:
          promoEnabled && !promoContinuous && body.promoEndsAt
            ? new Date(body.promoEndsAt)
            : null,
        description: body.description ?? null,
        categoryId,
        imageUrl: body.imageUrl ?? null,
        isHidden: body.isHidden ?? false,
        isOutOfStock: body.isOutOfStock ?? false,
        sortOrder: body.sortOrder ?? 0,
        ...(optionGroupIds.length
          ? {
              optionGroupLinks: {
                create: optionGroupIds.map((groupId) => ({ groupId })),
              },
            }
          : {}),
      },
      include: itemInclude,
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "menu.create",
      summary: `เพิ่มเมนู ${item.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "menu",
      entityId: item.id,
      entityName: item.name,
      metadata: { price: body.price },
    });

    return jsonOk(flattenMenuItemOptionGroups(item), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
