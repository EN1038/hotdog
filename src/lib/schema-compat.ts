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
        `ALTER TABLE "${schema}"."Branch" ADD COLUMN IF NOT EXISTS "kind" "BranchKind" NOT NULL DEFAULT 'STORE'`,
        `ALTER TABLE "${schema}"."Branch" ADD COLUMN IF NOT EXISTS "warehouseIssueMode" "WarehouseIssueMode" NOT NULL DEFAULT 'TRANSFER'`,
        `ALTER TABLE "${schema}"."Branch" ADD COLUMN IF NOT EXISTS "warehouseAllowedBranchIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "stockAgingWarnDays" INTEGER NOT NULL DEFAULT 3`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "stockAgingCriticalDays" INTEGER NOT NULL DEFAULT 5`,
        `UPDATE "${schema}"."Brand" SET "stockAgingWarnDays" = 3 WHERE "stockAgingWarnDays" IS NULL OR "stockAgingWarnDays" < 1`,
        `UPDATE "${schema}"."Brand" SET "stockAgingCriticalDays" = 5 WHERE "stockAgingCriticalDays" IS NULL OR "stockAgingCriticalDays" < 1`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellPiece" BOOLEAN NOT NULL DEFAULT true`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellSkewer" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellGrill" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellFry" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "sellShabu" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "defaultShelfLifeDays" INTEGER`,
        `ALTER TABLE "${schema}"."BranchMenuItem" ADD COLUMN IF NOT EXISTS "itemCode" TEXT`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "BranchMenuItem_branchId_itemCode_key" ON "${schema}"."BranchMenuItem"("branchId", "itemCode")`,
        `ALTER TABLE "${schema}"."BranchNonMenuItem" ADD COLUMN IF NOT EXISTS "itemCode" TEXT`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "BranchNonMenuItem_branchId_itemCode_key" ON "${schema}"."BranchNonMenuItem"("branchId", "itemCode")`,
        `ALTER TABLE "${schema}"."BrandProduct" ADD COLUMN IF NOT EXISTS "defaultShelfLifeDays" INTEGER DEFAULT 5`,
        `UPDATE "${schema}"."BrandProduct" SET "defaultShelfLifeDays" = 5 WHERE "defaultShelfLifeDays" IS NULL`,
        `ALTER TABLE "${schema}"."BranchMenuItemStockHistory" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."BranchMenuItemStockHistory" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."StockMovement" ADD COLUMN IF NOT EXISTS "documentNo" TEXT`,
        `ALTER TABLE "${schema}"."BranchMenuItemStockHistory" ADD COLUMN IF NOT EXISTS "documentNo" TEXT`,
        `ALTER TABLE "${schema}"."BranchNonMenuItemHistory" ADD COLUMN IF NOT EXISTS "documentNo" TEXT`,
        `CREATE INDEX IF NOT EXISTS "StockMovement_documentNo_idx" ON "${schema}"."StockMovement"("documentNo") WHERE "documentNo" IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS "BranchMenuItemStockHistory_documentNo_idx" ON "${schema}"."BranchMenuItemStockHistory"("documentNo") WHERE "documentNo" IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS "BranchNonMenuItemHistory_documentNo_idx" ON "${schema}"."BranchNonMenuItemHistory"("documentNo") WHERE "documentNo" IS NOT NULL`,
        // Legacy inbound: treat recorded day as receive day (same as วันรับเข้า)
        `UPDATE "${schema}"."BranchMenuItemStockHistory" SET "receivedAt" = "createdAt" WHERE "receivedAt" IS NULL AND "type" IN ('STOCK_IN','RESTOCK') AND "quantity" > 0`,
        `ALTER TABLE "${schema}"."BranchOptionGroup" ADD COLUMN IF NOT EXISTS "visibleWhenOptionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
        `ALTER TABLE "${schema}"."BranchShift" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."BranchShift" ADD COLUMN IF NOT EXISTS "cancelNote" TEXT`,
        `ALTER TABLE "${schema}"."BranchShift" ADD COLUMN IF NOT EXISTS "closingCash" DECIMAL(10,2)`,
        `ALTER TABLE "${schema}"."Order" ADD COLUMN IF NOT EXISTS "paymentSlipUrl" TEXT`,
        `ALTER TABLE "${schema}"."Order" ADD COLUMN IF NOT EXISTS "publicShareToken" TEXT`,
        `ALTER TABLE "${schema}"."SkewerOrder" ADD COLUMN IF NOT EXISTS "publicShareToken" TEXT`,
        `ALTER TABLE "${schema}"."SkewerOrder" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."SkewerOrder" ADD COLUMN IF NOT EXISTS "deliveredOn" DATE`,
        `ALTER TABLE "${schema}"."SkewerOrder" ADD COLUMN IF NOT EXISTS "deliveryInfo" TEXT`,
        `ALTER TABLE "${schema}"."SkewerOrder" ADD COLUMN IF NOT EXISTS "shippingCostBaht" DECIMAL(10,2)`,
        `ALTER TABLE "${schema}"."SkewerOrderItem" ADD COLUMN IF NOT EXISTS "unitPriceBaht" DECIMAL(10,2)`,
        `DROP INDEX IF EXISTS "${schema}"."Staff_phone_key"`,
        `DROP INDEX IF EXISTS "Staff_phone_key"`,
        `DROP INDEX IF EXISTS "${schema}"."Staff_lineUserId_key"`,
        `DROP INDEX IF EXISTS "Staff_lineUserId_key"`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "Staff_branchId_phone_key" ON "${schema}"."Staff"("branchId", "phone")`,
        `CREATE INDEX IF NOT EXISTS "Staff_phone_idx" ON "${schema}"."Staff"("phone")`,
        `CREATE INDEX IF NOT EXISTS "Staff_lineUserId_idx" ON "${schema}"."Staff"("lineUserId")`,
        `ALTER TABLE "${schema}"."Staff" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."CustomerOtpChallenge" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'customer'`,
        `CREATE INDEX IF NOT EXISTS "CustomerOtpChallenge_phone_purpose_createdAt_idx" ON "${schema}"."CustomerOtpChallenge"("phone", "purpose", "createdAt")`,
        `CREATE TABLE IF NOT EXISTS "${schema}"."StaffAuthSession" ("id" TEXT NOT NULL, "phone" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "tokenJti" TEXT NOT NULL, "userAgent" TEXT, "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3), CONSTRAINT "StaffAuthSession_pkey" PRIMARY KEY ("id"))`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "StaffAuthSession_tokenJti_key" ON "${schema}"."StaffAuthSession"("tokenJti")`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "StaffAuthSession_phone_deviceId_key" ON "${schema}"."StaffAuthSession"("phone", "deviceId")`,
        `CREATE INDEX IF NOT EXISTS "StaffAuthSession_phone_idx" ON "${schema}"."StaffAuthSession"("phone")`,
        `CREATE INDEX IF NOT EXISTS "StaffAuthSession_expiresAt_idx" ON "${schema}"."StaffAuthSession"("expiresAt")`,
        `CREATE TABLE IF NOT EXISTS "${schema}"."BranchTomorrowPlanLine" ("id" TEXT NOT NULL, "branchId" TEXT NOT NULL, "menuItemId" TEXT NOT NULL, "planDate" TEXT NOT NULL, "confirmedQty" INTEGER NOT NULL, "suggestedQty" INTEGER NOT NULL, "parStock" INTEGER NOT NULL DEFAULT 0, "availableStock" INTEGER NOT NULL DEFAULT 0, "confirmedAt" TIMESTAMP(3) NOT NULL, "confirmedByAdminId" TEXT, CONSTRAINT "BranchTomorrowPlanLine_pkey" PRIMARY KEY ("id"))`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "BranchTomorrowPlanLine_branchId_menuItemId_planDate_key" ON "${schema}"."BranchTomorrowPlanLine"("branchId", "menuItemId", "planDate")`,
        `CREATE INDEX IF NOT EXISTS "BranchTomorrowPlanLine_branchId_planDate_idx" ON "${schema}"."BranchTomorrowPlanLine"("branchId", "planDate")`,
        `CREATE INDEX IF NOT EXISTS "BranchTomorrowPlanLine_menuItemId_idx" ON "${schema}"."BranchTomorrowPlanLine"("menuItemId")`,
        `DO $$ BEGIN CREATE TYPE "BranchTomorrowPlanStatus" AS ENUM ('CONFIRMED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `CREATE TABLE IF NOT EXISTS "${schema}"."BranchTomorrowPlan" ("id" TEXT NOT NULL, "branchId" TEXT NOT NULL, "planDate" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'CONFIRMED', "note" TEXT, "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "confirmedByAdminId" TEXT, CONSTRAINT "BranchTomorrowPlan_pkey" PRIMARY KEY ("id"))`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "BranchTomorrowPlan_branchId_planDate_key" ON "${schema}"."BranchTomorrowPlan"("branchId", "planDate")`,
        `ALTER TABLE "${schema}"."BranchTomorrowPlanLine" ADD COLUMN IF NOT EXISTS "planId" TEXT`,
        `CREATE INDEX IF NOT EXISTS "BranchTomorrowPlanLine_planId_idx" ON "${schema}"."BranchTomorrowPlanLine"("planId")`,
      ];
      const enumSql = [
        `DO $$ BEGIN CREATE TYPE "BrandStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED', 'EXPIRED', 'DELETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "BrandPlan" AS ENUM ('RETAIL', 'WEIGH_TABLE', 'MALA', 'MULTI'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "${schema}"."BrandStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED', 'EXPIRED', 'DELETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "BranchKind" AS ENUM ('STORE', 'WAREHOUSE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "WarehouseIssueMode" AS ENUM ('TRANSFER', 'ISSUE', 'BOTH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "${schema}"."BranchKind" AS ENUM ('STORE', 'WAREHOUSE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "${schema}"."WarehouseIssueMode" AS ENUM ('TRANSFER', 'ISSUE', 'BOTH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "BrandInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "${schema}"."BrandInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN ALTER TYPE "BrandStatus" ADD VALUE IF NOT EXISTS 'DELETED'; EXCEPTION WHEN others THEN NULL; END $$`,
        `DO $$ BEGIN ALTER TYPE "${schema}"."BrandStatus" ADD VALUE IF NOT EXISTS 'DELETED'; EXCEPTION WHEN others THEN NULL; END $$`,
        `DO $$ BEGIN ALTER TYPE "SkewerOrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED'; EXCEPTION WHEN others THEN NULL; END $$`,
        `DO $$ BEGIN ALTER TYPE "${schema}"."SkewerOrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED'; EXCEPTION WHEN others THEN NULL; END $$`,
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
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "primaryAdminId" TEXT`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "billingNote" TEXT`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "lastPaidAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "nextDueAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."Brand" ADD COLUMN IF NOT EXISTS "serviceStartsAt" TIMESTAMP(3)`,
        `ALTER TABLE "${schema}"."Admin" ADD COLUMN IF NOT EXISTS "phone" TEXT`,
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
          `CREATE UNIQUE INDEX IF NOT EXISTS "Admin_phone_key" ON "${schema}"."Admin"("phone")`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/already exists|duplicate/i.test(msg)) {
          console.error("[schema-compat] Admin_phone_key", msg);
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
      try {
        await prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS "Brand_primaryAdminId_idx" ON "${schema}"."Brand"("primaryAdminId")`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/already exists|duplicate/i.test(msg)) {
          console.error("[schema-compat] Brand_primaryAdminId_idx", msg);
        }
      }
      const invoiceTableSql = [
        `CREATE TABLE IF NOT EXISTS "${schema}"."BrandInvoice" ("id" TEXT NOT NULL, "brandId" TEXT NOT NULL, "number" TEXT NOT NULL, "title" TEXT NOT NULL, "amountBaht" DECIMAL(10,2) NOT NULL, "status" "BrandInvoiceStatus" NOT NULL DEFAULT 'DRAFT', "periodLabel" TEXT, "issuedAt" TIMESTAMP(3), "paidAt" TIMESTAMP(3), "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByAdminId" TEXT, CONSTRAINT "BrandInvoice_pkey" PRIMARY KEY ("id"))`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "BrandInvoice_brandId_number_key" ON "${schema}"."BrandInvoice"("brandId", "number")`,
        `CREATE INDEX IF NOT EXISTS "BrandInvoice_brandId_createdAt_idx" ON "${schema}"."BrandInvoice"("brandId", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "BrandInvoice_brandId_status_idx" ON "${schema}"."BrandInvoice"("brandId", "status")`,
      ];
      for (const sql of invoiceTableSql) {
        try {
          await prisma.$executeRawUnsafe(sql);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/already exists|duplicate/i.test(msg)) {
            console.error("[schema-compat] BrandInvoice", msg);
          }
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
        await prisma.$executeRawUnsafe(
          `CREATE UNIQUE INDEX IF NOT EXISTS "SkewerOrder_publicShareToken_key" ON "${schema}"."SkewerOrder"("publicShareToken")`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/already exists|duplicate/i.test(msg)) {
          console.error("[schema-compat] SkewerOrder publicShareToken index", msg);
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
