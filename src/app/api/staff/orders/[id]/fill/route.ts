import {
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import {
  CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  assertOrderMutableInActiveShift,
  ShiftGateError,
} from "@/lib/branch-shift";
import {
  computeLineGiftQuantity,
  optionGroupDetailInclude,
  resolveOrderItemOptionsFromPrisma,
} from "@/lib/menu-option-groups";
import {
  fulfillmentToChannel,
  isChannelSellEnabled,
  resolveSellPrice,
} from "@/lib/menu-pricing";
import { orderGrandTotal } from "@/lib/order-totals";

type Params = { params: Promise<{ id: string }> };

const orderItemSchema = z.object({
  branchMenuItemId: z.string(),
  quantity: z.number().int().positive(),
  optionIds: z.array(z.string()).default([]),
  note: z.string().max(200).optional(),
});

const fillSchema = z.object({
  fulfillmentType: z.nativeEnum(FulfillmentType),
  deliveryLocationId: z.string().optional(),
  addressDetail: z.string().optional(),
  deliveryLatitude: z.number().finite().optional(),
  deliveryLongitude: z.number().finite().optional(),
  note: z.string().max(300).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  salesChannel: z
    .enum(["STOREFRONT", "FACEBOOK", "APP_DELIVERY", "OTHER"])
    .default("STOREFRONT"),
  items: z.array(orderItemSchema).min(1),
});

/** Fill menu items for a photo-draft order (until round cutoff lock). */
export async function PUT(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    const body = fillSchema.parse(await request.json());

    if (body.paymentMethod === PaymentMethod.CARD) {
      return jsonError("รองรับเฉพาะเงินสดและโอนเท่านั้น");
    }

    const order = await prisma.order.findFirst({
      where: { id, branchId: session.branchId },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);
    if (!order.awaitingPhotoKey) {
      return jsonError("ออเดอร์นี้คีย์รายการครบแล้ว");
    }
    if (order.status === OrderStatus.CANCELLED) {
      return jsonError("ออเดอร์ถูกยกเลิกแล้ว");
    }

    try {
      await assertOrderMutableInActiveShift({
        branchId: session.branchId,
        orderShiftId: order.shiftId,
        orderQueueBusinessDate: order.queueBusinessDate,
      });
    } catch (e) {
      if (e instanceof ShiftGateError) {
        return jsonError(e.message, e.status);
      }
      throw e;
    }

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
    });
    if (!branch) return jsonError("ไม่พบสาขา");

    if (body.fulfillmentType === "DELIVERY") {
      if (!body.deliveryLocationId || !body.addressDetail?.trim()) {
        return jsonError("กรุณาระบุพื้นที่จัดส่งและที่อยู่");
      }
    }

    const requestedIds = body.items.map((i) => i.branchMenuItemId);
    const orderableMenus = await prisma.branchMenuItem.findMany({
      where: {
        branchId: session.branchId,
        isHidden: false,
        id: { in: requestedIds },
      },
      include: {
        optionGroupLinks: {
          include: {
            group: { include: optionGroupDetailInclude },
          },
        },
      },
    });
    const itemMap = new Map(orderableMenus.map((bm) => [bm.id, bm]));
    const channel = fulfillmentToChannel(body.fulfillmentType);

    for (const item of body.items) {
      const menu = itemMap.get(item.branchMenuItemId);
      if (!menu) return jsonError("มีเมนูที่ไม่สามารถสั่งได้");
      if (!isChannelSellEnabled(menu, channel)) {
        return jsonError(`“${menu.name}” ไม่จำหน่ายในช่องทางที่เลือก`);
      }
      if (menu.isOutOfStock) {
        return jsonError(`“${menu.name}” หมดชั่วคราว`);
      }
    }

    let deliveryFee = new Prisma.Decimal(0);
    if (body.fulfillmentType === "DELIVERY") {
      const location = await prisma.deliveryLocation.findFirst({
        where: {
          id: body.deliveryLocationId!,
          branchId: session.branchId,
        },
      });
      if (!location) return jsonError("พื้นที่จัดส่งไม่ถูกต้อง");
      const detail = body.addressDetail?.trim() ?? "";
      if (
        location.isCustomAddress &&
        detail.length < CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH
      ) {
        return jsonError(
          `กรุณากรอกที่อยู่ให้ละเอียดกว่านี้ (อย่างน้อย ${CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH} ตัวอักษร)`,
        );
      }
      if (location.isCustomAddress) {
        const lat = body.deliveryLatitude;
        const lng = body.deliveryLongitude;
        if (
          lat == null ||
          lng == null ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        ) {
          return jsonError("กรุณาปักหมุดจุดส่งบนแผนที่");
        }
      }
      deliveryFee = location.deliveryFee;
    }

    const orderItems: Array<{
      branchMenuItemId: string;
      itemName: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      optionsText: string | null;
      optionsPrice: Prisma.Decimal;
      giftQuantity: number;
      note: string | null;
    }> = [];

    for (const item of body.items) {
      const menu = itemMap.get(item.branchMenuItemId)!;
      const groups = menu.optionGroupLinks.map((l) => l.group);
      const resolved = resolveOrderItemOptionsFromPrisma(
        groups,
        item.optionIds,
      );
      if (!resolved.ok) {
        return jsonError(`ตัวเลือกของ "${menu.name}" ไม่ถูกต้อง: ${resolved.error}`);
      }
      const chosen = resolved.chosen;
      const optionsPrice = chosen.reduce(
        (sum, o) => sum.add(new Prisma.Decimal(o.priceDelta)),
        new Prisma.Decimal(0),
      );
      const priced = resolveSellPrice(menu, channel);
      orderItems.push({
        branchMenuItemId: item.branchMenuItemId,
        itemName: menu.name,
        quantity: item.quantity,
        unitPrice: new Prisma.Decimal(priced.final),
        optionsText: chosen.map((o) => o.name).join(", ") || null,
        optionsPrice,
        giftQuantity: computeLineGiftQuantity(
          groups,
          item.optionIds,
          item.quantity,
        ),
        note: item.note?.trim() || null,
      });
    }

    const nextStatus = branch.autoAcceptOrders
      ? OrderStatus.PREPARING
      : OrderStatus.WAITING_FOR_STORE_ACCEPTANCE;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      return tx.order.update({
        where: { id },
        data: {
          awaitingPhotoKey: false,
          fulfillmentType: body.fulfillmentType,
          deliveryLocationId:
            body.fulfillmentType === "DELIVERY"
              ? body.deliveryLocationId
              : null,
          addressDetail:
            body.fulfillmentType === "DELIVERY"
              ? body.addressDetail?.trim()
              : null,
          deliveryLatitude:
            body.fulfillmentType === "DELIVERY" &&
            body.deliveryLatitude != null
              ? body.deliveryLatitude
              : null,
          deliveryLongitude:
            body.fulfillmentType === "DELIVERY" &&
            body.deliveryLongitude != null
              ? body.deliveryLongitude
              : null,
          note: body.note?.trim() || null,
          paymentMethod: body.paymentMethod,
          salesChannel: body.salesChannel,
          deliveryFee,
          status: nextStatus,
          items: { create: orderItems },
        },
        include: {
          items: true,
          branch: true,
          deliveryLocation: true,
          customer: true,
        },
      });
    });

    const totalAmount = orderGrandTotal(
      orderItems.map((item) => ({
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        optionsPrice: Number(item.optionsPrice),
      })),
      Number(deliveryFee),
      0,
    );

    return jsonOk({ ...updated, totalAmount });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    const { id } = await params;
    const order = await prisma.order.findFirst({
      where: { id, branchId: session.branchId },
      include: {
        items: true,
        deliveryLocation: true,
        customer: true,
      },
    });
    if (!order) return jsonError("ไม่พบออเดอร์", 404);
    return jsonOk(order);
  } catch (error) {
    return handleApiError(error);
  }
}
