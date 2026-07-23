-- Photo rush orders: open queue with photo, key items later

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "awaitingPhotoKey" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Order_branchId_awaitingPhotoKey_idx"
  ON "Order"("branchId", "awaitingPhotoKey");
