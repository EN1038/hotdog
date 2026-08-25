-- Fresh stock aging: receive/expiry on history + default shelf life on menu
ALTER TABLE "BranchMenuItemStockHistory" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
ALTER TABLE "BranchMenuItemStockHistory" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "BranchMenuItem" ADD COLUMN IF NOT EXISTS "defaultShelfLifeDays" INTEGER;

CREATE INDEX IF NOT EXISTS "BranchMenuItemStockHistory_expiresAt_idx"
  ON "BranchMenuItemStockHistory"("expiresAt");
