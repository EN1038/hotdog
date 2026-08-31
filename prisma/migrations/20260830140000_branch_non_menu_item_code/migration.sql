-- AlterTable
ALTER TABLE "BranchNonMenuItem" ADD COLUMN "itemCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BranchNonMenuItem_branchId_itemCode_key" ON "BranchNonMenuItem"("branchId", "itemCode");
