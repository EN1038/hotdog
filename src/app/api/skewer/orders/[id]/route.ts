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
        items: {
          orderBy: { itemName: "asc" },
          include: {
            branchMenuItem: { select: { imageUrl: true } },
          },
        },
      },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);

    return jsonOk({
      ...order,
      requestedDate: requestedDateToKey(order.requestedDate),
      items: order.items.map((item) => ({
        id: item.id,
        branchMenuItemId: item.branchMenuItemId,
        itemName: item.itemName,
        requestedQuantity: item.requestedQuantity,
        confirmedQuantity: item.confirmedQuantity,
        imageUrl: item.branchMenuItem?.imageUrl ?? null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
