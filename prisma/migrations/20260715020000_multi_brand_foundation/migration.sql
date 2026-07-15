-- CreateEnum
CREATE TYPE "BrandMemberRole" AS ENUM ('OWNER', 'MANAGER');

-- AlterTable Admin
ALTER TABLE "Admin" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Brand
ALTER TABLE "Brand" ADD COLUMN "siteTitle" TEXT;
ALTER TABLE "Brand" ADD COLUMN "siteDescription" TEXT;

-- AlterTable SiteSettings defaults (platform, not a restaurant brand)
ALTER TABLE "SiteSettings" ALTER COLUMN "siteName" SET DEFAULT 'Hotdog';
ALTER TABLE "SiteSettings" ALTER COLUMN "siteTitle" SET DEFAULT 'Hotdog - ระบบจัดการร้านค้า';

-- CreateTable BrandMember
CREATE TABLE "BrandMember" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "role" "BrandMemberRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandMember_adminId_brandId_key" ON "BrandMember"("adminId", "brandId");

ALTER TABLE "BrandMember" ADD CONSTRAINT "BrandMember_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandMember" ADD CONSTRAINT "BrandMember_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing admins become platform admins
UPDATE "Admin" SET "isPlatformAdmin" = true;
