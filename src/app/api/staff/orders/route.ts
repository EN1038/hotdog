import { OrderStatus, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { startOfTodayBangkok } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireStaff();
    const todayStart = startOfTodayBangkok();

    // คิวที่ยังไม่จบ + ออเดอร์เสร็จสิ้นของวันนี้ (สำหรับแท็บเสร็จสิ้น)
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
      ],
    };

    const orders = await prisma.order.findMany({
      where,
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
      brand: session.brand,
      autoAcceptOrders: session.autoAcceptOrders ?? false,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
