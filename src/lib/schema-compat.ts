import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureStockHistoryCancelColumns } from "@/lib/stock-history-cancel";

function dbSchema() {
  return (process.env.DATABASE_SCHEMA ?? "public").replace(/"/g, "");
}

let ensurePromise: Promise<void> | null = null;

/**
 * Lightweight idempotent schema patches for production when migrate deploy lag.
 * Safe to call on hot paths (caches after first success).
 */
export async function ensureProdSchemaCompat(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const schema = dbSchema();
      const statements = [
        `ALTER TABLE "${schema}"."Branch" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."BranchShift" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."BranchShift" ADD COLUMN IF NOT EXISTS "cancelNote" TEXT`,
        `ALTER TABLE "${schema}"."Order" ADD COLUMN IF NOT EXISTS "paymentSlipUrl" TEXT`,
        `ALTER TABLE "${schema}"."Order" ADD COLUMN IF NOT EXISTS "publicShareToken" TEXT`,
      ];
      for (const sql of statements) {
        try {
          await prisma.$executeRawUnsafe(sql);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/already exists|duplicate/i.test(msg)) {
            console.error("[schema-compat] ensure failed", msg);
          }
        }
      }
      try {
        await prisma.$executeRawUnsafe(
          `CREATE UNIQUE INDEX IF NOT EXISTS "Order_publicShareToken_key" ON "${schema}"."Order"("publicShareToken")`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/already exists|duplicate/i.test(msg)) {
          console.error("[schema-compat] publicShareToken index", msg);
        }
      }
      try {
        await ensureStockHistoryCancelColumns();
      } catch (e) {
        console.error(
          "[schema-compat] stock history cancel columns",
          e instanceof Error ? e.message : e,
        );
      }
    })().catch((e) => {
      ensurePromise = null;
      throw e;
    });
  }
  try {
    await ensurePromise;
  } catch {
    /* non-fatal — callers must still use narrow selects */
  }
}

/** Prefer this in staff routes instead of full `branch.findUnique()`. */
export const staffBranchCoreSelect = {
  id: true,
  brandId: true,
  name: true,
  stockEnabled: true,
  isOpen: true,
  autoAcceptOrders: true,
  address: true,
  latitude: true,
  longitude: true,
} satisfies Prisma.BranchSelect;
