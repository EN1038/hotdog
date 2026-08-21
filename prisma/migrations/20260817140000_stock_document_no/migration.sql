-- User-facing stock document numbers (shared across lines in one bill).
ALTER TABLE "StockMovement"
  ADD COLUMN IF NOT EXISTS "documentNo" TEXT;

ALTER TABLE "BranchMenuItemStockHistory"
  ADD COLUMN IF NOT EXISTS "documentNo" TEXT;

ALTER TABLE "BranchNonMenuItemHistory"
  ADD COLUMN IF NOT EXISTS "documentNo" TEXT;

CREATE INDEX IF NOT EXISTS "StockMovement_documentNo_idx"
  ON "StockMovement"("documentNo")
  WHERE "documentNo" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "BranchMenuItemStockHistory_documentNo_idx"
  ON "BranchMenuItemStockHistory"("documentNo")
  WHERE "documentNo" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "BranchNonMenuItemHistory_documentNo_idx"
  ON "BranchNonMenuItemHistory"("documentNo")
  WHERE "documentNo" IS NOT NULL;
