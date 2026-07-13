import { FulfillmentType, PaymentMethod, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateOrderNumber } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const orderItemSchema = z.object({
  branchMenuItemId: z.string(),
  quantity: z.number().int().positive(),
  optionIds: z.array(z.string()).default([]),
  note: z.string().max(200).optional(),
});

const createOrderSchema = z.object({
  branchId: z.string(),
  fulfillmentType: z.nativeEnum(FulfillmentType),
  deliveryLocationId: z.string().optional(),
  addressDetail: z.string().optional(),
  customerName: z.string().trim().min(1),
  scheduledAt: z.string().datetime().optional(),
  note: z.string().max(300).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
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
        items: true,
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

    if (body.paymentMethod === PaymentMethod.CARD) {
      return jsonError("รองรับเฉพาะเงินสดและโอนเท่านั้น");
    }

    if (body.fulfillmentType === "DELIVERY") {
      if (!body.deliveryLocationId || !body.addressDetail?.trim()) {
        return jsonError("กรุณาระบุพื้นที่จัดส่งและที่อยู่");
      }
    }

    const branch = await prisma.branch.findUnique({
      where: { id: body.branchId },
    });
    if (!branch) return jsonError("ไม่พบสาขา");
    if (!branch.isOpen && !branch.allowAdvanceOrder) {
      return jsonError("สาขาปิดอยู่และไม่รับออเดอร์ล่วงหน้า");
    }

    const branchMenu = await prisma.branchMenuItem.findMany({
      where: {
        branchId: body.branchId,
        isHidden: false,
        id: { in: body.items.map((i) => i.branchMenuItemId) },
      },
      include: {
        optionGroups: { include: { options: true } },
      },
    });

    const itemMap = new Map(branchMenu.map((bm) => [bm.id, bm]));
    for (const item of body.items) {
      const menu = itemMap.get(item.branchMenuItemId);
      if (!menu) return jsonError("มีรายการที่ไม่สามารถสั่งได้ในสาขานี้");
      if (menu.isOutOfStock) return jsonError(`"${menu.name}" หมดชั่วคราว`);
    }

    if (body.fulfillmentType === "DELIVERY") {
      const location = await prisma.deliveryLocation.findFirst({
        where: { id: body.deliveryLocationId, branchId: body.branchId },
      });
      if (!location) return jsonError("พื้นที่จัดส่งไม่ถูกต้อง");
    }

    const orderItems = body.items.map((item) => {
      const menu = itemMap.get(item.branchMenuItemId)!;
      const allOptions = menu.optionGroups.flatMap((g) => g.options);
      const chosen = item.optionIds
        .map((id) => allOptions.find((o) => o.id === id))
        .filter((o): o is NonNullable<typeof o> => Boolean(o));
      const optionsPrice = chosen.reduce(
        (sum, o) => sum.add(o.priceDelta),
        new Prisma.Decimal(0),
      );
      return {
        branchMenuItemId: item.branchMenuItemId,
        itemName: menu.name,
        quantity: item.quantity,
        unitPrice: menu.price,
        optionsText: chosen.map((o) => o.name).join(", ") || null,
        optionsPrice,
        note: item.note?.trim() || null,
      };
    });

    let order = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const orderNumber = generateOrderNumber();
      try {
        order = await prisma.order.create({
          data: {
            orderNumber,
            customerId: session.customerId!,
            branchId: body.branchId,
            fulfillmentType: body.fulfillmentType,
            deliveryLocationId:
              body.fulfillmentType === "DELIVERY"
                ? body.deliveryLocationId
                : null,
            addressDetail:
              body.fulfillmentType === "DELIVERY"
                ? body.addressDetail?.trim()
                : null,
            customerName: body.customerName,
            customerPhone: session.customerPhone ?? "",
            scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
            note: body.note?.trim() || null,
            paymentMethod: body.paymentMethod,
            items: { create: orderItems },
          },
          include: {
            branch: true,
            deliveryLocation: true,
            items: true,
          },
        });
        break;
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          continue;
        }
        throw e;
      }
    }
    if (!order) return jsonError("ไม่สามารถสร้างเลขออเดอร์ได้ กรุณาลองใหม่");

    return jsonOk(order, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
