import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getActiveShift } from "@/lib/branch-shift";
import {
  bangkokDateKey,
  startOfBangkokDayFromKey,
} from "@/lib/constants";

const WASTE_HISTORY_TYPES = ["ISSUE", "DAMAGE", "LOST"] as const;

function bangkokMonthBounds(now = new Date()) {
  const todayKey = bangkokDateKey(now);
  const [y, m] = todayKey.split("-").map(Number);
  const monthStartKey = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const nextMonthStartKey = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  const label = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    month: "short",
    year: "numeric",
  }).format(startOfBangkokDayFromKey(monthStartKey));
  return {
    start: startOfBangkokDayFromKey(monthStartKey),
    end: startOfBangkokDayFromKey(nextMonthStartKey),
    label,
  };
}

const summaryLineSchema = z.object({
  brandProductId: z.string(), // BranchMenuItem.id
  countedQty: z.number().int().min(0),
});

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("stock_in"),
    brandProductId: z.string(), // This is either menuItemId or nonMenuItemId
    quantity: z.number().int().positive(),
    unitCost: z.number().min(0).nullable().optional(),
    supplier: z.string().trim().max(120).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("damage"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    reason: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("lost"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    reason: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("issue"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    note: z.string().trim().min(1, "กรุณากรอกรายละเอียด").max(300),
    imageUrl: z.string().trim().min(1, "กรุณาแนบรูปถ่าย"),
  }),
  z.object({
    action: z.literal("adjust"),
    brandProductId: z.string(),
    quantity: z.number().int().min(0),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("summary"),
    lines: z.array(summaryLineSchema).min(1),
    cash: z.number().min(0),
    transfer: z.number().min(0),
    change: z.number().min(0),
    customers: z.number().int().min(0),
  }),
]);

