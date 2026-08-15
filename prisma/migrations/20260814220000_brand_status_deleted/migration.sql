-- Soft-delete brands via status (ไม่ลบแถวออกจาก DB)
ALTER TYPE "BrandStatus" ADD VALUE IF NOT EXISTS 'DELETED';
