import { OrderStatus } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireStaff();
    const orders = await prisma.order.findMany({
      where: {
        branchId: session.branchId,
        status: { not: OrderStatus.DELIVERED },
      },
      include: {
        customer: true,
        deliveryLocation: true,
        items: { include: { branchMenuItem: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    return jsonOk({
      orders,
      roles: session.staffRoles,
      branchName: session.branchName,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
