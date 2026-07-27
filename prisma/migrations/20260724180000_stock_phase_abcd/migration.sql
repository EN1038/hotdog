-- Enums
CREATE TYPE "StockType" AS ENUM ('SALE_ITEM', 'CONSUMABLE', 'EQUIPMENT');
CREATE TYPE "EquipmentStatus" AS ENUM ('ACTIVE', 'DAMAGED', 'LOST', 'RETIRED');
CREATE TYPE "StockCountType" AS ENUM ('WEEKLY', 'MONTHLY', 'CUSTOM');
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

DO $$ BEGIN ALTER TYPE "StockMovementType" ADD VALUE 'STOCK_IN'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "StockMovementType" ADD VALUE 'FREE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "StockMovementType" ADD VALUE 'DAMAGE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "StockMovementType" ADD VALUE 'LOST'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "StockMovementType" ADD VALUE 'COUNT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "StockMovementType" ADD VALUE 'ISSUE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BrandProduct" ADD COLUMN IF NOT EXISTS "stockType" "StockType" NOT NULL DEFAULT 'SALE_ITEM';
ALTER TABLE "BrandProduct" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "BrandProduct" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(10,2);
ALTER TABLE "BrandProduct" ADD COLUMN IF NOT EXISTS "sellingPrice" DECIMAL(10,2);
ALTER TABLE "BrandProduct" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BrandProduct" ADD COLUMN IF NOT EXISTS "equipmentStatus" "EquipmentStatus";

CREATE INDEX IF NOT EXISTS "BrandProduct_brandId_stockType_idx" ON "BrandProduct"("brandId", "stockType");
CREATE INDEX IF NOT EXISTS "BrandProduct_brandId_isActive_idx" ON "BrandProduct"("brandId", "isActive");

ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "beforeQty" INTEGER;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "afterQty" INTEGER;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(10,2);
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(10,2);
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "supplier" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "stockLocationId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "referenceType" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "referenceId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "createdByStaffId" TEXT;

CREATE INDEX IF NOT EXISTS "StockMovement_stockLocationId_createdAt_idx" ON "StockMovement"("stockLocationId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_type_createdAt_idx" ON "StockMovement"("type", "createdAt");

DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockLocationId_fkey"
    FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdByStaffId_fkey"
    FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockCount" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "branchId" TEXT,
    "stockLocationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StockCountType" NOT NULL DEFAULT 'CUSTOM',
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "note" TEXT,
    "createdByAdminId" TEXT,
    "createdByStaffId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "brandProductId" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER,
    "note" TEXT,
    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockCount_brandId_status_createdAt_idx" ON "StockCount"("brandId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "StockCount_branchId_status_idx" ON "StockCount"("branchId", "status");
CREATE INDEX IF NOT EXISTS "StockCount_stockLocationId_idx" ON "StockCount"("stockLocationId");
CREATE UNIQUE INDEX IF NOT EXISTS "StockCountLine_countId_brandProductId_key" ON "StockCountLine"("countId", "brandProductId");
CREATE INDEX IF NOT EXISTS "StockCountLine_brandProductId_idx" ON "StockCountLine"("brandProductId");

DO $$ BEGIN
  ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_brandProductId_fkey" FOREIGN KEY ("brandProductId") REFERENCES "BrandProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
