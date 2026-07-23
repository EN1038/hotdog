-- CreateTable
CREATE TABLE "AlertSound" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertSound_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "alertSoundId" TEXT;

-- CreateIndex
CREATE INDEX "Branch_alertSoundId_idx" ON "Branch"("alertSoundId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_alertSoundId_fkey" FOREIGN KEY ("alertSoundId") REFERENCES "AlertSound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default library (static files under /public/sounds/alerts)
INSERT INTO "AlertSound" ("id", "name", "fileUrl", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  ('asnd_alert_a', 'Alert A', '/sounds/alerts/alert-a.mp3', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('asnd_alert_b', 'Alert B', '/sounds/alerts/alert-b.mp3', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('asnd_message', 'Message', '/sounds/alerts/message.mp3', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('asnd_level_up', 'Level up', '/sounds/alerts/level-up.mp3', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('asnd_notify_1', 'Notify 1', '/sounds/alerts/notify-1.mp3', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('asnd_notify_2', 'Notify 2', '/sounds/alerts/notify-2.mp3', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('asnd_notify_3', 'Notify 3', '/sounds/alerts/notify-3.mp3', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
