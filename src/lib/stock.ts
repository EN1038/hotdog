import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  BRANCH_MENU_ORDER_NOTE_PREFIX,
  branchMenuOrderNote,
  parseBranchMenuOrderNote,
} from "@/lib/branch-menu-order-note";

export { parseBranchMenuOrderNote };

export class StockError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "StockError";
    this.status = status;
  }
}

type Tx = Prisma.TransactionClient;

/** สต็อกสาขาใช้งานได้เมื่อแพ็กเกจเปิดสต็อกและสาขาเปิดสต็อก */
export function isBranchStockActive(input: {
  brandId: string | null | undefined;
  brandStockEnabled: boolean | null | undefined;
  branchStockEnabled: boolean | null | undefined;
}) {
  return Boolean(
    input.brandId && input.brandStockEnabled && input.branchStockEnabled,
  );
}

export async function setBranchStockEnabled(input: {
  branchId: string;
  enabled: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({
      where: { id: input.branchId },
      include: { brand: true },
    });
    if (!branch) throw new StockError("ไม่พบสาขา", 404);
    if (!branch.brandId || !branch.brand) {
      throw new StockError("เปิดสต๊อกได้เฉพาะสาขาที่อยู่ใต้แบรนด์เท่านั้น");
    }
    if (input.enabled && !branch.brand.stockEnabled) {
      throw new StockError(
        "แพ็กเกจยังไม่เปิดโมดูลสต๊อก — เปิดที่แพ็กเกจแบรนด์ก่อน",
      );
    }

    return tx.branch.update({
      where: { id: input.branchId },
      data: { stockEnabled: input.enabled },
      include: { brand: true },
    });
  });
}

export async function deductBranchMenuStockForOrder(input: {
  orderId: string;
  orderNumber: string;
  branchId: string;
  staffId?: string | null;
  lines: Array<{
    branchMenuItemId: string;
    quantity: number;
    optionIds?: string[];
  }>;
  tx?: Tx;
}) {
  const run = async (client: Tx) => {
    const already = await client.branchMenuItemStockHistory.findFirst({
      where: {
        branchId: input.branchId,
        type: "SALE",
        note: { startsWith: `${BRANCH_MENU_ORDER_NOTE_PREFIX}${input.orderId}` },
      },
      select: { id: true },
    });
    if (already) return;

    const menuIds = [...new Set(input.lines.map((l) => l.branchMenuItemId))];
    const menus = await client.branchMenuItem.findMany({
      where: { id: { in: menuIds }, branchId: input.branchId },
      include: {
        optionGroupLinks: {
          include: {
            group: {
              select: {
                id: true,
                mode: true,
                menuItemSources: {
                  where: { isEnabled: true },
                  select: { menuItemId: true },
                },
              },
            },
          },
        },
        category: { select: { stockExempt: true } },
        stock: true,
      },
    });
    const menuMap = new Map(menus.map((m) => [m.id, m]));

    const needs = new Map<string, { qty: number; name: string }>();

    for (const line of input.lines) {
      if (line.quantity <= 0) continue;
      const menu = menuMap.get(line.branchMenuItemId);
      if (!menu) continue;

      const fromMenuGroups = menu.optionGroupLinks
        .filter((l) => l.group.mode === "FROM_MENU")
        .map((l) => l.group);
      const fromMenuOptionIds = new Set(
        fromMenuGroups.flatMap((g) =>
          g.menuItemSources.map((s) => s.menuItemId),
        ),
      );

      if (fromMenuOptionIds.size > 0 && (line.optionIds?.length ?? 0) > 0) {
        const counts = new Map<string, number>();
        for (const optId of line.optionIds ?? []) {
          if (!fromMenuOptionIds.has(optId)) continue;
          counts.set(optId, (counts.get(optId) ?? 0) + 1);
        }
        for (const [optMenuId, perPack] of counts) {
          const total = perPack * line.quantity;
          const prev = needs.get(optMenuId);
          needs.set(optMenuId, {
            qty: (prev?.qty ?? 0) + total,
            name: prev?.name ?? optMenuId,
          });
        }
      } else if (menu.category?.stockExempt) {
        continue;
      } else {
        const prev = needs.get(menu.id);
        needs.set(menu.id, {
          qty: (prev?.qty ?? 0) + line.quantity,
          name: menu.name,
        });
      }
    }

    if (needs.size === 0) return;

    const needIds = [...needs.keys()];
    const named = await client.branchMenuItem.findMany({
      where: { id: { in: needIds }, branchId: input.branchId },
      include: { stock: true },
    });
    const namedMap = new Map(named.map((m) => [m.id, m]));

    for (const [menuItemId, need] of needs) {
      const item = namedMap.get(menuItemId);
      if (!item) {
        throw new StockError(`ไม่พบเมนูสำหรับตัดสต๊อก`, 400);
      }
      need.name = item.name;
      if (!item.stock) continue;
      const have = item.stock.quantity;
      if (have < need.qty) {
        throw new StockError(
          `สต๊อกไม่พอ: ${item.name} (เหลือ ${have} ต้องการ ${need.qty})`,
        );
      }
    }

    const note = branchMenuOrderNote(input.orderId, input.orderNumber);

    for (const [menuItemId, need] of needs) {
      const item = namedMap.get(menuItemId)!;
      if (!item.stock) continue;
      const oldQty = item.stock.quantity;
      const newQty = oldQty - need.qty;

      await client.branchMenuItemStock.update({
        where: { menuItemId },
        data: { quantity: newQty },
      });

      await client.branchMenuItem.update({
        where: { id: menuItemId },
        data: { isOutOfStock: newQty <= 0 },
      });

      await client.branchMenuItemStockHistory.create({
        data: {
          branchId: input.branchId,
          menuItemId,
          quantity: -need.qty,
          type: "SALE",
          note,
          createdByStaffId: input.staffId ?? null,
        },
      });
    }

    await client.order.update({
      where: { id: input.orderId },
      data: { stockDeducted: true },
    });
  };

  if (input.tx) return run(input.tx);
  return prisma.$transaction(run);
}

