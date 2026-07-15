import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        branch: {
          select: { id: true, name: true, phone: true, brandId: true },
        },
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
    await requireBranchAccess(order.branchId);
    return jsonOk(order);
  } catch (error) {
    return handleApiError(error);
  }
}
