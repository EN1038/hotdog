import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { z } from "zod";

type Params = { params: Promise<{ id: string; countId: string }> };

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
  lines?: NoteLine[];
  cash?: number;
  transfer?: number;
  change?: number;
  customers?: number;
};

const bodySchema = z.object({
  action: z.enum(["apply", "reject"]).default("apply"),
  note: z.string().trim().max(300).nullable().optional(),
});

/**
 * POST — admin converts a pending SALE_ITEM stock summary into actual ADJUST stock.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId, countId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const count = await prisma.stockCount.findFirst({
      where: { id: countId, branchId },
    });
    if (!count) return jsonError("ไม่พบสรุปยอด", 404);

    let note: NotePayload = {};
    if (count.note?.startsWith("{")) {
      try {
        note = JSON.parse(count.note) as NotePayload;
      } catch {
        note = {};
      }
    }

    if (body.action === "reject") {
      if (count.status === "COMPLETED") {
        return jsonError("สรุปยอดนี้ปรับสต๊อกแล้ว ยกเลิกไม่ได้");
      }
      if (count.status === "CANCELLED") {
        return jsonOk({ ok: true, status: "CANCELLED" });
      }
      const updated = await prisma.stockCount.update({
        where: { id: count.id },
        data: {
          status: "CANCELLED",
          note: JSON.stringify({
            ...note,
            pendingAdminApply: false,
            rejectedAt: new Date().toISOString(),
            rejectedByAdminId: session.adminId,
            rejectNote: body.note ?? null,
          }),
        },
      });
      await logAdminActivity(session, {
        action: "branch.update",
        summary: `ปฏิเสธสรุปยอดสต๊อก: ${count.name}`,
        brandId: count.brandId,
        branchId,
        entityType: "STOCK_COUNT",
        entityId: count.id,
        entityName: count.name,
      });
      return jsonOk({ ok: true, status: updated.status });
    }

    // apply
    if (count.status === "COMPLETED") {
      return jsonError("สรุปยอดนี้ถูกปรับสต๊อกแล้ว");
    }
    if (count.status === "CANCELLED") {
      return jsonError("สรุปยอดนี้ถูกปฏิเสธแล้ว");
    }

    const stockType = note.stockType ?? "SALE_ITEM";
    if (stockType !== "SALE_ITEM") {
      return jsonError("ตอนนี้รองรับการปรับสต๊อกจากสรุปเมนูขายเท่านั้น");
    }

    const lines = Array.isArray(note.lines) ? note.lines : [];
    if (lines.length === 0) {
      return jsonError("สรุปยอดไม่มีรายการให้นำไปปรับสต๊อก");
    }

    const menuIds = lines
      .map((l) => l.menuItemId)
      .filter((id): id is string => Boolean(id));

    // Prefer IDs; fall back to all sale menus for name matching
    const menus = await prisma.branchMenuItem.findMany({
      where: {
        branchId,
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

    // If note has no IDs, load full sale catalog for name match
    if (menuIds.length === 0) {
      const allMenus = await prisma.branchMenuItem.findMany({
        where: { branchId, isHidden: false },
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
                  `แอดมิน Convert จากสรุปยอด · ${count.name} (นับได้ ${newQty})`,
                createdByStaffId: null,
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
              appliedByAdminId: session.adminId,
              applyNote: body.note ?? null,
              lines,
            }),
          },
        });
      },
      { timeout: 120_000, maxWait: 20_000 },
    );

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `ปรับสต๊อกจากสรุปยอด: ${count.name} (${adjusted} รายการที่ยอดเปลี่ยน)`,
      brandId: count.brandId,
      branchId,
      entityType: "STOCK_COUNT",
      entityId: count.id,
      entityName: count.name,
    });

    return jsonOk({
      ok: true,
      status: "COMPLETED",
      adjustedItemCount: adjusted,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ไม่พบเมนู")) {
      return jsonError(error.message);
    }
    return handleApiError(error);
  }
}
