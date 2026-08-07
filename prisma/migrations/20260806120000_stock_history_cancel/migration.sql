-- Cancel / restore status for branch stock history lines (รับเข้า · จ่ายออก batches).

ALTER TABLE "BranchMenuItemStockHistory"
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelNote" TEXT;

ALTER TABLE "BranchNonMenuItemHistory"
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelNote" TEXT;
