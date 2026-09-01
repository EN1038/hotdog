-- Order-level discount reason snapshot (Phase 1)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountReasonNote" TEXT;

ALTER TABLE "SkewerOrder" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "SkewerOrder" ADD COLUMN IF NOT EXISTS "discountReason" TEXT;
ALTER TABLE "SkewerOrder" ADD COLUMN IF NOT EXISTS "discountReasonNote" TEXT;
