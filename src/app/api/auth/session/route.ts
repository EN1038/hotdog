import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonOk } from "@/lib/api";

export async function GET() {
  const session = await getSession();
  if (!session || session.type !== "admin" || !session.adminId) {
    return jsonOk({ session });
  }

  // Refresh membership flags so role changes apply without re-login delay issues
  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    include: { brandMembers: { select: { brandId: true } } },
  });
  if (!admin) {
    return jsonOk({ session: null });
  }

  return jsonOk({
    session: {
      ...session,
      isPlatformAdmin: admin.isPlatformAdmin,
      brandIds: admin.brandMembers.map((m) => m.brandId),
    },
  });
}
