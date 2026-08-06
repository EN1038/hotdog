import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { StockError } from "@/lib/stock";

export type StockHistoryLineRef = {
  id: string;
  source: "menu" | "non_menu";
};

/** STOCK_IN + legacy RESTOCK rows used as "รับเข้า" */
const CANCELLABLE_TYPES = new Set(["STOCK_IN", "ISSUE", "RESTOCK"]);

function dbSchema() {
  return (process.env.DATABASE_SCHEMA ?? "public").replace(/"/g, "");
}

function qTable(name: string) {
  return `"${dbSchema()}"."${name}"`;
}

let ensureColumnsPromise: Promise<void> | null = null;

/**
 * Idempotent: add cancel columns if missing (avoids migrate-only footprint
 * when staging/prod has not run the migration yet).
 */
export async function ensureStockHistoryCancelColumns(): Promise<void> {
  if (!ensureColumnsPromise) {
    ensureColumnsPromise = (async () => {
      const schema = dbSchema();
      const statements = [
        `ALTER TABLE "${schema}"."BranchMenuItemStockHistory" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."BranchMenuItemStockHistory" ADD COLUMN IF NOT EXISTS "cancelNote" TEXT`,
        `ALTER TABLE "${schema}"."BranchNonMenuItemHistory" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."BranchNonMenuItemHistory" ADD COLUMN IF NOT EXISTS "cancelNote" TEXT`,
      ];
      for (const sql of statements) {
        try {
          await prisma.$executeRawUnsafe(sql);
        } catch (e) {
          // Race: another process added the column — ignore duplicate
          const msg = e instanceof Error ? e.message : String(e);
          if (!/already exists|duplicate/i.test(msg)) {
            console.error("[stock-history-cancel] ensure columns failed", msg);
            throw e;
          }
        }
      }
    })().catch((e) => {
      ensureColumnsPromise = null;
      throw e;
    });
  }
  await ensureColumnsPromise;
}

async function applyMenuQtyDelta(
  tx: Prisma.TransactionClient,
  branchId: string,
  menuItemId: string,
  delta: number,
  allowNegative: boolean,
) {
  const stock = await tx.branchMenuItemStock.findUnique({
    where: { menuItemId },
  });
  const oldQty = stock?.quantity ?? 0;
  const newQty = oldQty + delta;
  if (newQty < 0 && !allowNegative) {
    const menu = await tx.branchMenuItem.findUnique({
      where: { id: menuItemId },
      select: { name: true },
    });
    throw new StockError(
      `สต๊อกไม่พอที่จะยกเลิกรับเข้า: ${menu?.name ?? "เมนู"} (เหลือ ${oldQty} ต้องการหัก ${Math.abs(delta)})`,
    );
  }
  await tx.branchMenuItemStock.upsert({
    where: { menuItemId },
    update: { quantity: newQty },
    create: { branchId, menuItemId, quantity: newQty },
  });
  await tx.branchMenuItem.update({
    where: { id: menuItemId },
    data: { isOutOfStock: newQty <= 0 },
  });
}

async function applyNonMenuQtyDelta(
  tx: Prisma.TransactionClient,
  itemId: string,
  delta: number,
  allowNegative: boolean,
) {
  const item = await tx.branchNonMenuItem.findUnique({
    where: { id: itemId },
    select: { id: true, name: true, quantity: true },
  });
  if (!item) throw new StockError("ไม่พบสินค้าสิ้นเปลือง", 404);
  const newQty = item.quantity + delta;
  if (newQty < 0 && !allowNegative) {
    throw new StockError(
      `สต๊อกไม่พอที่จะยกเลิกรับเข้า: ${item.name} (เหลือ ${item.quantity} ต้องการหัก ${Math.abs(delta)})`,
    );
  }
  await tx.branchNonMenuItem.update({
    where: { id: itemId },
    data: { quantity: newQty },
  });
}

function mapSqlError(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    /column .* does not exist|cancelledAt|cancelNote/i.test(msg) ||
    msg.includes("P2022")
  ) {
    throw new StockError(
      "โครงสร้างประวัติสต๊อกยังไม่อัปเดต (cancelledAt) — ลองใหม่อีกครั้งหรือรัน migrate",
      503,
    );
  }
  if (e instanceof StockError) throw e;
  console.error("[stock-history-cancel]", msg);
  throw new StockError(
    msg.length > 0 && msg.length < 160
      ? msg
      : "ยกเลิก/กู้คืนรายการสต๊อกไม่สำเร็จ กรุณาลองใหม่",
    400,
  );
}

