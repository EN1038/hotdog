-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('STOREFRONT', 'FACEBOOK', 'APP_DELIVERY', 'OTHER', 'ORDER_CUSTOMER');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "salesChannel" "SalesChannel" NOT NULL DEFAULT 'STOREFRONT';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "giftQuantity" INTEGER NOT NULL DEFAULT 0;

-- Backfill: online customer orders (no staff keyer) → ORDER_CUSTOMER
UPDATE "Order"
SET "salesChannel" = 'ORDER_CUSTOMER'
WHERE "createdByStaffId" IS NULL;