export async function GET() {
  try {
    const session = await requireStaff();
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const menuItems = await prisma.branchMenuItem.findMany({
      where: { branchId: branch.id, isHidden: false },
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
      where: { branchId: branch.id },
      orderBy: { name: "asc" },
    });

    const products: any[] = [];
    const balances: any[] = [];

    const priceByProductId = new Map<string, number>();

    // Map Menu Items (skip promo packs + stock-exempt categories — no receive needed)
    for (const item of menuItems) {
      const isPromo = item.optionGroupLinks.some(
        (l) => l.group.mode === "FROM_MENU",
      );
      if (isPromo || item.category?.stockExempt) continue;

      const price = Number(item.price ?? 0);
      priceByProductId.set(item.id, price);

      products.push({
        id: item.id,
        name: item.name,
        unit: "รายการ",
        stockType: "SALE_ITEM",
        category: item.category?.name ?? "เมนู",
        sortOrder: item.sortOrder,
        categorySortOrder: item.category?.sortOrder ?? 999,
        lowStockAlert: 0,
        trackStock: true,
        imageUrl: item.imageUrl,
        isMenu: true,
        price,
      });
      balances.push({
        id: item.id, // Frontend uses product.id anyway
        quantity: item.stock?.quantity ?? 0,
        product: {
          id: item.id,
          name: item.name,
          unit: "รายการ",
          stockType: "SALE_ITEM",
          category: item.category?.name ?? "เมนู",
          sortOrder: item.sortOrder,
          categorySortOrder: item.category?.sortOrder ?? 999,
          lowStockAlert: 0,
          price,
        },
      });
    }

    // Map Non-Menu Items
    for (const item of nonMenuItems) {
      const typeLabel = item.stockType === "CONSUMABLE" ? "ของสิ้นเปลือง" : "อุปกรณ์";
      const price = Number(item.price ?? 0);
      priceByProductId.set(item.id, price);

      products.push({
        id: item.id,
        name: item.name,
        unit: item.unit,
        stockType: item.stockType,
        category: typeLabel,
        sortOrder: 0,
        categorySortOrder: 999,
        lowStockAlert: 0,
        trackStock: true,
        imageUrl: item.imageUrl,
        isMenu: false,
        price,
      });
      balances.push({
        id: item.id,
        quantity: item.quantity,
        product: {
          id: item.id,
          name: item.name,
          unit: item.unit,
          stockType: item.stockType,
          category: typeLabel,
          sortOrder: 0,
          categorySortOrder: 999,
          lowStockAlert: 0,
          price,
        },
      });
    }

    const emptyTypeSummary = () => ({ quantity: 0, valueBaht: 0 });
    const currentByType: Record<
      "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT",
      { quantity: number; valueBaht: number }
    > = {
      SALE_ITEM: emptyTypeSummary(),
      CONSUMABLE: emptyTypeSummary(),
      EQUIPMENT: emptyTypeSummary(),
    };
    for (const bal of balances) {
      const stockType = bal.product.stockType as keyof typeof currentByType;
      if (!(stockType in currentByType)) continue;
      const qty = Math.max(0, Number(bal.quantity) || 0);
      const unitPrice = Number(bal.product.price) || 0;
      currentByType[stockType].quantity += qty;
      currentByType[stockType].valueBaht += qty * unitPrice;
    }

    const month = bangkokMonthBounds();
    const wasteByType: typeof currentByType = {
      SALE_ITEM: emptyTypeSummary(),
      CONSUMABLE: emptyTypeSummary(),
      EQUIPMENT: emptyTypeSummary(),
    };

    const [menuWaste, nonMenuWaste] = await Promise.all([
      prisma.branchMenuItemStockHistory.findMany({
        where: {
          branchId: branch.id,
          type: { in: [...WASTE_HISTORY_TYPES] },
          createdAt: { gte: month.start, lt: month.end },
        },
        select: { menuItemId: true, quantity: true },
      }),
      prisma.branchNonMenuItemHistory.findMany({
        where: {
          item: { branchId: branch.id },
          type: { in: [...WASTE_HISTORY_TYPES] },
          createdAt: { gte: month.start, lt: month.end },
        },
        select: {
          quantity: true,
          item: { select: { id: true, stockType: true, price: true } },
        },
      }),
    ]);

    for (const row of menuWaste) {
      const qty = Math.abs(row.quantity);
      if (qty <= 0) continue;
      const unitPrice = priceByProductId.get(row.menuItemId) ?? 0;
      wasteByType.SALE_ITEM.quantity += qty;
      wasteByType.SALE_ITEM.valueBaht += qty * unitPrice;
    }
    for (const row of nonMenuWaste) {
      const qty = Math.abs(row.quantity);
      if (qty <= 0) continue;
      const stockType = row.item.stockType as keyof typeof wasteByType;
      if (!(stockType in wasteByType)) continue;
      const unitPrice =
        priceByProductId.get(row.item.id) ?? Number(row.item.price ?? 0);
      wasteByType[stockType].quantity += qty;
      wasteByType[stockType].valueBaht += qty * unitPrice;
    }

    // Recent movements
    const recentMenuMovements = await prisma.branchMenuItemStockHistory.findMany({
      where: { branchId: branch.id },
      include: { menuItem: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    
    const recentNonMenuMovements = await prisma.branchNonMenuItemHistory.findMany({
      where: { item: { branchId: branch.id } },
      include: { item: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    let mappedMovements = [
      ...recentMenuMovements.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        createdAt: m.createdAt.toISOString(),
        note: m.note,
        product: {
          id: m.menuItemId,
          name: m.menuItem.name,
          unit: "รายการ",
          stockType: "SALE_ITEM",
        },
      })),
      ...recentNonMenuMovements.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        createdAt: m.createdAt.toISOString(),
        note: m.note,
        product: {
          id: m.branchNonMenuItemId,
          name: m.item.name,
          unit: m.item.unit,
          stockType: m.item.stockType,
        },
      }))
    ];

    mappedMovements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    mappedMovements = mappedMovements.slice(0, 50);

    return jsonOk({
      stockActive: true,
      brandId: branch.brandId,
      locationId: branch.id,
      allowNegativeStock: true,
      pending: [],
      balances,
      products,
      lowItems: balances.filter((b) => b.quantity <= 0),
      counts: [],
      recentMovements: mappedMovements,
      summary: {
        monthLabel: month.label,
        currentByType,
        wasteByType,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    if (!session.staffId) return jsonError("ไม่พบข้อมูลพนักงาน", 401);
    const body = postSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    // End-of-day stock + cash summary (BranchMenuItem stock system)
    if (body.action === "summary") {
      const menuItems = await prisma.branchMenuItem.findMany({
        where: {
          branchId: branch.id,
          id: { in: body.lines.map((l) => l.brandProductId) },
        },
        include: { stock: true },
      });
      const menuMap = new Map(menuItems.map((m) => [m.id, m]));

      for (const line of body.lines) {
        if (!menuMap.has(line.brandProductId)) {
          return jsonError(`ไม่พบเมนูในสาขา: ${line.brandProductId}`);
        }
      }

      const activeShift = await getActiveShift(branch.id);
      const countLinesPayload: Array<{
        name: string;
        systemQty: number;
        countedQty: number;
      }> = [];

      await prisma.$transaction(async (tx) => {
        for (const line of body.lines) {
          const menu = menuMap.get(line.brandProductId)!;
          const oldQty = menu.stock?.quantity ?? 0;
          const newQty = line.countedQty;
          const actualDiff = newQty - oldQty;

          await tx.branchMenuItemStock.upsert({
            where: { menuItemId: menu.id },
            update: { quantity: newQty },
            create: {
              branchId: branch.id,
              menuItemId: menu.id,
              quantity: newQty,
            },
          });

          await tx.branchMenuItem.update({
            where: { id: menu.id },
            data: { isOutOfStock: newQty <= 0 },
          });

          if (actualDiff !== 0) {
            await tx.branchMenuItemStockHistory.create({
              data: {
                branchId: branch.id,
                menuItemId: menu.id,
                quantity: actualDiff,
                type: "ADJUST",
                note: `สรุปยอดสต๊อกสิ้นวัน (นับได้ ${newQty})`,
                createdByStaffId: session.staffId,
              },
            });
          }

          countLinesPayload.push({
            name: menu.name,
            systemQty: oldQty,
            countedQty: newQty,
          });
        }
      });

      // Persist summary for admin history (best-effort; stock already saved)
      if (branch.brandId) {
        try {
          let location = await prisma.stockLocation.findFirst({
            where: { branchId: branch.id, type: "BRANCH" },
          });
          if (!location) {
            location = await prisma.stockLocation.create({
              data: {
                brandId: branch.brandId,
                branchId: branch.id,
                type: "BRANCH",
                name: branch.name || "สาขา",
              },
            });
          }

          const roundLabel = activeShift?.roundNumber ?? "—";
          const dateLabel = new Intl.DateTimeFormat("th-TH", {
            timeZone: "Asia/Bangkok",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }).format(new Date());
          await prisma.stockCount.create({
            data: {
              brandId: branch.brandId,
              branchId: branch.id,
              shiftId: activeShift?.id ?? null,
              stockLocationId: location.id,
              name: `สรุปยอดสต๊อกและขายราย · รอบที่ ${roundLabel} (${dateLabel})`,
              status: "COMPLETED",
              completedAt: new Date(),
              createdByStaffId: session.staffId,
              note: JSON.stringify({
                cash: body.cash,
                transfer: body.transfer,
                change: body.change,
                customers: body.customers,
                lines: countLinesPayload,
              }),
            },
          });
        } catch (err) {
          console.error("[staff/stock summary] failed to save StockCount history", err);
        }
      }

      return jsonOk({ ok: true }, 201);
    }

    const targetId = body.brandProductId;
    
    // Check if non-menu item
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
              imageUrl: body.action === "issue" ? (body.imageUrl ?? null) : null,
              createdByStaffId: session.staffId,
            },
          });
        }
      }
    } else {
      // Must be a menu item
      const menuItem = await prisma.branchMenuItem.findFirst({
        where: { id: targetId, branchId: branch.id },
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
              branchId: session.branchId,
              menuItemId: targetId,
              quantity: newQty,
            },
          });

          // Keep sold-out flag in sync so key-order / customer menus reflect stock
          await tx.branchMenuItem.update({
            where: { id: targetId },
            data: { isOutOfStock: newQty <= 0 },
          });

          if (actualDiff !== 0) {
            await tx.branchMenuItemStockHistory.create({
              data: {
                branchId: session.branchId,
                menuItemId: targetId,
                quantity: actualDiff,
                type: body.action.toUpperCase(),
                note: body.note ?? null,
                imageUrl: body.action === "issue" ? (body.imageUrl ?? null) : null,
                createdByStaffId: session.staffId,
              },
            });
          }
        });
      }
    }

    return jsonOk({ ok: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
