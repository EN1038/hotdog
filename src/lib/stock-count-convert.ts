import { prisma } from "@/lib/db";
import type { StockConvertActor } from "@/lib/stock-count-convert-auth";

type NoteLine = {
  menuItemId?: string;
  nonMenuItemId?: string;
  name: string;
  systemQty: number;
  countedQty: number;
};

type NotePayload = {
  stockType?: string;
  pendingAdminApply?: boolean;
  appliedAt?: string;
  appliedByAdminId?: string;
  appliedByStaffId?: string;
  appliedByLabel?: string;
  rejectedAt?: string;
  rejectedByAdminId?: string;
  rejectedByStaffId?: string;
  rejectedByLabel?: string;
  rejectNote?: string | null;
  applyNote?: string | null;
  lines?: NoteLine[];
  cash?: number;
  transfer?: number;
  change?: number;
  customers?: number;
};

function parseNote(raw: string | null): NotePayload {
  if (!raw?.startsWith("{")) return {};
  try {
    return JSON.parse(raw) as NotePayload;
  } catch {
    return {};
  }
}

export async function convertStockCountSummary(opts: {
  branchId: string;
  countId: string;
  action: "apply" | "reject";
  note?: string | null;
  actor: StockConvertActor;
}): Promise<
  | { ok: true; status: string; adjustedItemCount?: number }
  | { ok: false; error: string }
> {
  const count = await prisma.stockCount.findFirst({
    where: { id: opts.countId, branchId: opts.branchId },
  });
  if (!count) return { ok: false, error: "ไม่พบสรุปยอด" };

  const note = parseNote(count.note);

  if (opts.action === "reject") {
    if (count.status === "COMPLETED") {
      return { ok: false, error: "สรุปยอดนี้ปรับสต๊อกแล้ว ยกเลิกไม่ได้" };
    }
    if (count.status === "CANCELLED") {
      return { ok: true, status: "CANCELLED" };
    }
    const updated = await prisma.stockCount.update({
      where: { id: count.id },
      data: {
        status: "CANCELLED",
        note: JSON.stringify({
          ...note,
          pendingAdminApply: false,
          rejectedAt: new Date().toISOString(),
          rejectedByAdminId: opts.actor.adminId,
          rejectedByStaffId: opts.actor.staffId,
          rejectedByLabel: opts.actor.label,
          rejectNote: opts.note ?? null,
        }),
      },
    });
    return { ok: true, status: updated.status };
  }

  if (count.status === "COMPLETED") {
    return { ok: false, error: "สรุปยอดนี้ถูกปรับสต๊อกแล้ว" };
  }
  if (count.status === "CANCELLED") {
    return { ok: false, error: "สรุปยอดนี้ถูกปฏิเสธแล้ว" };
  }

  const stockType = note.stockType ?? "SALE_ITEM";
  if (stockType !== "SALE_ITEM") {
    return {
      ok: false,
      error: "ตอนนี้รองรับการปรับสต๊อกจากสรุปเมนูขายเท่านั้น",
    };
  }

  const lines = Array.isArray(note.lines) ? note.lines : [];
  if (lines.length === 0) {
    return { ok: false, error: "สรุปยอดไม่มีรายการให้นำไปปรับสต๊อก" };
  }

  const menuIds = lines
    .map((l) => l.menuItemId)
    .filter((id): id is string => Boolean(id));

  const menus = await prisma.branchMenuItem.findMany({
    where: {
      branchId: opts.branchId,
      isHidden: false,
      ...(menuIds.length > 0 ? { id: { in: menuIds } } : {}),
    },
    include: {
      stock: true,
      category: { select: { stockExempt: true } },
      optionGroupLinks: {
        select: { group: { select: { mode: true } } },
      },
    },
  });

  const saleMenus = menus.filter((item) => {
    const isPromo = item.optionGroupLinks.some(
      (l) => l.group.mode === "FROM_MENU",
    );
    return !isPromo && !item.category?.stockExempt;
  });
  const menuMap = new Map(saleMenus.map((m) => [m.id, m]));
  const menuByName = new Map<string, (typeof saleMenus)[number]>();
  for (const m of saleMenus) {
    if (!menuByName.has(m.name)) menuByName.set(m.name, m);
  }

  if (menuIds.length === 0) {
    const allMenus = await prisma.branchMenuItem.findMany({
      where: { branchId: opts.branchId, isHidden: false },
      include: {
        stock: true,
        category: { select: { stockExempt: true } },
        optionGroupLinks: {
          select: { group: { select: { mode: true } } },
        },
      },
    });
    for (const m of allMenus) {
      const isPromo = m.optionGroupLinks.some(
        (l) => l.group.mode === "FROM_MENU",
      );
      if (isPromo || m.category?.stockExempt) continue;
      menuMap.set(m.id, m);
      if (!menuByName.has(m.name)) menuByName.set(m.name, m);
    }
  }

  let adjusted = 0;
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const line of lines) {
          const menu =
            (line.menuItemId ? menuMap.get(line.menuItemId) : undefined) ||
            menuByName.get(line.name);
          if (!menu) {
            throw new Error(`ไม่พบเมนูในสาขา: ${line.name || line.menuItemId}`);
          }
          const oldQty = menu.stock?.quantity ?? 0;
          const newQty = Math.max(0, Math.floor(Number(line.countedQty) || 0));
          const actualDiff = newQty - oldQty;
          const nextOutOfStock = newQty <= 0;

          if (!menu.stock || actualDiff !== 0) {
            await tx.branchMenuItemStock.upsert({
              where: { menuItemId: menu.id },
              update: { quantity: newQty },
              create: {
                branchId: opts.branchId,
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
                branchId: opts.branchId,
                menuItemId: menu.id,
                quantity: actualDiff,
                type: "ADJUST",
                batchId: count.id,
                note:
                  opts.note?.trim() ||
                  `${opts.actor.label} Convert จากสรุปยอด · ${count.name} (นับได้ ${newQty})`,
                createdByStaffId: opts.actor.staffId,
              },
            });
            adjusted += 1;
          }
        }

        await tx.stockCount.update({
          where: { id: count.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            note: JSON.stringify({
              ...note,
              pendingAdminApply: false,
              appliedAt: new Date().toISOString(),
              appliedByAdminId: opts.actor.adminId,
              appliedByStaffId: opts.actor.staffId,
              appliedByLabel: opts.actor.label,
              applyNote: opts.note ?? null,
              lines,
            }),
          },
        });
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ไม่พบเมนู")) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  return { ok: true, status: "COMPLETED", adjustedItemCount: adjusted };
}
