import { prisma } from "@/lib/db";

type MemberLite = {
  adminId: string;
  role: string;
  createdAt: Date;
  admin?: { isPlatformAdmin?: boolean };
};

/** Earliest OWNER (else earliest non-platform member). */
export function pickPrimaryAdminId(
  members: MemberLite[],
  explicitPrimaryId?: string | null,
): string | null {
  const usable = members.filter((m) => !m.admin?.isPlatformAdmin);
  if (usable.length === 0) return null;
  if (
    explicitPrimaryId &&
    usable.some((m) => m.adminId === explicitPrimaryId)
  ) {
    return explicitPrimaryId;
  }
  const owners = usable
    .filter((m) => m.role === "OWNER")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (owners[0]) return owners[0].adminId;
  const sorted = [...usable].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return sorted[0]?.adminId ?? null;
}

/** Ensure Brand.primaryAdminId points at a current member; backfill if missing. */
export async function ensureBrandPrimaryAdmin(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      primaryAdminId: true,
      members: {
        select: {
          adminId: true,
          role: true,
          createdAt: true,
          admin: { select: { isPlatformAdmin: true } },
        },
      },
    },
  });
  if (!brand) return null;

  const next = pickPrimaryAdminId(brand.members, brand.primaryAdminId);
  if (next && next !== brand.primaryAdminId) {
    await prisma.brand.update({
      where: { id: brandId },
      data: { primaryAdminId: next },
    });
  }
  return next;
}

export async function countBrandOwners(
  brandId: string,
  excludeMembershipId?: string,
) {
  return prisma.brandMember.count({
    where: {
      brandId,
      role: "OWNER",
      admin: { isPlatformAdmin: false },
      ...(excludeMembershipId ? { NOT: { id: excludeMembershipId } } : {}),
    },
  });
}
