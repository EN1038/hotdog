-- Brand plan admin config + default trial days

ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "defaultTrialDays" INTEGER NOT NULL DEFAULT 7;

CREATE TABLE IF NOT EXISTS "BrandPlanConfig" (
  "id" TEXT NOT NULL,
  "plan" "BrandPlan" NOT NULL,
  "label" TEXT NOT NULL,
  "hint" TEXT NOT NULL DEFAULT '',
  "priceBaht" INTEGER NOT NULL DEFAULT 0,
  "maxBranches" INTEGER NOT NULL DEFAULT 1,
  "maxStaff" INTEGER NOT NULL DEFAULT 2,
  "stockEnabled" BOOLEAN NOT NULL DEFAULT false,
  "kitchenEnabled" BOOLEAN NOT NULL DEFAULT false,
  "bbqEnabled" BOOLEAN NOT NULL DEFAULT false,
  "skewerEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BrandPlanConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandPlanConfig_plan_key" ON "BrandPlanConfig"("plan");

-- Seed default plan configs (idempotent)
INSERT INTO "BrandPlanConfig" (
  "id", "plan", "label", "hint", "priceBaht",
  "maxBranches", "maxStaff",
  "stockEnabled", "kitchenEnabled", "bbqEnabled", "skewerEnabled",
  "isActive", "sortOrder", "updatedAt"
)
VALUES
  (
    'plan_retail', 'RETAIL', 'แพ็กทั่วไป',
    'หน้าร้าน · คิว · รับออเดอร์ · ลูกค้าสั่งออนไลน์', 159,
    1, 2, false, false, false, false, true, 1, CURRENT_TIMESTAMP
  ),
  (
    'plan_weigh_table', 'WEIGH_TABLE', 'ชั่งโต๊ะ',
    'ชั่งกิโล · เปิดบิลโต๊ะ · QR สั่งเพิ่ม', 329,
    2, 5, false, false, true, false, true, 2, CURRENT_TIMESTAMP
  ),
  (
    'plan_mala', 'MALA', 'แพ็กหมาล่า',
    'คิวเคาน์เตอร์ · ชั่งกิโลคู่ได้ · เสียบไม้ · ครัวกลาง', 359,
    2, 5, false, true, false, true, true, 3, CURRENT_TIMESTAMP
  ),
  (
    'plan_multi', 'MULTI', 'หลายรูปแบบ',
    'ทุก Sales Mode · สต็อกรวม · หลายสาขา', 499,
    2, 5, true, true, true, true, true, 4, CURRENT_TIMESTAMP
  )
ON CONFLICT ("plan") DO UPDATE SET
  "label" = EXCLUDED."label",
  "hint" = EXCLUDED."hint",
  "priceBaht" = EXCLUDED."priceBaht",
  "maxBranches" = EXCLUDED."maxBranches",
  "maxStaff" = EXCLUDED."maxStaff",
  "stockEnabled" = EXCLUDED."stockEnabled",
  "kitchenEnabled" = EXCLUDED."kitchenEnabled",
  "bbqEnabled" = EXCLUDED."bbqEnabled",
  "skewerEnabled" = EXCLUDED."skewerEnabled",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "SiteSettings" SET "defaultTrialDays" = 7 WHERE "defaultTrialDays" IS NULL OR "defaultTrialDays" > 7;