export async function restoreBranchMenuStockForOrder(
  orderId: string,
  tx?: Tx,
) {
  const run = async (client: Tx) => {
    const histories = await client.branchMenuItemStockHistory.findMany({
      where: {
        type: "SALE",
        note: { startsWith: `${BRANCH_MENU_ORDER_NOTE_PREFIX}${orderId}` },
      },
    });
    if (histories.length === 0) return;

    for (const h of histories) {
      const stock = await client.branchMenuItemStock.findUnique({
        where: { menuItemId: h.menuItemId },
      });
      const oldQty = stock?.quantity ?? 0;
      const newQty = oldQty - h.quantity;

      await client.branchMenuItemStock.upsert({
        where: { menuItemId: h.menuItemId },
        update: { quantity: newQty },
        create: {
          branchId: h.branchId,
          menuItemId: h.menuItemId,
          quantity: newQty,
        },
      });

      await client.branchMenuItem.update({
        where: { id: h.menuItemId },
        data: { isOutOfStock: newQty <= 0 },
      });

      await client.branchMenuItemStockHistory.create({
        data: {
          branchId: h.branchId,
          menuItemId: h.menuItemId,
          quantity: -h.quantity,
          type: "ADJUST",
          note: `คืนสต๊อกจากยกเลิกออเดอร์ ${orderId}`,
          createdByStaffId: null,
        },
      });
    }
  };

  if (tx) return run(tx);
  return prisma.$transaction(run);
}

export async function deductBranchNonMenuStockForOrder(input: {
  orderId: string;
  orderNumber: string;
  branchId: string;
  staffId?: string | null;
  lines?: Array<{ branchNonMenuItemId: string; quantity: number }>;
  tx?: Tx;
}) {
  const run = async (client: Tx) => {
    const already = await client.branchNonMenuItemHistory.findFirst({
      where: {
        type: "ISSUE",
        note: { startsWith: `${BRANCH_MENU_ORDER_NOTE_PREFIX}${input.orderId}` },
        item: { branchId: input.branchId },
      },
      select: { id: true },
    });
    if (already) return;

    const lines =
      input.lines ??
      (
        await client.orderConsumableLine.findMany({
          where: { orderId: input.orderId },
          select: { branchNonMenuItemId: true, quantity: true },
        })
      );

    const needs = new Map<string, number>();
    for (const line of lines) {
      if (line.quantity <= 0) continue;
      needs.set(
        line.branchNonMenuItemId,
        (needs.get(line.branchNonMenuItemId) ?? 0) + line.quantity,
      );
    }
    if (needs.size === 0) return;

    const items = await client.branchNonMenuItem.findMany({
      where: {
        id: { in: [...needs.keys()] },
        branchId: input.branchId,
        stockType: "CONSUMABLE",
      },
    });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    for (const [itemId, qty] of needs) {
      const item = itemMap.get(itemId);
      if (!item) {
        throw new StockError("ไม่พบสินค้าสิ้นเปลืองสำหรับตัดสต๊อก", 400);
      }
      if (item.quantity < qty) {
        throw new StockError(
          `สต๊อกไม่พอ: ${item.name} (เหลือ ${item.quantity} ต้องการ ${qty})`,
        );
      }
    }

    const note = branchMenuOrderNote(input.orderId, input.orderNumber);
    for (const [itemId, qty] of needs) {
      const item = itemMap.get(itemId)!;
      const newQty = item.quantity - qty;
      await client.branchNonMenuItem.update({
        where: { id: itemId },
        data: { quantity: newQty },
      });
      await client.branchNonMenuItemHistory.create({
        data: {
          branchNonMenuItemId: itemId,
          quantity: -qty,
          type: "ISSUE",
          note,
          createdByStaffId: input.staffId ?? null,
        },
      });
    }
  };

  if (input.tx) return run(input.tx);
  return prisma.$transaction(run);
}

