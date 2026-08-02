-- AlterTable
ALTER TABLE "BranchMenuItemStockHistory" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

-- AlterTable
ALTER TABLE "BranchNonMenuItemHistory" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchMenuItemStockHistory_batchId_idx" ON "BranchMenuItemStockHistory"("batchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchMenuItemStockHistory_branchId_type_createdAt_idx" ON "BranchMenuItemStockHistory"("branchId", "type", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchNonMenuItemHistory_batchId_idx" ON "BranchNonMenuItemHistory"("batchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchNonMenuItemHistory_type_createdAt_idx" ON "BranchNonMenuItemHistory"("type", "createdAt");
