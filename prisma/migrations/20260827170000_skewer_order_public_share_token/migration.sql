-- AlterTable
ALTER TABLE "SkewerOrder" ADD COLUMN "publicShareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SkewerOrder_publicShareToken_key" ON "SkewerOrder"("publicShareToken");
