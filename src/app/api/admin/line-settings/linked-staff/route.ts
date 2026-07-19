import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const items = await prisma.staff.findMany({
      where: { lineUserId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        branch: { select: { name: true } },
      },
      take: 100,
    });
    return jsonOk({
      items: items.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        branchName: s.branch.name,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
