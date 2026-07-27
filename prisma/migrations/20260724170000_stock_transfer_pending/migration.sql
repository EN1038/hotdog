-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "brandProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdByAdminId" TEXT,
    "receivedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockTransfer_branchId_status_createdAt_idx" ON "StockTransfer"("branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_brandId_status_createdAt_idx" ON "StockTransfer"("brandId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_brandProductId_idx" ON "StockTransfer"("brandProductId");

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_brandProductId_fkey" FOREIGN KEY ("brandProductId") REFERENCES "BrandProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedByStaffId_fkey" FOREIGN KEY ("receivedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
