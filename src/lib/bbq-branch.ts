import { BranchOperatingMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";
import {
  brandInactiveMessage,
  effectiveBrandStatus,
  isBrandStorefrontOpen,
} from "@/lib/brand-plan";

export const TAKEAWAY_DINING_TABLE_NAME = "ซื้อกลับบ้าน";

type BbqBranch = {
  id: string;
  name: string;
  operatingMode: BranchOperatingMode;
  weighSalesEnabled: boolean;
  code: string | null;
  brand: { code: string } | null;
};

export function branchAllowsWeighSales(branch: {
  operatingMode: BranchOperatingMode | string;
  weighSalesEnabled?: boolean | null;
}): boolean {
  if (branch.operatingMode === BranchOperatingMode.BBQ_WEIGH) return true;
  return (
    branch.operatingMode === BranchOperatingMode.NORMAL &&
    Boolean(branch.weighSalesEnabled)
  );
}

/** Dual sell: mala queue + weigh in one NORMAL branch */
export function branchHasDualSellModes(branch: {
  operatingMode: BranchOperatingMode | string;
  weighSalesEnabled?: boolean | null;
  brand?: { bbqEnabled?: boolean | null } | null;
}): boolean {
  return (
    branch.operatingMode === BranchOperatingMode.NORMAL &&
    Boolean(branch.weighSalesEnabled) &&
    Boolean(branch.brand?.bbqEnabled !== false)
  );
}

/**
 * Gate for admin/staff BBQ weigh APIs.
 * Allows BBQ_WEIGH branches, or NORMAL with weighSalesEnabled.
 * Visibility (hidden/test) is enforced on public customer routes only.
 */
export async function requireBbqWeighBranch(
  branchId: string,
): Promise<{ branch: BbqBranch } | { error: Response }> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      name: true,
      operatingMode: true,
      weighSalesEnabled: true,
      brand: {
        select: {
          code: true,
          status: true,
          trialEndsAt: true,
          bbqEnabled: true,
        },
      },
      code: true,
    },
  });
  if (!branch) return { error: jsonError("ไม่พบสาขา", 404) };
  if (!branchAllowsWeighSales(branch)) {
    return {
      error: jsonError(
        "สาขานี้ยังไม่เปิดขายชั่งกิโล (เปิดที่ตั้งค่าสาขา หรือสร้างเป็นโหมดหมูกระทะ)",
        400,
      ),
    };
  }
  if (branch.brand && !branch.brand.bbqEnabled) {
    return { error: jsonError("แพ็กเกจนี้ยังไม่เปิดโหมดหมูกระทะ", 403) };
  }
  if (branch.brand && !isBrandStorefrontOpen(branch.brand)) {
    return {
      error: jsonError(
        brandInactiveMessage(effectiveBrandStatus(branch.brand)),
        403,
      ),
    };
  }
  return { branch };
}

export function isBbqGateError(
  gate: { branch: BbqBranch } | { error: Response },
): gate is { error: Response } {
  return "error" in gate;
}

/** Ensure a takeaway table exists for counter weigh sales (staff). */
export async function ensureTakeawayDiningTable(branchId: string) {
  const existing = await prisma.diningTable.findFirst({
    where: { branchId, name: TAKEAWAY_DINING_TABLE_NAME },
  });
  if (existing) {
    if (!existing.isActive) {
      return prisma.diningTable.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }
    return existing;
  }
  const maxSort = await prisma.diningTable.aggregate({
    where: { branchId },
    _max: { sortOrder: true },
  });
  return prisma.diningTable.create({
    data: {
      branchId,
      name: TAKEAWAY_DINING_TABLE_NAME,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      isActive: true,
    },
  });
}
