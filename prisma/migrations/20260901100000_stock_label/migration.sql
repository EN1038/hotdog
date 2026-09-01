-- CreateEnum
CREATE TYPE "StockLabelStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'VOID');

-- CreateTable
CREATE TABLE "StockLabel" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sourceBranchId" TEXT,
    "labelCode" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "menuItemId" TEXT,
    "nonMenuItemId" TEXT,
    "brandProductId" TEXT,
    "productName" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "brandName" TEXT,
    "sourceBranchName" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'ชิ้น',
    "producedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "documentNo" TEXT,
    "batchId" TEXT,
    "menuStockHistoryId" TEXT,
    "status" "StockLabelStatus" NOT NULL DEFAULT 'ACTIVE',
    "consumedAt" TIMESTAMP(3),
    "consumedByStaffId" TEXT,
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByStaffId" TEXT,

    CONSTRAINT "StockLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockLabel_branchId_labelCode_key" ON "StockLabel"("branchId", "labelCode");

-- CreateIndex
CREATE INDEX "StockLabel_branchId_batchId_idx" ON "StockLabel"("branchId", "batchId");

-- CreateIndex
CREATE INDEX "StockLabel_branchId_documentNo_idx" ON "StockLabel"("branchId", "documentNo");

-- CreateIndex
CREATE INDEX "StockLabel_branchId_status_createdAt_idx" ON "StockLabel"("branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StockLabel_lotNumber_idx" ON "StockLabel"("lotNumber");

-- AddForeignKey
ALTER TABLE "StockLabel" ADD CONSTRAINT "StockLabel_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLabel" ADD CONSTRAINT "StockLabel_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLabel" ADD CONSTRAINT "StockLabel_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "BranchMenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLabel" ADD CONSTRAINT "StockLabel_nonMenuItemId_fkey" FOREIGN KEY ("nonMenuItemId") REFERENCES "BranchNonMenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLabel" ADD CONSTRAINT "StockLabel_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLabel" ADD CONSTRAINT "StockLabel_consumedByStaffId_fkey" FOREIGN KEY ("consumedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
