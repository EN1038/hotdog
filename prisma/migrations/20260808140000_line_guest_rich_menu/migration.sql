-- Guest LINE rich menu (login before admin link)

ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "lineGuestRichMenuId" TEXT;
