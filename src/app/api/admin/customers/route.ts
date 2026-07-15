import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const brandIds = getAccessibleBrandIds(session);

    const customers = await prisma.customer.findMany({
      where: {
        ...(q ? { phone: { contains: q.replace(/\D/g, "") } } : {}),
        ...(brandIds !== null
          ? {
              orders: {
                some: { branch: { brandId: { in: brandIds } } },
              },
            }
          : {}),
      },
      include: {
        orders: {
          where:
            brandIds === null
              ? undefined
              : { branch: { brandId: { in: brandIds } } },
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
