-- AlterTable
ALTER TABLE "SkewerOrderItem" ADD COLUMN "quantityUnit" TEXT,
ADD COLUMN "sticksPerUnit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "countsAsSticks" BOOLEAN NOT NULL DEFAULT true;
