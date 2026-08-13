-- Replace BrandPlan tiers: STARTER/SHOP -> RETAIL/WEIGH_TABLE/MALA/MULTI

DROP TYPE IF EXISTS "BrandPlan_new";

CREATE TYPE "BrandPlan_new" AS ENUM ('RETAIL', 'WEIGH_TABLE', 'MALA', 'MULTI');

ALTER TABLE "Brand" ALTER COLUMN "plan" DROP DEFAULT;

ALTER TABLE "Brand" ALTER COLUMN "plan" TYPE "BrandPlan_new" USING (
  CASE
    WHEN "plan"::text = 'STARTER' THEN 'RETAIL'
    WHEN "plan"::text = 'SHOP'
      AND "kitchenEnabled" = true
      AND "skewerEnabled" = true THEN 'MALA'
    WHEN "plan"::text = 'SHOP'
      AND "bbqEnabled" = true
      AND "kitchenEnabled" = false
      AND "skewerEnabled" = false THEN 'WEIGH_TABLE'
    WHEN "plan"::text = 'SHOP' THEN 'MULTI'
    ELSE 'RETAIL'
  END
)::"BrandPlan_new";

DROP TYPE "BrandPlan";

ALTER TYPE "BrandPlan_new" RENAME TO "BrandPlan";

ALTER TABLE "Brand" ALTER COLUMN "plan" SET DEFAULT 'RETAIL';
