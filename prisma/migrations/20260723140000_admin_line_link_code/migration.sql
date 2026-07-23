-- One-time LINE link codes for brand admins (replace username linking)

ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "lineLinkCode" TEXT;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "lineLinkCodeExpiresAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Admin_lineLinkCode_idx" ON "Admin"("lineLinkCode");
