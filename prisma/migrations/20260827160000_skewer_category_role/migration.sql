-- CreateEnum
CREATE TYPE "SkewerCategoryRole" AS ENUM ('SKEWER_SALE', 'SKEWER_SUPPLY');

-- AlterTable
ALTER TABLE "MenuCategory" ADD COLUMN "skewerCategoryRole" "SkewerCategoryRole" NOT NULL DEFAULT 'SKEWER_SALE';

-- AlterTable
ALTER TABLE "SkewerOrderItem" ADD COLUMN "skewerCategoryRole" "SkewerCategoryRole" NOT NULL DEFAULT 'SKEWER_SALE';

-- Backfill legacy "อื่นๆ" category as supply
UPDATE "MenuCategory"
SET "skewerCategoryRole" = 'SKEWER_SUPPLY'
WHERE trim("name") = 'อื่นๆ';

-- Backfill order lines linked to supply categories
UPDATE "SkewerOrderItem" AS soi
SET "skewerCategoryRole" = 'SKEWER_SUPPLY'
FROM "BranchMenuItem" AS bmi
JOIN "MenuCategory" AS mc ON mc."id" = bmi."categoryId"
WHERE soi."branchMenuItemId" = bmi."id"
  AND mc."skewerCategoryRole" = 'SKEWER_SUPPLY';