export async function restoreBranchNonMenuStockForOrder(
  orderId: string,
  tx?: Tx,
) {
  const run = async (client: Tx) => {
    const histories = await client.branchNonMenuItemHistory.findMany({
      where: {
        type: "ISSUE",
        note: { startsWith: `${BRANCH_MENU_ORDER_NOTE_PREFIX}${orderId}` },
      },
      include: { item: { select: { id: true, quantity: true } } },
    });
    if (histories.length === 0) return;

    for (const h of histories) {
      const restoreQty = -h.quantity;
      if (restoreQty <= 0) continue;
      const newQty = h.item.quantity + restoreQty;
      await client.branchNonMenuItem.update({
        where: { id: h.branchNonMenuItemId },
        data: { quantity: newQty },
      });
      await client.branchNonMenuItemHistory.create({
        data: {
          branchNonMenuItemId: h.branchNonMenuItemId,
          quantity: restoreQty,
          type: "ADJUST",
          note: `คืนสต๊อกจากยกเลิกออเดอร์ ${orderId}`,
          createdByStaffId: null,
        },
      });
    }
  };

  if (tx) return run(tx);
  return prisma.$transaction(run);
}

export async function restoreStockForOrder(orderId: string, tx?: Tx) {
  const run = async (client: Tx) => {
    const order = await client.order.findUnique({
      where: { id: orderId },
      select: { stockDeducted: true },
    });
    if (!order?.stockDeducted) return false;

    await restoreBranchMenuStockForOrder(orderId, client);
    await restoreBranchNonMenuStockForOrder(orderId, client);
    await client.order.update({
      where: { id: orderId },
      data: { stockDeducted: false },
    });
    return true;
  };

  if (tx) return run(tx);
  return prisma.$transaction(run);
}

export async function reapplyStockForOrder(orderId: string, tx?: Tx) {
  const run = async (client: Tx) => {
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: {
        branch: {
          include: {
            brand: {
              select: {
                id: true,
                stockEnabled: true,
                allowNegativeStock: true,
              },
            },
          },
        },
      },
    });
    if (!order) return;
    if (order.stockDeducted) return;
    if (order.awaitingPhotoKey) return;

    if (
      !isBranchStockActive({
        brandId: order.branch.brandId,
        brandStockEnabled: order.branch.brand?.stockEnabled,
        branchStockEnabled: order.branch.stockEnabled,
      })
    ) {
      return;
    }

    const allowNeg = Boolean(order.branch.brand?.allowNegativeStock);
    let reapplied = false;

    const menuSales = await client.branchMenuItemStockHistory.findMany({
      where: {
        type: "SALE",
        note: { startsWith: `${BRANCH_MENU_ORDER_NOTE_PREFIX}${orderId}` },
      },
    });
    for (const h of menuSales) {
      const deductQty = Math.abs(h.quantity);
      if (deductQty <= 0) continue;
      const stock = await client.branchMenuItemStock.findUnique({
        where: { menuItemId: h.menuItemId },
      });
      const oldQty = stock?.quantity ?? 0;
      const newQty = oldQty - deductQty;
      if (!allowNeg && newQty < 0) {
        throw new StockError(
          `สต๊อกไม่พอตอนกู้คืนรอบ (เมนูในออเดอร์ ${order.orderNumber})`,
        );
      }
      await client.branchMenuItemStock.upsert({
        where: { menuItemId: h.menuItemId },
        update: { quantity: newQty },
        create: {
          branchId: h.branchId,
          menuItemId: h.menuItemId,
          quantity: newQty,
        },
      });
      await client.branchMenuItem.update({
        where: { id: h.menuItemId },
        data: { isOutOfStock: newQty <= 0 },
      });
      await client.branchMenuItemStockHistory.create({
        data: {
          branchId: h.branchId,
          menuItemId: h.menuItemId,
          quantity: -deductQty,
          type: "ADJUST",
          note: `ตัดสต๊อกใหม่หลังกู้คืนรอบ ${orderId}`,
          createdByStaffId: null,
        },
      });
      reapplied = true;
    }

    const issues = await client.branchNonMenuItemHistory.findMany({
      where: {
        type: "ISSUE",
        note: { startsWith: `${BRANCH_MENU_ORDER_NOTE_PREFIX}${orderId}` },
      },
      include: { item: { select: { id: true, quantity: true, name: true } } },
    });
    for (const h of issues) {
      const need = Math.abs(h.quantity);
      if (need <= 0) continue;
      if (!allowNeg && h.item.quantity < need) {
        throw new StockError(
          `สต๊อกสิ้นเปlืองไม่พอตอนกู้คืน: ${h.item.name}`,
        );
      }
      const newQty = h.item.quantity - need;
      await client.branchNonMenuItem.update({
        where: { id: h.branchNonMenuItemId },
        data: { quantity: newQty },
      });
      await client.branchNonMenuItemHistory.create({
        data: {
          branchNonMenuItemId: h.branchNonMenuItemId,
          quantity: -need,
          type: "ADJUST",
          note: `ตัดสต๊อกใหม่หลังกู้คืนรอบ ${orderId}`,
          createdByStaffId: null,
        },
      });
      reapplied = true;
    }

    if (reapplied) {
      await client.order.update({
        where: { id: orderId },
        data: { stockDeducted: true },
      });
    }
  };

  if (tx) return run(tx);
  return prisma.$transaction(run);
}

