import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonOk } from "@/lib/api";
import { liveBrandIdsFromMemberships } from "@/lib/owner-register-phone";

export async function GET() {
  const session = await getSession();
  if (!session || session.type !== "admin" || !session.adminId) {
    return jsonOk({ session });
  }

  // Refresh membership flags so role changes apply without re-login delay issues
  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    include: {
      brandMembers: {
        select: {
          brandId: true,
          brand: { select: { status: true } },
        },
      },
    },
  });
  if (!admin) {
    return jsonOk({ session: null });
  }

  return jsonOk({
    session: {
      ...session,
      isPlatformAdmin: admin.isPlatformAdmin,
      brandIds: liveBrandIdsFromMemberships(admin.brandMembers),
    },
  });
}
