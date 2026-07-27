DO $$ BEGIN CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StockTransferKind" AS ENUM ('WAREHOUSE_TO_BRANCH', 'BRANCH_TO_BRANCH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "BrandProduct" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "BrandProduct" ADD COLUMN IF NOT EXISTS "trackLots" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "BrandProduct_brandId_barcode_idx" ON "BrandProduct"("brandId", "barcode");

ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "lotId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "lotNumber" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "StockMovement_lotId_idx" ON "StockMovement"("lotId");

ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "kind" "StockTransferKind" NOT NULL DEFAULT 'WAREHOUSE_TO_BRANCH';
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "sourceBranchId" TEXT;
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "lotNumber" TEXT;
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "StockTransfer_sourceBranchId_status_idx" ON "StockTransfer"("sourceBranchId", "status");

-- Recreate StockTransfer branch FK as named destination relation (keep column)
DO $$ BEGIN
  ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_branchId_fkey";
  ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockLot" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "brandProductId" TEXT NOT NULL,
  "stockLocationId" TEXT NOT NULL,
  "lotNumber" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(10,2),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockLot_stockLocationId_brandProductId_lotNumber_key" ON "StockLot"("stockLocationId", "brandProductId", "lotNumber");
CREATE INDEX IF NOT EXISTS "StockLot_brandId_expiresAt_idx" ON "StockLot"("brandId", "expiresAt");
CREATE INDEX IF NOT EXISTS "StockLot_brandProductId_expiresAt_idx" ON "StockLot"("brandProductId", "expiresAt");

DO $$ BEGIN ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_brandProductId_fkey" FOREIGN KEY ("brandProductId") REFERENCES "BrandProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Supplier" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "note" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_brandId_name_key" ON "Supplier"("brandId", "name");
CREATE INDEX IF NOT EXISTS "Supplier_brandId_isActive_idx" ON "Supplier"("brandId", "isActive");
DO $$ BEGIN ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "stockLocationId" TEXT,
  "orderNumber" TEXT NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "expectedAt" TIMESTAMP(3),
  "note" TEXT,
  "orderedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_brandId_orderNumber_key" ON "PurchaseOrder"("brandId", "orderNumber");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_brandId_status_createdAt_idx" ON "PurchaseOrder"("brandId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

DO $$ BEGIN ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PurchaseOrderLine" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "brandProductId" TEXT NOT NULL,
  "quantityOrdered" INTEGER NOT NULL,
  "quantityReceived" INTEGER NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(10,2),
  "note" TEXT,
  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrderLine_purchaseOrderId_brandProductId_key" ON "PurchaseOrderLine"("purchaseOrderId", "brandProductId");
CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_brandProductId_idx" ON "PurchaseOrderLine"("brandProductId");
DO $$ BEGIN ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_brandProductId_fkey" FOREIGN KEY ("brandProductId") REFERENCES "BrandProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProductRecipeLine" (
  "id" TEXT NOT NULL,
  "parentProductId" TEXT NOT NULL,
  "componentProductId" TEXT NOT NULL,
  "quantityPerUnit" DECIMAL(12,4) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductRecipeLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductRecipeLine_parentProductId_componentProductId_key" ON "ProductRecipeLine"("parentProductId", "componentProductId");
CREATE INDEX IF NOT EXISTS "ProductRecipeLine_componentProductId_idx" ON "ProductRecipeLine"("componentProductId");
DO $$ BEGIN ALTER TABLE "ProductRecipeLine" ADD CONSTRAINT "ProductRecipeLine_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "BrandProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ProductRecipeLine" ADD CONSTRAINT "ProductRecipeLine_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "BrandProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
