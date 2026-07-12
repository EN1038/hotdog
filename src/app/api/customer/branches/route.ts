import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const branches = await prisma.branch.findMany({
      include: {
        menuItems: {
          where: { isHidden: false },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        },
        deliveryLocations: { orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    });
    return jsonOk(branches);
  } catch (error) {
    return handleApiError(error);
  }
}
