-- CreateEnum
CREATE TYPE "BranchOperatingMode" AS ENUM ('NORMAL', 'SKEWER');

-- CreateEnum
CREATE TYPE "SkewerOrderStatus" AS ENUM ('PENDING_CONFIRM', 'CONFIRMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "operatingMode" "BranchOperatingMode" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "SkewerOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "customerName" TEXT NOT NULL DEFAULT '',
    "requestedDate" DATE NOT NULL,
    "addressText" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "note" TEXT,
    "status" "SkewerOrderStatus" NOT NULL DEFAULT 'PENDING_CONFIRM',
    "adminNote" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByAdminId" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkewerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkewerOrderItem" (
    "id" TEXT NOT NULL,
    "skewerOrderId" TEXT NOT NULL,
    "branchMenuItemId" TEXT,
    "itemName" TEXT NOT NULL,
    "requestedQuantity" INTEGER NOT NULL,
    "confirmedQuantity" INTEGER,

    CONSTRAINT "SkewerOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkewerOrder_orderNumber_key" ON "SkewerOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "SkewerOrder_branchId_status_createdAt_idx" ON "SkewerOrder"("branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SkewerOrder_customerId_createdAt_idx" ON "SkewerOrder"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "SkewerOrderItem_skewerOrderId_idx" ON "SkewerOrderItem"("skewerOrderId");

-- AddForeignKey
ALTER TABLE "SkewerOrder" ADD CONSTRAINT "SkewerOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkewerOrder" ADD CONSTRAINT "SkewerOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkewerOrder" ADD CONSTRAINT "SkewerOrder_confirmedByAdminId_fkey" FOREIGN KEY ("confirmedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkewerOrderItem" ADD CONSTRAINT "SkewerOrderItem_skewerOrderId_fkey" FOREIGN KEY ("skewerOrderId") REFERENCES "SkewerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkewerOrderItem" ADD CONSTRAINT "SkewerOrderItem_branchMenuItemId_fkey" FOREIGN KEY ("branchMenuItemId") REFERENCES "BranchMenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
