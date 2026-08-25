-- Public customer receipt share link

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "publicShareToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_publicShareToken_key"
  ON "Order"("publicShareToken");
