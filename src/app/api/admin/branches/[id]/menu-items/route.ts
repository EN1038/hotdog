import { z } from "zod";
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

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

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
        sellPiece: body.sellPiece ?? true,
        sellByWeight: body.sellByWeight ?? false,
        pricePerKg:
          body.sellByWeight && body.pricePerKg != null
            ? body.pricePerKg
            : body.pricePerKg ?? null,
        sellSkewer: body.sellSkewer ?? false,
        sellGrill: body.sellGrill ?? false,
        sellFry: body.sellFry ?? false,
        sellShabu: body.sellShabu ?? false,
        description: body.description ?? null,
        categoryId,
        imageUrl: body.imageUrl ?? null,
        skewerImageUrl: body.skewerImageUrl ?? null,
        quantityUnit: body.quantityUnit?.trim() || null,
        sticksPerUnit: body.sticksPerUnit ?? 1,
        countsAsSticks: body.countsAsSticks ?? true,
        skewerMinQty: body.skewerMinQty ?? 1,
        isHidden: body.isHidden ?? false,
        hideFromStaff: body.hideFromStaff ?? false,
        isOutOfStock: body.isOutOfStock ?? false,
        sortOrder: body.sortOrder ?? 0,
        defaultShelfLifeDays: body.defaultShelfLifeDays ?? null,
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

/** PATCH — reorder menu display (sortOrder = index). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = reorderSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const items = await prisma.branchMenuItem.findMany({
      where: { branchId },
      select: { id: true, name: true },
    });

    if (items.length !== body.orderedIds.length) {
      return jsonError("จำนวนเมนูไม่ตรงกับข้อมูลล่าสุด", 400);
    }

    const known = new Set(items.map((item) => item.id));
    const ordered = new Set(body.orderedIds);
    if (
      ordered.size !== body.orderedIds.length ||
      body.orderedIds.some((id) => !known.has(id))
    ) {
      return jsonError("ข้อมูลลำดับเมนูไม่ถูกต้อง", 400);
    }

    await prisma.$transaction(
      body.orderedIds.map((menuItemId, index) =>
        prisma.branchMenuItem.update({
          where: { id: menuItemId },
          data: { sortOrder: index },
        }),
      ),
    );

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "menu.reorder",
      summary: `จัดลำดับเมนู ${items.length} รายการ`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "branch",
      entityId: branchId,
      entityName: ctx?.name ?? branch.name,
    });

    const orderedItems = await prisma.branchMenuItem.findMany({
      where: { branchId },
      include: itemInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return jsonOk(orderedItems.map(flattenMenuItemOptionGroups));
  } catch (error) {
    return handleApiError(error);
  }
}
