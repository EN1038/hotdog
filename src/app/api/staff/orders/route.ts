import { OrderStatus, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { startOfTodayBangkok } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireStaff();
    const todayStart = startOfTodayBangkok();

    // คิวที่ยังไม่จบ + ออเดอร์เสร็จสิ้น/ยกเลิกของวันนี้ (แท็บเสร็จสิ้น)
    const where: Prisma.OrderWhereInput = {
      branchId: session.branchId,
      OR: [
        {
          status: {
            notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
          },
        },
        {
          status: OrderStatus.COMPLETED,
          updatedAt: { gte: todayStart },
        },
        {
          status: OrderStatus.CANCELLED,
          OR: [
            { cancelledAt: { gte: todayStart } },
            { updatedAt: { gte: todayStart } },
          ],
        },
      ],
    };

    const [branch, orders] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: session.branchId },
        select: { latitude: true, longitude: true },
      }),
      prisma.order.findMany({
        where,
        include: {
          customer: true,
          deliveryLocation: true,
          items: { include: { branchMenuItem: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    return jsonOk({
      orders,
      roles: session.staffRoles,
      branchName: session.branchName,
      brand: session.brand,
      autoAcceptOrders: session.autoAcceptOrders ?? false,
      branchPin:
        branch?.latitude != null &&
        branch?.longitude != null &&
        Number.isFinite(branch.latitude) &&
        Number.isFinite(branch.longitude)
          ? { latitude: branch.latitude, longitude: branch.longitude }
          : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
