import { StaffRole, type BrandStatus } from "@prisma/client";
import type { StaffRole as AppStaffRole } from "@/lib/constants";
import {
  brandInactiveMessage,
  effectiveBrandStatus,
  isBrandStorefrontOpen,
} from "@/lib/brand-plan-shared";

export type StaffLoginRole = "SELLER" | "DELIVERY" | "BOTH";

export type StaffBranchChoice = {
  staffId: string;
  branchId: string;
  branchName: string;
  brandName: string | null;
  roles: StaffLoginRole[];
};

type StaffWithBranchRoles = {
  id: string;
  isActive: boolean;
  branchId: string;
  phoneVerifiedAt: Date | null;
  roles: Array<{ role: StaffRole }>;
  branch: {
    id: string;
    name: string;
    brand: {
      code: string;
      name: string;
      nameTh: string | null;
      nameEn: string | null;
      color: string;
      siteTitle: string | null;
      siteDescription: string | null;
      status: BrandStatus;
      trialEndsAt: Date | null;
    } | null;
  } | null;
};

export function staffUiRoles(
  dbRoles: Iterable<StaffRole>,
): StaffLoginRole[] {
  const set = new Set(dbRoles);
  if (set.has(StaffRole.SELLER) && set.has(StaffRole.DELIVERY)) {
    return ["BOTH"];
  }
  if (set.has(StaffRole.SELLER)) return ["SELLER"];
  if (set.has(StaffRole.DELIVERY)) return ["DELIVERY"];
  return [];
}

export function toAppStaffRoles(roles: StaffLoginRole[]): AppStaffRole[] {
  return roles as AppStaffRole[];
}

/** Active memberships with usable roles and open brand. */
export function filterStaffLoginMemberships(
  rows: StaffWithBranchRoles[],
): { ok: StaffWithBranchRoles[]; blockedReason?: string } {
  const active = rows.filter((s) => s.isActive && s.branch);
  if (active.length === 0) {
    return { ok: [], blockedReason: "เบอร์นี้ถูกปิดการใช้งานแล้ว กรุณาติดต่อเจ้าของร้าน" };
  }

  const withRoles = active.filter((s) => staffUiRoles(s.roles.map((r) => r.role)).length > 0);
  if (withRoles.length === 0) {
    return { ok: [], blockedReason: "ไม่พบสิทธิ์การใช้งาน" };
  }

  const open = withRoles.filter((s) => {
    const brand = s.branch?.brand;
    if (!brand) return false;
    return isBrandStorefrontOpen(brand);
  });
  if (open.length === 0) {
    const brand = withRoles[0]?.branch?.brand;
    return {
      ok: [],
      blockedReason: brand
        ? brandInactiveMessage(effectiveBrandStatus(brand))
        : "แบรนด์ยังไม่พร้อมใช้งาน",
    };
  }

  return { ok: open };
}

export function staffBranchChoices(
  rows: StaffWithBranchRoles[],
): StaffBranchChoice[] {
  return rows.map((s) => ({
    staffId: s.id,
    branchId: s.branchId,
    branchName: s.branch!.name,
    brandName: s.branch!.brand?.name ?? null,
    roles: staffUiRoles(s.roles.map((r) => r.role)),
  }));
}

export function staffLoginBrandPayload(
  brand: NonNullable<StaffWithBranchRoles["branch"]>["brand"],
) {
  if (!brand) return null;
  return {
    code: brand.code,
    name: brand.name,
    nameTh: brand.nameTh,
    nameEn: brand.nameEn,
    logoUrl: null as string | null,
    color: brand.color,
    siteTitle: brand.siteTitle,
    siteDescription: brand.siteDescription,
  };
}

export const staffLoginSelect = {
  id: true,
  phone: true,
  isActive: true,
  branchId: true,
  phoneVerifiedAt: true,
  roles: { select: { role: true } },
  branch: {
    select: {
      id: true,
      name: true,
      brand: {
        select: {
          code: true,
          name: true,
          nameTh: true,
          nameEn: true,
          color: true,
          siteTitle: true,
          siteDescription: true,
          status: true,
          trialEndsAt: true,
        },
      },
    },
  },
} as const;
