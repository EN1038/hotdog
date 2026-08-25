-- Brand owner phone login

ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "phone" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Admin_phone_key" ON "Admin"("phone");
