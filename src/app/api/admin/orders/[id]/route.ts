import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true, phone: true } },
        customer: true,
        deliveryLocation: true,
        items: {
          include: {
            branchMenuItem: { select: { imageUrl: true } },
          },
        },
      },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);
    return jsonOk(order);
  } catch (error) {
    return handleApiError(error);
  }
}
