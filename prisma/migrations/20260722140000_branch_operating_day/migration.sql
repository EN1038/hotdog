-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "businessDayCutoffTime" TEXT NOT NULL DEFAULT '00:00';
ALTER TABLE "Branch" ADD COLUMN "lateEntryUntilTime" TEXT;
