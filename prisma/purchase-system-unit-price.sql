SET search_path TO order_app;

-- Reference price from master at save time (for historical compare)
ALTER TABLE "BranchPurchaseOrderLine"
  ADD COLUMN IF NOT EXISTS "systemUnitPrice" DECIMAL(12,2);