export async function maybeDeductOnAccept(input: {
  orderId: string;
  previousStatus: import("@prisma/client").OrderStatus;
  nextStatus: import("@prisma/client").OrderStatus;
}) {
  const { OrderStatus } = await import("@prisma/client");
  if (
    input.previousStatus === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE &&
    input.nextStatus === OrderStatus.PREPARING
  ) {
    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      include: { items: true },
    });
    if (!order) return;

    await deductBranchMenuStockForOrder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      lines: order.items
        .filter((i) => i.branchMenuItemId)
        .map((i) => ({
          branchMenuItemId: i.branchMenuItemId!,
          quantity: i.quantity + (i.giftQuantity ?? 0),
          optionIds: [],
        })),
    });
    await deductBranchNonMenuStockForOrder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
    });
  }
}

export type BranchMenuStockSaleAgg = {
  menuItemId: string;
  name: string;
  quantity: number;
  orders: Array<{ id: string; orderNumber: string }>;
};

export async function aggregateBranchMenuStockSalesByOrders(
  branchId: string,
  orders: Array<{ id: string; orderNumber: string }>,
): Promise<BranchMenuStockSaleAgg[]> {
  if (orders.length === 0) return [];

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const orFilters = orders.map((o) => ({
    note: { startsWith: `${BRANCH_MENU_ORDER_NOTE_PREFIX}${o.id}` },
  }));

  const histories: Array<{
    menuItemId: string;
    quantity: number;
    note: string | null;
    menuItem: { id: string; name: string };
  }> = [];

  const chunkSize = 40;
  for (let i = 0; i < orFilters.length; i += chunkSize) {
    const chunk = orFilters.slice(i, i + chunkSize);
    const rows = await prisma.branchMenuItemStockHistory.findMany({
      where: {
        branchId,
        type: "SALE",
        OR: chunk,
      },
      select: {
        menuItemId: true,
        quantity: true,
        note: true,
        menuItem: { select: { id: true, name: true } },
      },
    });
    histories.push(...rows);
  }

  type Acc = {
    menuItemId: string;
    name: string;
    quantity: number;
    orderMap: Map<string, string>;
  };
  const byMenu = new Map<string, Acc>();

  for (const h of histories) {
    const parsed = parseBranchMenuOrderNote(h.note);
    if (!parsed || !orderById.has(parsed.orderId)) continue;
    const order = orderById.get(parsed.orderId)!;
    const deducted = Math.abs(h.quantity);
    if (deducted <= 0) continue;

    let acc = byMenu.get(h.menuItemId);
    if (!acc) {
      acc = {
        menuItemId: h.menuItemId,
        name: h.menuItem.name,
        quantity: 0,
        orderMap: new Map(),
      };
      byMenu.set(h.menuItemId, acc);
    }
    acc.quantity += deducted;
    acc.orderMap.set(order.id, order.orderNumber);
  }

  return [...byMenu.values()]
    .map((a) => ({
      menuItemId: a.menuItemId,
      name: a.name,
      quantity: a.quantity,
      orders: [...a.orderMap.entries()]
        .map(([id, orderNumber]) => ({ id, orderNumber }))
        .sort((x, y) => x.orderNumber.localeCompare(y.orderNumber, "th")),
    }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "th"));
}
