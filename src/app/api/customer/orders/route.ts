import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const orderItemSchema = z.object({
  branchMenuItemId: z.string(),
  quantity: z.number().int().positive(),
});

const createOrderSchema = z.object({
  branchId: z.string(),
  deliveryLocationId: z.string(),
  addressDetail: z.string().min(1),
  items: z.array(orderItemSchema).min(1),
});

export async function GET() {
  try {
    const session = await requireCustomer();
    const orders = await prisma.order.findMany({
      where: { customerId: session.customerId },
      include: {
        branch: true,
        deliveryLocation: true,
        items: { include: { branchMenuItem: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk(orders);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCustomer();
    const body = createOrderSchema.parse(await request.json());

    const branchMenu = await prisma.branchMenuItem.findMany({
      where: {
        branchId: body.branchId,
        isHidden: false,
        id: { in: body.items.map((i) => i.branchMenuItemId) },
      },
    });

    if (branchMenu.length !== body.items.length) {
      return jsonError("มีรายการที่ไม่สามารถสั่งได้ในสาขานี้");
    }

    const location = await prisma.deliveryLocation.findFirst({
      where: { id: body.deliveryLocationId, branchId: body.branchId },
    });
    if (!location) return jsonError("พื้นที่จัดส่งไม่ถูกต้อง");

    const itemMap = new Map(branchMenu.map((bm) => [bm.id, bm]));

    const order = await prisma.order.create({
      data: {
        customerId: session.customerId!,
        branchId: body.branchId,
        deliveryLocationId: body.deliveryLocationId,
        addressDetail: body.addressDetail,
        items: {
          create: body.items.map((item) => ({
            branchMenuItemId: item.branchMenuItemId,
            itemName: itemMap.get(item.branchMenuItemId)!.name,
            quantity: item.quantity,
            unitPrice: itemMap.get(item.branchMenuItemId)!.price,
          })),
        },
      },
      include: {
        branch: true,
        deliveryLocation: true,
        items: { include: { branchMenuItem: true } },
      },
    });

    return jsonOk(order, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
