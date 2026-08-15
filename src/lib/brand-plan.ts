import { prisma } from "@/lib/db";
import {
  assertBrandStorefrontOpen,
  BRAND_PLAN_LABELS,
  brandUsageSelect,
  BrandLimitError,
} from "@/lib/brand-plan-shared";

export * from "@/lib/brand-plan-shared";

/** สาขาจริงที่นับโควต้าแพ็กเกจ (ไม่รวมสาขาทดลอง) */
export async function countLiveBranches(brandId: string): Promise<number> {
  return prisma.branch.count({
    where: { brandId, isTest: false, kind: { not: "WAREHOUSE" } },
  });
}

export async function countTestBranches(
  brandId: string,
  excludeBranchId?: string,
): Promise<number> {
  return prisma.branch.count({
    where: {
      brandId,
      isTest: true,
      ...(excludeBranchId ? { id: { not: excludeBranchId } } : {}),
    },
  });
}

/**
 * สร้างสาขา:
 * - สาขาจริง → นับเฉพาะ !isTest เทียบ maxBranches
 * - สาขาทดลอง → ไม่นับโควต้า แต่แบรนด์ละได้ 1 สล็อต
 */
export async function assertCanCreateBranch(
  brandId: string,
  opts?: { isTest?: boolean },
): Promise<void> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: brandUsageSelect,
  });
  if (!brand) throw new BrandLimitError("ไม่พบแบรนด์");
  assertBrandStorefrontOpen(brand);

  if (opts?.isTest) {
    const testCount = await countTestBranches(brandId);
    if (testCount >= 1) {
      throw new BrandLimitError(
        `แบรนด์นี้มีสาขาทดลองอยู่แล้ว — ได้ 1 สล็อตต่อแบรนด์ (ไม่นับโควต้าแพ็กเกจ)`,
      );
    }
    return;
  }

  const liveCount = await countLiveBranches(brandId);
  if (liveCount >= brand.maxBranches) {
    throw new BrandLimitError(
      `แพ็ก ${BRAND_PLAN_LABELS[brand.plan]} เปิดสาขาได้สูงสุด ${brand.maxBranches} สาขา (ใช้แล้ว ${liveCount})`,
    );
  }
}

/** เปิด/ปิดธงสาขาทดลองตอนแก้สาขา */
export async function assertCanSetBranchTestFlag(
  brandId: string,
  branchId: string,
  nextIsTest: boolean,
): Promise<void> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: brandUsageSelect,
  });
  if (!brand) throw new BrandLimitError("ไม่พบแบรนด์");
  assertBrandStorefrontOpen(brand);

  if (nextIsTest) {
    const otherTests = await countTestBranches(brandId, branchId);
    if (otherTests >= 1) {
      throw new BrandLimitError(
        `แบรนด์นี้มีสาขาทดลองอยู่แล้ว — ได้ 1 สล็อตต่อแบรนด์`,
      );
    }
    return;
  }

  // ยกเลิกทดลอง → กลายเป็นสาขาจริง ต้องมีโควต้าว่าง
  const liveCount = await countLiveBranches(brandId);
  if (liveCount >= brand.maxBranches) {
    throw new BrandLimitError(
      `แพ็ก ${BRAND_PLAN_LABELS[brand.plan]} เต็มโควต้า ${brand.maxBranches} สาขาแล้ว — ปล่อยโควต้าหรืออัปเกรดก่อนยกเลิกโหมดทดลอง`,
    );
  }
}

export async function assertCanCreateStaff(
  brandId: string,
  opts?: { phone?: string },
): Promise<void> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: brandUsageSelect,
  });
  if (!brand) throw new BrandLimitError("ไม่พบแบรนด์");
  assertBrandStorefrontOpen(brand);

  const phone = opts?.phone?.trim();
  if (phone) {
    const alreadyInBrand = await prisma.staff.findFirst({
      where: { phone, branch: { brandId } },
      select: { id: true },
    });
    // Same person joining another branch of this brand — not a new seat
    if (alreadyInBrand) return;
  }

  const grouped = await prisma.staff.groupBy({
    by: ["phone"],
    where: { branch: { brandId }, isActive: true },
  });
  const count = grouped.length;
  if (count >= brand.maxStaff) {
    throw new BrandLimitError(
      `แพ็ก ${BRAND_PLAN_LABELS[brand.plan]} เพิ่มพนักงานได้สูงสุด ${brand.maxStaff} คน (ใช้แล้ว ${count})`,
    );
  }
}