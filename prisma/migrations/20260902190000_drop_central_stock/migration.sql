-- Drop legacy central-stock tables; migrate branch stock summaries to BranchStockSummary.

-- Fold warehouse branches into hidden store branches
UPDATE "Branch"
SET kind = 'STORE', "isHidden" = true
WHERE kind = 'WAREHOUSE';

ALTER TABLE "Branch" DROP COLUMN IF EXISTS "warehouseIssueMode";
ALTER TABLE "Branch" DROP COLUMN IF EXISTS "warehouseAllowedBranchIds";

-- Detach menu / labels from brand SKUs
ALTER TABLE "BranchMenuItem" DROP CONSTRAINT IF EXISTS "BranchMenuItem_brandProductId_fkey";
DROP INDEX IF EXISTS "BranchMenuItem_brandProductId_idx";
ALTER TABLE "BranchMenuItem" DROP COLUMN IF EXISTS "brandProductId";

ALTER TABLE "StockLabel" DROP COLUMN IF EXISTS "brandProductId";

CREATE TABLE "BranchStockSummary" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "shiftId" TEXT,
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

    CONSTRAINT "BranchStockSummary_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BranchStockSummary" (
    "id",
    "brandId",
    "branchId",
    "shiftId",
    "name",
    "type",
    "status",
    "startsAt",
    "endsAt",
    "note",
    "createdByAdminId",
    "createdByStaffId",
    "completedAt",
    "createdAt"
)
SELECT
    sc."id",
    sc."brandId",
    sc."branchId",
    sc."shiftId",
    sc."name",
    sc."type",
    sc."status",
    sc."startsAt",
    sc."endsAt",
    sc."note",
    sc."createdByAdminId",
    sc."createdByStaffId",
    sc."completedAt",
    sc."createdAt"
FROM "StockCount" sc
WHERE sc."branchId" IS NOT NULL;

CREATE INDEX "BranchStockSummary_brandId_status_createdAt_idx"
    ON "BranchStockSummary"("brandId", "status", "createdAt");
CREATE INDEX "BranchStockSummary_branchId_status_idx"
    ON "BranchStockSummary"("branchId", "status");
CREATE INDEX "BranchStockSummary_shiftId_idx"
    ON "BranchStockSummary"("shiftId");

ALTER TABLE "BranchStockSummary"
    ADD CONSTRAINT "BranchStockSummary_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchStockSummary"
    ADD CONSTRAINT "BranchStockSummary_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchStockSummary"
    ADD CONSTRAINT "BranchStockSummary_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "BranchShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchStockSummary"
    ADD CONSTRAINT "BranchStockSummary_createdByAdminId_fkey"
    FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchStockSummary"
    ADD CONSTRAINT "BranchStockSummary_createdByStaffId_fkey"
    FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop central-stock tables (child → parent order)
DROP TABLE IF EXISTS "KitchenProductionComponent";
DROP TABLE IF EXISTS "KitchenProduction";
DROP TABLE IF EXISTS "ProductRecipeLine";
DROP TABLE IF EXISTS "PurchaseOrderLine";
DROP TABLE IF EXISTS "PurchaseOrder";
DROP TABLE IF EXISTS "StockCountLine";
DROP TABLE IF EXISTS "StockCount";
DROP TABLE IF EXISTS "BranchStockRequest";
DROP TABLE IF EXISTS "StockTransfer";
DROP TABLE IF EXISTS "StockMovement";
DROP TABLE IF EXISTS "StockLot";
DROP TABLE IF EXISTS "StockBalance";
DROP TABLE IF EXISTS "BrandProduct";
DROP TABLE IF EXISTS "StockLocation";
DROP TABLE IF EXISTS "Supplier";

-- Legacy enums (no longer referenced by columns)
DROP TYPE IF EXISTS "WarehouseIssueMode";
DROP TYPE IF EXISTS "StockLocationType";
DROP TYPE IF EXISTS "StockType";
DROP TYPE IF EXISTS "StockMovementType";
DROP TYPE IF EXISTS "StockTransferStatus";
DROP TYPE IF EXISTS "EquipmentStatus";
DROP TYPE IF EXISTS "PurchaseOrderStatus";
DROP TYPE IF EXISTS "StockTransferKind";
DROP TYPE IF EXISTS "KitchenProductionStatus";
DROP TYPE IF EXISTS "BranchStockRequestStatus";