export async function setStockHistoryLinesCancelled(input: {
  branchId: string;
  lines: StockHistoryLineRef[];
  cancelled: boolean;
  cancelNote?: string | null;
  allowNegativeStock?: boolean;
}): Promise<{ updated: number }> {
  const note = input.cancelNote?.trim() || null;
  const allowNeg = Boolean(input.allowNegativeStock);
  const at = new Date();
  const menuTable = qTable("BranchMenuItemStockHistory");
  const nonMenuTable = qTable("BranchNonMenuItemHistory");
  const nonMenuItemTable = qTable("BranchNonMenuItem");

  if (input.lines.length === 0) {
    throw new StockError("ไม่พบรายการที่จะดำเนินการ", 400);
  }

  try {
    await ensureStockHistoryCancelColumns();
  } catch (e) {
    mapSqlError(e);
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        let updated = 0;

        for (const line of input.lines) {
          if (line.source === "menu") {
            const rows = await tx.$queryRawUnsafe<
              Array<{
                id: string;
                branchId: string;
                menuItemId: string;
                quantity: number;
                type: string;
                cancelledAt: Date | null;
              }>
            >(
              `SELECT id, "branchId", "menuItemId", quantity, type, "cancelledAt"
               FROM ${menuTable}
               WHERE id = $1 AND "branchId" = $2
               LIMIT 1`,
              line.id,
              input.branchId,
            );
            const row = rows[0];
            if (!row) {
              throw new StockError(`ไม่พบรายการประวัติ (เมนู)`, 404);
            }
            if (!CANCELLABLE_TYPES.has(row.type)) {
              throw new StockError(
                `ยกเลิกได้เฉพาะรับเข้า/จ่ายออก (ประเภท: ${row.type})`,
                400,
              );
            }
            if (input.cancelled) {
              if (row.cancelledAt) continue;
              await applyMenuQtyDelta(
                tx,
                row.branchId,
                row.menuItemId,
                -Number(row.quantity),
                allowNeg,
              );
              await tx.$executeRawUnsafe(
                `UPDATE ${menuTable}
                 SET "cancelledAt" = $1, "cancelNote" = $2
                 WHERE id = $3`,
                at,
                note,
                row.id,
              );
              updated += 1;
            } else {
              if (!row.cancelledAt) continue;
              await applyMenuQtyDelta(
                tx,
                row.branchId,
                row.menuItemId,
                Number(row.quantity),
                allowNeg,
              );
              await tx.$executeRawUnsafe(
                `UPDATE ${menuTable}
                 SET "cancelledAt" = NULL, "cancelNote" = NULL
                 WHERE id = $1`,
                row.id,
              );
              updated += 1;
            }
          } else {
            const rows = await tx.$queryRawUnsafe<
              Array<{
                id: string;
                branchNonMenuItemId: string;
                quantity: number;
                type: string;
                cancelledAt: Date | null;
              }>
            >(
              `SELECT h.id, h."branchNonMenuItemId", h.quantity, h.type, h."cancelledAt"
               FROM ${nonMenuTable} h
               INNER JOIN ${nonMenuItemTable} i ON i.id = h."branchNonMenuItemId"
               WHERE h.id = $1 AND i."branchId" = $2
               LIMIT 1`,
              line.id,
              input.branchId,
            );
            const row = rows[0];
            if (!row) {
              throw new StockError(`ไม่พบรายการประวัติ (ของสิ้นเปลือง)`, 404);
            }
            if (!CANCELLABLE_TYPES.has(row.type)) {
              throw new StockError(
                `ยกเลิกได้เฉพาะรับเข้า/จ่ายออก (ประเภท: ${row.type})`,
                400,
              );
            }
            if (input.cancelled) {
              if (row.cancelledAt) continue;
              await applyNonMenuQtyDelta(
                tx,
                row.branchNonMenuItemId,
                -Number(row.quantity),
                allowNeg,
              );
              await tx.$executeRawUnsafe(
                `UPDATE ${nonMenuTable}
                 SET "cancelledAt" = $1, "cancelNote" = $2
                 WHERE id = $3`,
                at,
                note,
                row.id,
              );
              updated += 1;
            } else {
              if (!row.cancelledAt) continue;
              await applyNonMenuQtyDelta(
                tx,
                row.branchNonMenuItemId,
                Number(row.quantity),
                allowNeg,
              );
              await tx.$executeRawUnsafe(
                `UPDATE ${nonMenuTable}
                 SET "cancelledAt" = NULL, "cancelNote" = NULL
                 WHERE id = $1`,
                row.id,
              );
              updated += 1;
            }
          }
        }

        if (updated === 0) {
          throw new StockError(
            input.cancelled
              ? "รายการนี้ถูกยกเลิกอยู่แล้ว หรือไม่มีรายการที่ยังยกเลิกได้"
              : "รายการนี้ไม่ได้ถูกยกเลิก",
            409,
          );
        }

        return { updated };
      },
      { maxWait: 15_000, timeout: 120_000 },
    );
  } catch (e) {
    if (e instanceof StockError) throw e;
    mapSqlError(e);
  }
}
