import type { BrandStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Brand statuses that still occupy an owner phone (block re-register). */
export function isLiveBrandStatus(status: BrandStatus): boolean {
  return status !== "DELETED";
}

export function adminHasLiveBrand(admin: {
  brandMembers: Array<{ brand: { status: BrandStatus } }>;
}): boolean {
  return admin.brandMembers.some((m) => isLiveBrandStatus(m.brand.status));
}

/** Non-platform owner admin for this phone, with brand statuses. */
export async function findOwnerAdminByPhone(phone: string) {
  return prisma.admin.findFirst({
    where: {
      isPlatformAdmin: false,
      OR: [{ phone }, { username: phone }],
    },
    select: {
      id: true,
      phone: true,
      username: true,
      brandMembers: {
        select: {
          brandId: true,
          brand: { select: { status: true } },
        },
      },
    },
  });
}

/**
 * True when this phone already owns a non-deleted brand
 * (soft-deleted-only / orphan admins may re-register).
 */
export async function phoneBlocksOwnerRegister(
  phone: string,
): Promise<boolean> {
  const admin = await findOwnerAdminByPhone(phone);
  if (!admin) return false;
  return adminHasLiveBrand(admin);
}

/** Membership brand ids excluding soft-deleted brands. */
export function liveBrandIdsFromMemberships(
  members: Array<{ brandId: string; brand: { status: BrandStatus } }>,
): string[] {
  return members
    .filter((m) => isLiveBrandStatus(m.brand.status))
    .map((m) => m.brandId);
}
