-- Server-side staff login slots (max 3 live devices per phone)
CREATE TABLE IF NOT EXISTS "StaffAuthSession" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "tokenJti" TEXT NOT NULL,
  "userAgent" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "StaffAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffAuthSession_tokenJti_key" ON "StaffAuthSession"("tokenJti");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffAuthSession_phone_deviceId_key" ON "StaffAuthSession"("phone", "deviceId");
CREATE INDEX IF NOT EXISTS "StaffAuthSession_phone_idx" ON "StaffAuthSession"("phone");
CREATE INDEX IF NOT EXISTS "StaffAuthSession_expiresAt_idx" ON "StaffAuthSession"("expiresAt");
