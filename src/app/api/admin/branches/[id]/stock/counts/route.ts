import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  bangkokDateKey,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { isOrderCountableRevenue } from "@/lib/order-totals";

const createLineSchema = z.object({
  itemId: z.string().min(1),
  countedQty: z.number().int().min(0),
});

const createSchema = z.object({
  stockType: z.enum(["SALE_ITEM", "CONSUMABLE", "EQUIPMENT"]),
  /** SALE_ITEM only: convert to ADJUST in the same request */
  applyNow: z.boolean().optional().default(false),
  name: z.string().trim().min(1).max(160).optional(),
  note: z.string().trim().max(300).nullable().optional(),
  cash: z.number().min(0).optional().default(0),
  transfer: z.number().min(0).optional().default(0),
  change: z.number().min(0).optional().default(0),
  customers: z.number().int().min(0).optional().default(0),
  lines: z.array(createLineSchema).min(1),
});

type DayItemActivity = {
  name: string;
  soldQty: number;
  restockQty: number;
  wasteQty: number;
  issueQty: number;
};

async function loadDayMenuActivity(
  branchId: string,
  dateStr: string,
): Promise<DayItemActivity[]> {
  if (!isBangkokDateKey(dateStr)) return [];

  const createdAtRange = {
    gte: new Date(`${dateStr}T00:00:00+07:00`),
    lte: new Date(`${dateStr}T23:59:59.999+07:00`),
  };

  const menuItems = await prisma.branchMenuItem.findMany({
    where: { branchId, isHidden: false },
    select: { id: true, name: true },
  });
  if (menuItems.length === 0) return [];

  const nameById = new Map(menuItems.map((m) => [m.id, m.name.trim()]));
  const byName = new Map<
    string,
    {
      soldQty: number;
      restockQty: number;
      wasteQty: number;
      issueQty: number;
    }
  >();

  const ensure = (name: string) => {
    const key = name.trim();
    if (!key) return null;
    const cur = byName.get(key) ?? {
      soldQty: 0,
      restockQty: 0,
      wasteQty: 0,
      issueQty: 0,
    };
    byName.set(key, cur);
    return cur;
  };

  for (const m of menuItems) ensure(m.name);

  const [orders, history] = await Promise.all([
    prisma.order.findMany({
      where: {
        branchId,
        queueBusinessDate: queueBusinessDateFromKey(dateStr),
      },
      select: {
        status: true,
        awaitingPhotoKey: true,
        items: {
          select: {
            branchMenuItemId: true,
            quantity: true,
            giftQuantity: true,
            itemName: true,
          },
        },
      },
    }),
    prisma.branchMenuItemStockHistory.findMany({
      where: {
        branchId,
        type: { in: ["STOCK_IN", "ISSUE", "DAMAGE", "LOST"] },
        createdAt: createdAtRange,
      },
      select: {
        menuItemId: true,
        quantity: true,
        type: true,
      },
    }),
  ]);

  for (const order of orders) {
    const countable = isOrderCountableRevenue({
      status: order.status,
      awaitingPhotoKey: order.awaitingPhotoKey,
    });
    if (!countable) continue;
    for (const it of order.items) {
      const soldUnits = Math.max(0, it.quantity - (it.giftQuantity ?? 0));
      if (soldUnits <= 0) continue;
      const name =
        (it.branchMenuItemId
          ? nameById.get(it.branchMenuItemId)
          : null) ||
        (it.itemName ?? "").trim();
      const row = ensure(name);
      if (row) row.soldQty += soldUnits;
    }
  }

  for (const row of history) {
    const qty = Math.abs(row.quantity);
    if (qty <= 0) continue;
    const name = nameById.get(row.menuItemId);
    if (!name) continue;
    const acc = ensure(name);
    if (!acc) continue;
    if (row.type === "STOCK_IN") acc.restockQty += qty;
    else if (row.type === "ISSUE") {
      acc.issueQty += qty;
      acc.wasteQty += qty;
    } else {
      acc.wasteQty += qty;
    }
  }

  return [...byName.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .filter(
      (r) =>
        r.soldQty > 0 ||
        r.restockQty > 0 ||
        r.wasteQty > 0 ||
        r.issueQty > 0,
    )
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: branchId } = await context.params;
    await requireBranchAccess(branchId);

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date") || bangkokDateKey();

    let dateFilter: Record<string, unknown> = {};
    if (dateStr && isBangkokDateKey(dateStr)) {
      // Bangkok calendar day (+07:00)
      const startOfDay = new Date(`${dateStr}T00:00:00+07:00`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999+07:00`);
      if (!isNaN(startOfDay.getTime())) {
        dateFilter = {
          OR: [
            {
              completedAt: {
                gte: startOfDay,
                lte: endOfDay,
              },
            },
            {
              completedAt: null,
              createdAt: {
                gte: startOfDay,
                lte: endOfDay,
              },
            },
          ],
        };
      }
    }

    const [counts, dayActivityItems] = await Promise.all([
      prisma.stockCount.findMany({
        where: {
          branchId: branchId,
          status: { in: ["IN_PROGRESS", "COMPLETED", "CANCELLED"] },
          ...dateFilter,
        },
        orderBy: [{ createdAt: "desc" }, { completedAt: "desc" }],
        include: {
          createdByStaff: { select: { name: true } },
          createdByAdmin: { select: { username: true } },
          lines: {
            include: {
              product: {
                select: { name: true, stockType: true, unit: true },
              },
            },
          },
        },
      }),
      loadDayMenuActivity(branchId, dateStr),
    ]);

    return jsonOk({
      counts: counts.map((c) => ({
        ...c,
        completedAt: c.completedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
      dayActivity: {
        date: dateStr,
        items: dayActivityItems,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST — admin creates a stock-count document (same shape as staff end-of-day summary).
 * SALE_ITEM: pending Convert by default, or applyNow → ADJUST immediately.
 * CONSUMABLE / EQUIPMENT: always adjust stock immediately.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: branchId } = await context.params;
    const { session } = await requireBranchAccess(branchId);
    const body = createSchema.parse(await request.json());
    const stockType = body.stockType;
    const typeLabel =
      stockType === "SALE_ITEM"
        ? "เมนูขาย"
        : stockType === "CONSUMABLE"
          ? "ของสิ้นเปลือง"
          : "อุปกรณ์";

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (!branch.brandId) {
      return jsonError("สาขานี้ยังไม่ได้ผูกแบรนด์ ไม่สามารถสร้างสรุปยอดได้");
    }

    const itemIds = body.lines.map((l) => l.itemId);
    type LinePayload = {
      menuItemId?: string;
      nonMenuItemId?: string;
      name: string;
      systemQty: number;
      countedQty: number;
      unitPrice: number;
      unit: string;
      stockType: typeof stockType;
    };
    const countLinesPayload: LinePayload[] = [];

    if (stockType === "SALE_ITEM") {
      const menus = await prisma.branchMenuItem.findMany({
        where: { branchId, id: { in: itemIds }, isHidden: false },
        include: {
          stock: true,
          category: { select: { stockExempt: true } },
          optionGroupLinks: {
            select: { group: { select: { mode: true } } },
          },
        },
      });
      const menuMap = new Map(menus.map((m) => [m.id, m]));
      for (const line of body.lines) {
        const menu = menuMap.get(line.itemId);
        if (!menu) return jsonError(`ไม่พบเมนูในสาขา: ${line.itemId}`);
        const isPromo = menu.optionGroupLinks.some(
          (l) => l.group.mode === "FROM_MENU",
        );
        if (isPromo || menu.category?.stockExempt) {
          return jsonError(`เมนูนี้ไม่นับสต๊อก: ${menu.name}`);
        }
        countLinesPayload.push({
          menuItemId: menu.id,
          name: menu.name,
          systemQty: menu.stock?.quantity ?? 0,
          countedQty: line.countedQty,
          unitPrice: Number(menu.price ?? 0),
          unit: "รายการ",
          stockType,
        });
      }
    } else {
      const items = await prisma.branchNonMenuItem.findMany({
        where: { branchId, stockType, id: { in: itemIds } },
      });
      const itemMap = new Map(items.map((m) => [m.id, m]));
      for (const line of body.lines) {
        const item = itemMap.get(line.itemId);
        if (!item) return jsonError(`ไม่พบรายการในสาขา: ${line.itemId}`);
        countLinesPayload.push({
          nonMenuItemId: item.id,
          name: item.name,
          systemQty: item.quantity,
          countedQty: line.countedQty,
          unitPrice: Number(item.price ?? 0),
          unit: item.unit,
          stockType,
        });
      }
    }

    countLinesPayload.sort((a, b) => a.name.localeCompare(b.name, "th"));

    let location = await prisma.stockLocation.findFirst({
      where: { branchId, type: "BRANCH" },
    });
    if (!location) {
      location = await prisma.stockLocation.create({
        data: {
          brandId: branch.brandId,
          branchId,
          type: "BRANCH",
          name: branch.name || "สาขา",
        },
      });
    }

    const dateLabel = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
    const titlePrefix =
      stockType === "SALE_ITEM" ? "สรุปยอดสต๊อกและขาย" : "สรุปยอดสต๊อก";
    const docName =
      body.name?.trim() ||
      `${titlePrefix} · ${typeLabel} · แอดมินสร้าง (${dateLabel})`;

    // Non-sale always apply; SALE_ITEM pending unless applyNow
    const applyNow = stockType !== "SALE_ITEM" || body.applyNow;
    let adjusted = 0;

    const count = await prisma.$transaction(
      async (tx) => {
        if (applyNow) {
          if (stockType === "SALE_ITEM") {
            for (const line of countLinesPayload) {
              const menuId = line.menuItemId!;
              const menu = await tx.branchMenuItem.findUnique({
                where: { id: menuId },
                include: { stock: true },
              });
              if (!menu) throw new Error(`ไม่พบเมนูในสาขา: ${line.name}`);
              const oldQty = menu.stock?.quantity ?? 0;
              const newQty = line.countedQty;
              const actualDiff = newQty - oldQty;
              const nextOutOfStock = newQty <= 0;

              if (!menu.stock || actualDiff !== 0) {
                await tx.branchMenuItemStock.upsert({
                  where: { menuItemId: menu.id },
                  update: { quantity: newQty },
                  create: {
                    branchId,
                    menuItemId: menu.id,
                    quantity: newQty,
                  },
                });
              }
              if (menu.isOutOfStock !== nextOutOfStock) {
                await tx.branchMenuItem.update({
                  where: { id: menu.id },
                  data: { isOutOfStock: nextOutOfStock },
                });
              }
              if (actualDiff !== 0) {
                await tx.branchMenuItemStockHistory.create({
                  data: {
                    branchId,
                    menuItemId: menu.id,
                    quantity: actualDiff,
                    type: "ADJUST",
                    note:
                      body.note?.trim() ||
                      `แอดมิน Convert จากเอกสารยอดนับ · ${docName} (นับได้ ${newQty})`,
                    createdByStaffId: null,
                  },
                });
                adjusted += 1;
              }
            }
          } else {
            for (const line of countLinesPayload) {
              const itemId = line.nonMenuItemId!;
              const item = await tx.branchNonMenuItem.findUnique({
                where: { id: itemId },
              });
              if (!item) throw new Error(`ไม่พบรายการในสาขา: ${line.name}`);
              const oldQty = item.quantity;
              const newQty = line.countedQty;
              const actualDiff = newQty - oldQty;
              if (actualDiff !== 0) {
                await tx.branchNonMenuItem.update({
                  where: { id: item.id },
                  data: { quantity: newQty },
                });
                await tx.branchNonMenuItemHistory.create({
                  data: {
                    branchNonMenuItemId: item.id,
                    quantity: actualDiff,
                    type: "ADJUST",
                    note:
                      body.note?.trim() ||
                      `แอดมินปรับจากเอกสารยอดนับ · ${docName} (นับได้ ${newQty})`,
                    createdByStaffId: null,
                  },
                });
                adjusted += 1;
              }
            }
          }
        }

        return tx.stockCount.create({
          data: {
            brandId: branch.brandId!,
            branchId,
            stockLocationId: location!.id,
            name: docName,
            status: applyNow ? "COMPLETED" : "IN_PROGRESS",
            completedAt: applyNow ? new Date() : null,
            createdByAdminId: session.adminId,
            note: JSON.stringify({
              stockType,
              source: "ADMIN",
              pendingAdminApply: !applyNow,
              appliedAt: applyNow ? new Date().toISOString() : undefined,
              appliedByAdminId: applyNow ? session.adminId : undefined,
              cash: stockType === "SALE_ITEM" ? body.cash : 0,
              transfer: stockType === "SALE_ITEM" ? body.transfer : 0,
              change: stockType === "SALE_ITEM" ? body.change : 0,
              customers: stockType === "SALE_ITEM" ? body.customers : 0,
              adminNote: body.note ?? null,
              lines: countLinesPayload,
            }),
          },
        });
      },
      { timeout: 120_000, maxWait: 20_000 },
    );

    await logAdminActivity(session, {
      action: "branch.update",
      summary: applyNow
        ? `สร้างเอกสารยอดนับและปรับสต๊อก: ${count.name} (${adjusted} รายการ)`
        : `สร้างเอกสารยอดนับรอ Convert: ${count.name}`,
      brandId: branch.brandId,
      branchId,
      entityType: "STOCK_COUNT",
      entityId: count.id,
      entityName: count.name,
    });

    return jsonOk(
      {
        ok: true,
        countId: count.id,
        status: count.status,
        pendingAdminApply: !applyNow,
        adjustedItemCount: applyNow ? adjusted : 0,
      },
      201,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ไม่พบ")) {
      return jsonError(error.message);
    }
    return handleApiError(error);
  }
}
