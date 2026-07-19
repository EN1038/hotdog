-- LINE Official Account / Messaging API foundation

ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "lineChannelAccessToken" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "lineChannelSecret" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "lineMessagingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "lineNotifyStaffOnNewOrder" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "lineUserId" TEXT;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "lineNotifyEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS "Staff_lineUserId_key" ON "Staff"("lineUserId");
