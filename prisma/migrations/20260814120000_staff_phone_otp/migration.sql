-- Staff: one-time SMS OTP to prove phone ownership
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);

ALTER TABLE "CustomerOtpChallenge" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'customer';

CREATE INDEX IF NOT EXISTS "CustomerOtpChallenge_phone_purpose_createdAt_idx"
  ON "CustomerOtpChallenge"("phone", "purpose", "createdAt");
