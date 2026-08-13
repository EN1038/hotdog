import { prisma } from "@/lib/db";
import {
  assertBrandStorefrontOpen,
  BRAND_PLAN_LABELS,
  brandUsageSelect,
  BrandLimitError,
} from "@/lib/brand-plan-shared";

export * from "@/lib/brand-plan-shared";

export async function assertCanCreateBranch(brandId: string): Promise<void> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: brandUsageSelect,
  });
  if (!brand) throw new BrandLimitError("ไม่พบแบรนด์");
  assertBrandStorefrontOpen(brand);

  const count = await prisma.branch.count({ where: { brandId } });
  if (count >= brand.maxBranches) {
    throw new BrandLimitError(
      `แพ็ก ${BRAND_PLAN_LABELS[brand.plan]} เปิดสาขาได้สูงสุด ${brand.maxBranches} สาขา (ใช้แล้ว ${count})`,
    );
  }
}

export async function assertCanCreateStaff(brandId: string): Promise<void> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: brandUsageSelect,
  });
  if (!brand) throw new BrandLimitError("ไม่พบแบรนด์");
  assertBrandStorefrontOpen(brand);

  const count = await prisma.staff.count({
    where: { branch: { brandId } },
  });
  if (count >= brand.maxStaff) {
    throw new BrandLimitError(
      `แพ็ก ${BRAND_PLAN_LABELS[brand.plan]} เพิ่มพนักงานได้สูงสุด ${brand.maxStaff} คน (ใช้แล้ว ${count})`,
    );
  }
}