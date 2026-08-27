-- CreateEnum
CREATE TYPE "SmsSendPurpose" AS ENUM ('SKEWER_ORDER_CONFIRMED', 'SKEWER_ORDER_CANCELLED');

-- CreateEnum
CREATE TYPE "SmsSendStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "SmsSendLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" "SmsSendPurpose" NOT NULL,
    "status" "SmsSendStatus" NOT NULL,
    "toPhone" TEXT NOT NULL DEFAULT '',
    "toMsisdn" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'taximail',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "brandId" TEXT,
    "branchId" TEXT,
    "skewerOrderId" TEXT,
    "orderNumber" TEXT,
    "triggeredByAdminId" TEXT,

    CONSTRAINT "SmsSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsSendLog_createdAt_idx" ON "SmsSendLog"("createdAt");

-- CreateIndex
CREATE INDEX "SmsSendLog_branchId_createdAt_idx" ON "SmsSendLog"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsSendLog_brandId_createdAt_idx" ON "SmsSendLog"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsSendLog_purpose_createdAt_idx" ON "SmsSendLog"("purpose", "createdAt");

-- CreateIndex
CREATE INDEX "SmsSendLog_status_createdAt_idx" ON "SmsSendLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SmsSendLog_skewerOrderId_idx" ON "SmsSendLog"("skewerOrderId");

-- AddForeignKey
ALTER TABLE "SmsSendLog" ADD CONSTRAINT "SmsSendLog_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsSendLog" ADD CONSTRAINT "SmsSendLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsSendLog" ADD CONSTRAINT "SmsSendLog_skewerOrderId_fkey" FOREIGN KEY ("skewerOrderId") REFERENCES "SkewerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsSendLog" ADD CONSTRAINT "SmsSendLog_triggeredByAdminId_fkey" FOREIGN KEY ("triggeredByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
