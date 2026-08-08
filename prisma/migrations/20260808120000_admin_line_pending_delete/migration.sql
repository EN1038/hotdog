-- Pending order hard-delete confirmation via LINE OA chat

ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "linePendingDeleteOrderId" TEXT;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "linePendingDeleteExpiresAt" TIMESTAMP(3);
