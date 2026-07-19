-- AlterTable
ALTER TABLE "DeliveryLocation" ADD COLUMN IF NOT EXISTS "isCustomAddress" BOOLEAN NOT NULL DEFAULT false;
