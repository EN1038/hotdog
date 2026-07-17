import { Prisma } from "@prisma/client";
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
  menuItemPatchSchema,
} from "@/lib/menu-item-payload";
import { normalizeChannelPrices } from "@/lib/menu-pricing";

type Params = { params: Promise<{ id: string; itemId: string }> };

const itemInclude = {
  category: { select: { id: true, name: true, sortOrder: true } },
  ...menuItemOptionGroupInclude,
} as const;

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId, itemId } = await params;
    await requireBranchAccess(branchId);
    const item = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
      include: itemInclude,
    });
    if (!item) return jsonError("ไม่พบเมนู", 404);
    return jsonOk(flattenMenuItemOptionGroups(item));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId, itemId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = menuItemPatchSchema.parse(await request.json());

    const existing = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
    });
    if (!existing) return jsonError("ไม่พบเมนู", 404);

    if (body.categoryId) {
      const cat = await prisma.menuCategory.findFirst({
        where: { id: body.categoryId, branchId },
      });
      if (!cat) return jsonError("ไม่พบหมวดหมู่", 404);
    }

    if (body.optionGroupIds) {
      if (body.optionGroupIds.length > 0) {
        const groups = await prisma.branchOptionGroup.findMany({
          where: { id: { in: body.optionGroupIds }, branchId },
          select: { id: true },
        });
        if (groups.length !== body.optionGroupIds.length) {
          return jsonError("มีหัวข้อตัวเลือกที่ไม่ใช่ของสาขานี้");
        }
      }
      await prisma.$transaction(async (tx) => {
        await tx.branchMenuItemOptionGroup.deleteMany({
          where: { menuItemId: itemId },
        });
        if (body.optionGroupIds!.length > 0) {
          await tx.branchMenuItemOptionGroup.createMany({
            data: body.optionGroupIds!.map((groupId) => ({
              menuItemId: itemId,
              groupId,
            })),
          });
        }
      });
    }

    const deliveryPrice =
      body.price !== undefined ? body.price : Number(existing.price);
    const touchPrices =
      body.price !== undefined ||
      body.pickupPrice !== undefined ||
      body.storefrontPrice !== undefined;

    const prices = touchPrices
      ? normalizeChannelPrices({
          price: deliveryPrice,
          pickupPrice:
            body.pickupPrice !== undefined
              ? body.pickupPrice
              : existing.pickupPrice != null
                ? Number(existing.pickupPrice)
                : null,
          storefrontPrice:
            body.storefrontPrice !== undefined
              ? body.storefrontPrice
              : existing.storefrontPrice != null
                ? Number(existing.storefrontPrice)
                : null,
        })
      : null;

    const promoEnabled =
      body.promoEnabled !== undefined
        ? body.promoEnabled
        : existing.promoEnabled;
    const promoContinuous =
      body.promoContinuous !== undefined
        ? body.promoContinuous
        : existing.promoContinuous;

    const updated = await prisma.branchMenuItem.update({
      where: { id: itemId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(prices && {
          price: prices.price,
          pickupPrice: prices.pickupPrice,
          storefrontPrice: prices.storefrontPrice,
        }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
        ...(body.isHidden !== undefined && { isHidden: body.isHidden }),
        ...(body.isOutOfStock !== undefined && {
          isOutOfStock: body.isOutOfStock,
        }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(body.sellDelivery !== undefined && {
          sellDelivery: body.sellDelivery,
        }),
        ...(body.sellPickup !== undefined && { sellPickup: body.sellPickup }),
        ...(body.sellStorefront !== undefined && {
          sellStorefront: body.sellStorefront,
        }),
        ...(body.promoEnabled !== undefined && {
          promoEnabled: body.promoEnabled,
        }),
        ...(body.promoType !== undefined || body.promoEnabled === false
          ? {
              promoType: promoEnabled
                ? (body.promoType ?? existing.promoType)
                : null,
            }
          : {}),
        ...(body.promoValue !== undefined || body.promoEnabled === false
          ? {
              promoValue: promoEnabled
                ? (body.promoValue ?? existing.promoValue)
                : null,
            }
          : {}),
        ...(body.promoContinuous !== undefined && {
          promoContinuous: body.promoContinuous,
        }),
        ...(body.promoStartsAt !== undefined ||
        body.promoEnabled !== undefined ||
        body.promoContinuous !== undefined
          ? {
              promoStartsAt:
                promoEnabled && !promoContinuous
                  ? body.promoStartsAt
                    ? new Date(body.promoStartsAt)
                    : existing.promoStartsAt
                  : null,
            }
          : {}),
        ...(body.promoEndsAt !== undefined ||
        body.promoEnabled !== undefined ||
        body.promoContinuous !== undefined
          ? {
              promoEndsAt:
                promoEnabled && !promoContinuous
                  ? body.promoEndsAt
                    ? new Date(body.promoEndsAt)
                    : existing.promoEndsAt
                  : null,
            }
          : {}),
      },
      include: itemInclude,
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "menu.update",
      summary: `แก้ไขเมนู ${updated.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "menu",
      entityId: updated.id,
      entityName: updated.name,
      metadata: { fields: Object.keys(body) },
    });

    return jsonOk(flattenMenuItemOptionGroups(updated));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id: branchId, itemId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const existing = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
    });
    if (!existing) return jsonError("ไม่พบเมนู", 404);

    const ctx = await getBranchActivityContext(branchId);
    try {
      await prisma.branchMenuItem.delete({ where: { id: itemId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        return jsonError(
          "ลบเมนูไม่สำเร็จ เพราะยังมีข้อมูลอื่นที่อ้างอิงอยู่ ลองซ่อนจากลูกค้าแทน",
          409,
        );
      }
      throw error;
    }

    await logAdminActivity(session, {
      action: "menu.delete",
      summary: `ลบเมนู ${existing.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "menu",
      entityId: existing.id,
      entityName: existing.name,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
