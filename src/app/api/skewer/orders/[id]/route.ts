import { requireCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requestedDateToKey } from "@/lib/skewer-order";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireCustomer();
    const { id } = await params;

    const order = await prisma.skewerOrder.findFirst({
      where: { id, customerId: session.customerId! },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        items: { orderBy: { itemName: "asc" } },
      },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);

    return jsonOk({
      ...order,
      requestedDate: requestedDateToKey(order.requestedDate),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
