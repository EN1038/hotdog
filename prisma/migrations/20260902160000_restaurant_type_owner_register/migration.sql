-- Owner self-register settings on restaurant types
ALTER TABLE "RestaurantType" ADD COLUMN IF NOT EXISTS "showInOwnerRegister" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RestaurantType" ADD COLUMN IF NOT EXISTS "ownerRegisterHint" TEXT;
ALTER TABLE "RestaurantType" ADD COLUMN IF NOT EXISTS "ownerRegisterPlan" "BrandPlan" NOT NULL DEFAULT 'RETAIL';
ALTER TABLE "RestaurantType" ADD COLUMN IF NOT EXISTS "ownerRegisterOperatingMode" "BranchOperatingMode" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "RestaurantType" ADD COLUMN IF NOT EXISTS "offersMasterImport" BOOLEAN NOT NULL DEFAULT false;

UPDATE "RestaurantType" SET "showInOwnerRegister" = false;

INSERT INTO "RestaurantType" (
  "id", "code", "name", "sortOrder", "isActive",
  "showInOwnerRegister", "ownerRegisterHint", "ownerRegisterPlan",
  "ownerRegisterOperatingMode", "offersMasterImport",
  "createdAt", "updatedAt"
) VALUES
  (
    'cmownerreg000000000000001',
    'mala_hotpot',
    'ร้านหมาล่า/ย่าง/ทอด/ชาบู',
    1, true, true,
    'คิวเคาน์เตอร์ · ครัว · โต๊ะ · เสียบไม้',
    'MALA', 'NORMAL', true,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'cmownerreg000000000000002',
    'fish_ball',
    'ร้านลูกชิ้น/ย่าง/ทอด',
    2, true, true,
    'ขายทั่วไป · คิวหน้าร้าน',
    'RETAIL', 'NORMAL', true,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'cmownerreg000000000000003',
    'weigh_bbq',
    'ร้านหมูกระทะชั่งกิโล',
    3, true, true,
    'ชั่งกิโล · เปิดบิลโต๊ะ',
    'WEIGH_TABLE', 'BBQ_WEIGH', false,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'cmownerreg000000000000004',
    'made_to_order',
    'ร้านอาหารตามสั่ง',
    4, true, true,
    'เริ่มว่าง · ตั้งเมนูเอง',
    'RETAIL', 'NORMAL', false,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = EXCLUDED."isActive",
  "showInOwnerRegister" = EXCLUDED."showInOwnerRegister",
  "ownerRegisterHint" = EXCLUDED."ownerRegisterHint",
  "ownerRegisterPlan" = EXCLUDED."ownerRegisterPlan",
  "ownerRegisterOperatingMode" = EXCLUDED."ownerRegisterOperatingMode",
  "offersMasterImport" = EXCLUDED."offersMasterImport",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Hide legacy broad list from owner register (keep rows for branches already tagged)
UPDATE "RestaurantType"
SET "isActive" = false, "showInOwnerRegister" = false
WHERE "code" NOT IN ('mala_hotpot', 'fish_ball', 'weigh_bbq', 'made_to_order')
  AND NOT EXISTS (
    SELECT 1 FROM "Branch" b
    WHERE b."primaryCategory" = "RestaurantType"."code"
       OR "RestaurantType"."code" = ANY(b."secondaryCategories")
  );
