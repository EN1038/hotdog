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
        `ALTER TABLE "${schema}"."Branch" ADD COLUMN IF NOT EXISTS "weighSalesEnabled" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellPiece" BOOLEAN NOT NULL DEFAULT true`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellSkewer" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellGrill" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellFry" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellShabu" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."BranchOptionGroup" ADD COLUMN IF NOT EXISTS "visibleWhenOptionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
        `ALTER TABLE "${schema}"."BranchShift" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."BranchShift" ADD COLUMN IF NOT EXISTS "cancelNote" TEXT`,
        `ALTER TABLE "${schema}"."Order" ADD COLUMN IF NOT EXISTS "paymentSlipUrl" TEXT`,
        `ALTER TABLE "${schema}"."Order" ADD COLUMN IF NOT EXISTS "publicShareToken" TEXT`,
        `DROP INDEX IF EXISTS "${schema}"."Staff_phone_key"`,
        `DROP INDEX IF EXISTS "Staff_phone_key"`,
        `DROP INDEX IF EXISTS "${schema}"."Staff_lineUserId_key"`,
        `DROP INDEX IF EXISTS "Staff_lineUserId_key"`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "Staff_branchId_phone_key" ON "${schema}"."Staff"("branchId", "phone")`,
        `CREATE INDEX IF NOT EXISTS "Staff_phone_idx" ON "${schema}"."Staff"("phone")`,
        `CREATE INDEX IF NOT EXISTS "Staff_lineUserId_idx" ON "${schema}"."Staff"("lineUserId")`,
      ];
      const enumSql = [
        `DO $$ BEGIN CREATE TYPE "BrandStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "BrandPlan" AS ENUM ('RETAIL', 'WEIGH_TABLE', 'MALA', 'MULTI'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "${schema}"."BrandStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "${schema}"."BrandPlan" AS ENUM ('RETAIL', 'WEIGH_TABLE', 'MALA', 'MULTI'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      ];
      for (const sql of enumSql) {
        try {
          await prisma.$executeRawUnsafe(sql);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/already exists|duplicate/i.test(msg)) {
            console.error("[schema-compat] enum", msg);
          }
        }
      }
      const brandPlanCols = [
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "status" "BrandStatus" NOT NULL DEFAULT 'ACTIVE'`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "plan" "BrandPlan" NOT NULL DEFAULT 'RETAIL'`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "maxBranches" INTEGER NOT NULL DEFAULT 10`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "maxStaff" INTEGER NOT NULL DEFAULT 50`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "kitchenEnabled" BOOLEAN NOT NULL DEFAULT true`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "bbqEnabled" BOOLEAN NOT NULL DEFAULT true`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "skewerEnabled" BOOLEAN NOT NULL DEFAULT true`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3)`,
      ];
      for (const sql of brandPlanCols) {
        try {
          await prisma.$executeRawUnsafe(sql);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/already exists|duplicate/i.test(msg)) {
            console.error("[schema-compat] brand plan col", msg);
          }
        }
      }
      try {
        await prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS "Brand_status_idx" ON "${schema}"."Brand"("status")`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/already exists|duplicate/i.test(msg)) {
          console.error("[schema-compat] Brand_status_idx", msg);
        }
      }
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
