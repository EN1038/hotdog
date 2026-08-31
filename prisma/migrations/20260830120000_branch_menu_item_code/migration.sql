-- AlterTable
ALTER TABLE "BranchMenuItem" ADD COLUMN "itemCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BranchMenuItem_branchId_itemCode_key" ON "BranchMenuItem"("branchId", "itemCode");
