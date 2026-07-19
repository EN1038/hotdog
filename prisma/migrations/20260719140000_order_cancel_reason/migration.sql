-- Store why an order was cancelled (customer or staff).

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
