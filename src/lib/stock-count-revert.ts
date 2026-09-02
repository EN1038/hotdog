import { prisma } from "@/lib/db";
import {
  isAutoAppliedNonSaleSummary,
  parseStockSummaryNote,
} from "@/lib/stock-count-revert-shared";

export { isAutoAppliedNonSaleSummary } from "@/lib/stock-count-revert-shared";

type NoteLine = {
  menuItemId?: string;
  nonMenuItemId?: string;
  name: string;
  systemQty: number;
  countedQty: number;
};

export async function revertStockSummaryToPendingConvert(opts: {
  branchId: string;
  countId: string;
  actorAdminId?: string | null;
  note?: string | null;
}): Promise<
  | { ok: true; status: string; restoredItemCount: number }
  | { ok: false; error: string }
> {
  const count = await prisma.branchStockSummary.findFirst({
    where: { id: opts.countId, branchId: opts.branchId },
  });
  if (!count) return { ok: false, error: "ไม่พบสรุปยอด" };

  if (!isAutoAppliedNonSaleSummary(count.status, count.note)) {
    return {
      ok: false,
      error:
        "ย้อนกลับได้เฉพาะสรุปของสิ้นเปลือง/อุปกรณ์ที่ปรับสต๊อกอัตโนมัติ (ก่อนรอ Convert)",
    };
  }

  const note = parseStockSummaryNote(count.note);
  const lines = Array.isArray(note.lines) ? note.lines : [];
  if (lines.length === 0) {
    return { ok: false, error: "สรุปยอดไม่มีรายการ" };
  }

  let restored = 0;
  const revertBatchId = count.id;

  await prisma.$transaction(
    async (tx) => {
      for (const line of lines) {
        if (!line.nonMenuItemId) continue;
        const item = await tx.branchNonMenuItem.findFirst({
          where: {
            id: line.nonMenuItemId,
            branchId: opts.branchId,
          },
        });
        if (!item) {
          throw new Error(`ไม่พบรายการในสาขา: ${line.name || line.nonMenuItemId}`);
        }

        const targetQty = Math.max(
          0,
          Math.floor(Number(line.systemQty) || 0),
        );
        const currentQty = item.quantity;
        const diff = targetQty - currentQty;

        if (diff !== 0) {
          await tx.branchNonMenuItem.update({
            where: { id: item.id },
            data: { quantity: targetQty },
          });
          await tx.branchNonMenuItemHistory.create({
            data: {
              branchNonMenuItemId: item.id,
              quantity: diff,
              type: "ADJUST",
              batchId: revertBatchId,
              note:
                opts.note?.trim() ||
                `ย้อนกลับรอ Convert · ${count.name} (คืนยอดระบบ ${targetQty})`,
              createdByStaffId: null,
            },
          });
          restored += 1;
        }
      }

      await tx.branchStockSummary.update({
        where: { id: count.id },
        data: {
          status: "IN_PROGRESS",
          completedAt: null,
          note: JSON.stringify({
            ...note,
            pendingAdminApply: true,
            revertedAt: new Date().toISOString(),
            revertedByAdminId: opts.actorAdminId ?? null,
            revertNote: opts.note ?? null,
          }),
        },
      });
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  return { ok: true, status: "IN_PROGRESS", restoredItemCount: restored };
}

export async function revertAllAutoAppliedNonSaleSummaries(opts?: {
  branchId?: string;
  dryRun?: boolean;
}): Promise<{
  scanned: number;
  reverted: number;
  skipped: number;
  errors: string[];
}> {
  const where = opts?.branchId ? { branchId: opts.branchId } : {};
  const rows = await prisma.branchStockSummary.findMany({
    where: {
      ...where,
      status: "COMPLETED",
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, branchId: true, name: true, status: true, note: true },
  });

  let reverted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!isAutoAppliedNonSaleSummary(row.status, row.note)) {
      skipped += 1;
      continue;
    }
    if (opts?.dryRun) {
      reverted += 1;
      continue;
    }
    const result = await revertStockSummaryToPendingConvert({
      branchId: row.branchId,
      countId: row.id,
      note: "ย้อนกลับอัตโนมัติหลังเปลี่ยน flow รอ Convert",
    });
    if (!result.ok) {
      errors.push(`${row.id} (${row.name}): ${result.error}`);
      continue;
    }
    reverted += 1;
  }

  return { scanned: rows.length, reverted, skipped, errors };
}
