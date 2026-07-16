-- CreateEnum
CREATE TYPE "MenuPromoType" AS ENUM ('AMOUNT', 'PERCENT');

-- AlterTable
ALTER TABLE "BranchMenuItem"
  ADD COLUMN "pickupPrice" DECIMAL(10,2),
  ADD COLUMN "storefrontPrice" DECIMAL(10,2),
  ADD COLUMN "sellDelivery" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sellPickup" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sellStorefront" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "promoEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "promoType" "MenuPromoType",
  ADD COLUMN "promoValue" DECIMAL(10,2),
  ADD COLUMN "promoContinuous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "promoStartsAt" TIMESTAMP(3),
  ADD COLUMN "promoEndsAt" TIMESTAMP(3);

-- Backfill channel prices from delivery price
UPDATE "BranchMenuItem"
SET "pickupPrice" = "price",
    "storefrontPrice" = "price"
WHERE "pickupPrice" IS NULL OR "storefrontPrice" IS NULL;
