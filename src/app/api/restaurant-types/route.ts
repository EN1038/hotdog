import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

/** Public list of active restaurant types (branch tags). */
export async function GET() {
  try {
    const types = await prisma.restaurantType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, sortOrder: true },
    });
    return jsonOk(types);
  } catch (error) {
    return handleApiError(error);
  }
}
