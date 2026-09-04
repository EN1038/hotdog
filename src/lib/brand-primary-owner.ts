import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";

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

/** Primary brand owner phone + display name (for staff bridge / seat exemption). */
export async function resolveOwnerPhoneForBrand(brandId: string): Promise<{
  phone: string;
  name: string | null;
  adminId: string;
} | null> {
  await ensureBrandPrimaryAdmin(brandId).catch(() => null);
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { primaryAdminId: true, contactPhone: true, name: true },
  });
  if (!brand) return null;

  const members = await prisma.brandMember.findMany({
    where: { brandId },
    include: {
      admin: {
        select: {
          id: true,
          phone: true,
          username: true,
          isPlatformAdmin: true,
        },
      },
    },
  });
  const primaryId = pickPrimaryAdminId(members, brand.primaryAdminId);
  const primary = members.find((m) => m.admin.id === primaryId)?.admin;
  if (!primary || primary.isPlatformAdmin) return null;

  const candidates = [
    primary.phone,
    brand.contactPhone,
    /^\d{9,}$/.test(primary.username.replace(/\D/g, ""))
      ? primary.username
      : null,
  ];
  let phone = "";
  for (const c of candidates) {
    if (!c) continue;
    const n = normalizePhone(c);
    if (n.length >= 9) {
      phone = n;
      break;
    }
  }
  if (!phone) return null;

  return {
    phone,
    name: brand.name ? `เจ้าของ · ${brand.name}` : primary.username,
    adminId: primary.id,
  };
}
