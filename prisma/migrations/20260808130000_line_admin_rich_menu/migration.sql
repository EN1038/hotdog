-- Admin LINE rich menu + delete-mode chat state

ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "lineDeleteModeExpiresAt" TIMESTAMP(3);
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "lineAdminRichMenuId" TEXT;
