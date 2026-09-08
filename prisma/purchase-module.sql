SET search_path TO order_app;

CREATE TABLE IF NOT EXISTS "BranchPurchaseOrder" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "documentDate" DATE NOT NULL,
  "documentNo" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'CASH',
  "channelNote" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "imageUrls" TEXT,
  "note" TEXT,
  "stockBatchId" TEXT,
  "createdByStaffId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BranchPurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BranchPurchaseOrder_documentNo_key" ON "BranchPurchaseOrder"("documentNo");
CREATE INDEX IF NOT EXISTS "BranchPurchaseOrder_branchId_documentDate_idx" ON "BranchPurchaseOrder"("branchId", "documentDate");
CREATE INDEX IF NOT EXISTS "BranchPurchaseOrder_branchId_status_idx" ON "BranchPurchaseOrder"("branchId", "status");
CREATE INDEX IF NOT EXISTS "BranchPurchaseOrder_createdByStaffId_idx" ON "BranchPurchaseOrder"("createdByStaffId");

CREATE TABLE IF NOT EXISTS "BranchPurchaseOrderLine" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "branchNonMenuItemId" TEXT,
  "itemName" TEXT NOT NULL,
  "itemCode" TEXT,
  "unit" TEXT NOT NULL,
  "unitPrice" DECIMAL(12,2),
  "systemUnitPrice" DECIMAL(12,2),
  "quantity" INTEGER NOT NULL,
  "stockType" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BranchPurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BranchPurchaseOrderLine_purchaseOrderId_idx" ON "BranchPurchaseOrderLine"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "BranchPurchaseOrderLine_branchNonMenuItemId_idx" ON "BranchPurchaseOrderLine"("branchNonMenuItemId");

DO $$ BEGIN
  ALTER TABLE "BranchPurchaseOrder" ADD CONSTRAINT "BranchPurchaseOrder_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BranchPurchaseOrder" ADD CONSTRAINT "BranchPurchaseOrder_createdByStaffId_fkey"
    FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BranchPurchaseOrderLine" ADD CONSTRAINT "BranchPurchaseOrderLine_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "BranchPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BranchPurchaseOrderLine" ADD CONSTRAINT "BranchPurchaseOrderLine_branchNonMenuItemId_fkey"
    FOREIGN KEY ("branchNonMenuItemId") REFERENCES "BranchNonMenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "BranchNonMenuItem_branchId_stockType_idx" ON "BranchNonMenuItem"("branchId", "stockType");
