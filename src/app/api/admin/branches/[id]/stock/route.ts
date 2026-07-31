import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("stock_in"),
    brandProductId: z.string(), // This is either menuItemId or nonMenuItemId
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("damage"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("lost"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("issue"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("adjust"),
    brandProductId: z.string(),
    quantity: z.number().int().min(0),
    note: z.string().trim().max(300).nullable().optional(),
  }),
]);

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBranchAccess(id);

    const branch = await prisma.branch.findUnique({
      where: { id },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const menuItems = await prisma.branchMenuItem.findMany({
      where: { branchId: id, isHidden: false },
      include: {
        category: true,
        stock: true,
        optionGroupLinks: {
          include: { group: { select: { mode: true } } },
        },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });

    const nonMenuItems = await prisma.branchNonMenuItem.findMany({
      where: { branchId: id },
      orderBy: { name: "asc" },
    });

    const products: any[] = [];
    const balances: any[] = [];

    // Map Menu Items (skip promo packs + stock-exempt categories)
    for (const item of menuItems) {
      const isPromo = item.optionGroupLinks.some(
        (l) => l.group.mode === "FROM_MENU",
      );
      if (isPromo || item.category?.stockExempt) continue;

      products.push({
        id: item.id,
        name: item.name,
        unit: "ชิ้น",
        stockType: "SALE_ITEM",
        category: item.category?.name ?? "เมนู",
        lowStockAlert: 10,
        trackStock: true,
        imageUrl: item.imageUrl,
        isMenu: true,
        price: Number(item.price ?? 0),
      });
      balances.push({
        id: item.id,
        quantity: item.stock?.quantity ?? 0,
        product: {
          id: item.id,
          name: item.name,
          unit: "ชิ้น",
          stockType: "SALE_ITEM",
        },
      });
    }

    // Map Non-Menu Items
    for (const item of nonMenuItems) {
      const typeLabel = item.stockType === "CONSUMABLE" ? "ของสิ้นเปลือง" : "อุปกรณ์";
      products.push({
        id: item.id,
        name: item.name,
        unit: item.unit,
        stockType: item.stockType,
        category: typeLabel,
        lowStockAlert: 10,
        trackStock: true,
        imageUrl: item.imageUrl,
        isMenu: false,
        price: Number(item.price ?? 0),
      });
      balances.push({
        id: item.id,
        quantity: item.quantity,
        product: {
          id: item.id,
          name: item.name,
          unit: item.unit,
          stockType: item.stockType,
        },
      });
    }

    return jsonOk({
      stockActive: true,
      locationId: branch.id,
      balances,
      products,
      lowItems: balances.filter((b) => b.quantity <= 0),
      pending: [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireBranchAccess(id);
    const body = postSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({
      where: { id },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const targetId = body.brandProductId;

    // Check if it's a non-menu item
    const nonMenu = await prisma.branchNonMenuItem.findUnique({
      where: { id: targetId },
    });

    let oldQty = 0;
    let newQty = 0;

    if (nonMenu) {
      oldQty = nonMenu.quantity;
      if (body.action === "stock_in") {
        newQty = oldQty + body.quantity;
      } else if (body.action === "adjust") {
        newQty = body.quantity;
      } else {
        newQty = oldQty - body.quantity;
      }
      
      const actualDiff = newQty - oldQty;
      if (actualDiff !== 0 || body.action === "adjust") {
        await prisma.branchNonMenuItem.update({
          where: { id: targetId },
          data: { quantity: newQty },
        });

        if (actualDiff !== 0) {
          await prisma.branchNonMenuItemHistory.create({
            data: {
              branchNonMenuItemId: targetId,
              quantity: actualDiff,
              type: body.action.toUpperCase(),
              note: body.note ?? null,
              createdByStaffId: null,
            },
          });
        }
      }
    } else {
      // Must be a menu item
      const menuItem = await prisma.branchMenuItem.findFirst({
        where: { id: targetId, branchId: id },
        include: { stock: true },
      });
      if (!menuItem) return jsonError("ไม่พบรายการสินค้า", 404);

      oldQty = menuItem.stock?.quantity ?? 0;
      
      if (body.action === "stock_in") {
        newQty = oldQty + body.quantity;
      } else if (body.action === "adjust") {
        newQty = body.quantity;
      } else {
        newQty = oldQty - body.quantity;
      }
      
      const actualDiff = newQty - oldQty;

      if (actualDiff !== 0 || body.action === "adjust") {
        await prisma.$transaction(async (tx) => {
          await tx.branchMenuItemStock.upsert({
            where: { menuItemId: targetId },
            update: { quantity: newQty },
            create: {
              branchId: id,
              menuItemId: targetId,
              quantity: newQty,
            },
          });

          await tx.branchMenuItem.update({
            where: { id: targetId },
            data: { isOutOfStock: newQty <= 0 },
          });

          if (actualDiff !== 0) {
            await tx.branchMenuItemStockHistory.create({
              data: {
                branchId: id,
                menuItemId: targetId,
                quantity: actualDiff,
                type: body.action.toUpperCase(),
                note: body.note ?? null,
                createdByStaffId: null,
              },
            });
          }
        });
      }
    }

    if (newQty !== oldQty) {
      await logAdminActivity(session, {
        action: "branch.update",
        summary: `อัปเดตสต๊อกสาขา ${branch.name} (${body.action}: ${newQty - oldQty})`,
        branchId: branch.id,
        branchName: branch.name,
        entityType: "branch",
        entityId: branch.id,
        entityName: branch.name,
      });
    }

    return jsonOk({ ok: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
