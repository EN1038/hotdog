-- CreateEnum
CREATE TYPE "BranchPromotionType" AS ENUM ('BUY_N_GET_M', 'ORDER_PERCENT_OFF', 'ORDER_FIXED_OFF', 'MIN_SPEND_OFF', 'FREE_DELIVERY');

-- CreateEnum
CREATE TYPE "BranchPromotionAudience" AS ENUM ('STAFF', 'CUSTOMER', 'BOTH');

-- AlterTable
ALTER TABLE "BranchMenuItem" ADD COLUMN "hideFromStaff" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "promoSummary" TEXT;
ALTER TABLE "Order" ADD COLUMN "createdByStaffId" TEXT;

-- CreateTable
CREATE TABLE "BranchPromotion" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "type" "BranchPromotionType" NOT NULL,
    "audience" "BranchPromotionAudience" NOT NULL DEFAULT 'BOTH',
    "applyStorefront" BOOLEAN NOT NULL DEFAULT true,
    "applyDelivery" BOOLEAN NOT NULL DEFAULT true,
    "buyQty" INTEGER,
    "getQty" INTEGER,
    "percent" DECIMAL(10,2),
    "amount" DECIMAL(10,2),
    "minSubtotal" DECIMAL(10,2),
    "maxDiscount" DECIMAL(10,2),
    "categoryId" TEXT,
    "menuItemIds" JSONB,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchPromotion_branchId_isActive_idx" ON "BranchPromotion"("branchId", "isActive");

-- AddForeignKey
ALTER TABLE "BranchPromotion" ADD CONSTRAINT "BranchPromotion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPromotion" ADD CONSTRAINT "BranchPromotion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
