import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const items = await prisma.admin.findMany({
      where: { lineUserId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        lineNotifyDailySummary: true,
        brandMembers: {
          select: {
            role: true,
            brand: { select: { name: true } },
          },
        },
      },
      take: 100,
    });
    return jsonOk({
      items: items.map((a) => ({
        id: a.id,
        username: a.username,
        lineNotifyDailySummary: a.lineNotifyDailySummary,
        brands: a.brandMembers.map(
          (m) => `${m.brand.name} (${m.role === "OWNER" ? "เจ้าของ" : "ผู้จัดการ"})`,
        ),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
