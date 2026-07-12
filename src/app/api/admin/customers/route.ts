import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    const customers = await prisma.customer.findMany({
      where: q
        ? { phone: { contains: q.replace(/\D/g, "") } }
        : undefined,
      include: {
        orders: {
          include: {
            branch: true,
            deliveryLocation: true,
            items: { include: { branchMenuItem: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return jsonOk(customers);
  } catch (error) {
    return handleApiError(error);
  }
}
