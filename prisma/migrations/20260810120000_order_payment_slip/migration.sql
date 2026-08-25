-- Payment transfer slip image

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentSlipUrl" TEXT;
