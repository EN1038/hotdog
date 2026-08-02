import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: branchId } = await context.params;
    await requireBranchAccess(branchId);

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date"); // YYYY-MM-DD

    let dateFilter: Record<string, unknown> = {};
    if (dateStr) {
      // Bangkok calendar day (+07:00)
      const startOfDay = new Date(`${dateStr}T00:00:00+07:00`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999+07:00`);
      if (!isNaN(startOfDay.getTime())) {
        dateFilter = {
          OR: [
            {
              completedAt: {
                gte: startOfDay,
                lte: endOfDay,
              },
            },
            {
              completedAt: null,
              createdAt: {
                gte: startOfDay,
                lte: endOfDay,
              },
            },
          ],
        };
      }
    }

    const counts = await prisma.stockCount.findMany({
      where: {
        branchId: branchId,
        status: "COMPLETED",
        ...dateFilter,
      },
      orderBy: { completedAt: "desc" },
      include: {
        createdByStaff: { select: { name: true } },
        createdByAdmin: { select: { username: true } },
        lines: {
          include: {
            product: {
              select: { name: true, stockType: true, unit: true },
            },
          },
        },
      },
    });

    return jsonOk({ counts });
  } catch (error) {
    return handleApiError(error);
  }
}
