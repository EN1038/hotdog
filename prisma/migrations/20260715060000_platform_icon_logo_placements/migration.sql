-- Separate platform icon vs wordmark + placement choices
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "iconUrl" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "markSidebar" TEXT NOT NULL DEFAULT 'icon';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "markLogin" TEXT NOT NULL DEFAULT 'logo';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "markHome" TEXT NOT NULL DEFAULT 'logo';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "markOrder" TEXT NOT NULL DEFAULT 'icon';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "markFavicon" TEXT NOT NULL DEFAULT 'icon';

-- Seed icon from previous logo/favicon (often the mark)
UPDATE "SiteSettings"
SET "iconUrl" = COALESCE(NULLIF("iconUrl", ''), NULLIF("logoUrl", ''), NULLIF("faviconUrl", ''), '/skillsale-icon.png');

-- If logo was still the default icon path, point wordmark at the lettermark file
UPDATE "SiteSettings"
SET "logoUrl" = '/skillsale-logo.png'
WHERE "logoUrl" IS NULL OR "logoUrl" = '' OR "logoUrl" = '/skillsale-icon.png';

UPDATE "SiteSettings"
SET "faviconUrl" = COALESCE(NULLIF("faviconUrl", ''), "iconUrl", '/skillsale-icon.png')
WHERE "faviconUrl" IS NULL OR "faviconUrl" = '';
