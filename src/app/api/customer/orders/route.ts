import {
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateOrderNumber } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getBranchServiceStatus, isSameBangkokDay } from "@/lib/branch-hours";

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
    if (branch.isHidden) {
      return jsonError("สาขานี้ไม่พร้อมให้บริการในขณะนี้");
    }

    const service = getBranchServiceStatus(branch, body.fulfillmentType);
    if (!service.acceptingOrders) {
      return jsonError(service.reason);
    }
    if (!service.openNow) {
      if (!body.scheduledAt) {
        return jsonError(
          "ยังไม่ถึงเวลาเปิด กรุณาเลือกเวลารับ/ส่งล่วงหน้าของวันนี้",
        );
      }
      const scheduled = new Date(body.scheduledAt);
      if (Number.isNaN(scheduled.getTime())) {
        return jsonError("เวลานัดรับ/ส่งไม่ถูกต้อง");
      }
      if (!isSameBangkokDay(scheduled, new Date())) {
        return jsonError("สั่งล่วงหน้าได้เฉพาะภายในวันนี้เท่านั้น");
      }
      if (scheduled.getTime() <= Date.now()) {
        return jsonError("เวลานัดรับ/ส่งต้องเป็นเวลาหลังจากนี้");
      }
    }

    const branchMenu = await prisma.branchMenuItem.findMany({
      where: {
        branchId: body.branchId,
        isHidden: false,
        id: { in: body.items.map((i) => i.branchMenuItemId) },
      },
      include: {
        optionGroupLinks: {
          include: {
            group: { include: { options: true } },
          },
        },
      },
    });

    const itemMap = new Map(branchMenu.map((bm) => [bm.id, bm]));
    for (const item of body.items) {
      const menu = itemMap.get(item.branchMenuItemId);
      if (!menu) return jsonError("มีรายการที่ไม่สามารถสั่งได้ในสาขานี้");
      if (menu.isOutOfStock) return jsonError(`"${menu.name}" หมดชั่วคราว`);
    }

    let deliveryFee = new Prisma.Decimal(0);
    if (body.fulfillmentType === "DELIVERY") {
      if (!body.deliveryLocationId) {
        return jsonError("กรุณาเลือกพื้นที่จัดส่ง");
      }
      const location = await prisma.deliveryLocation.findFirst({
        where: { id: body.deliveryLocationId, branchId: body.branchId },
      });
      if (!location) {
        const zoneCount = await prisma.deliveryLocation.count({
          where: { branchId: body.branchId },
        });
        if (zoneCount === 0) {
          return jsonError("สาขานี้ยังไม่เปิดจัดส่ง — สั่งรับที่ร้านได้เท่านั้น");
        }
        return jsonError("พื้นที่จัดส่งไม่ถูกต้อง");
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
      note: string | null;
    }> = [];

    for (const item of body.items) {
      const menu = itemMap.get(item.branchMenuItemId)!;
      const groups = menu.optionGroupLinks.map((l) => l.group);
      const allOptions = groups.flatMap((g) => g.options);
      const chosen = item.optionIds
        .map((id) => allOptions.find((o) => o.id === id))
        .filter((o): o is NonNullable<typeof o> => Boolean(o));

      if (chosen.length !== item.optionIds.length) {
        return jsonError(`ตัวเลือกของ "${menu.name}" ไม่ถูกต้อง`);
      }

      for (const group of groups) {
        const selectedInGroup = chosen.filter((o) =>
          group.options.some((go) => go.id === o.id),
        );
        if (group.required && selectedInGroup.length < 1) {
          return jsonError(`กรุณาเลือก "${group.name}"`);
        }
        if (selectedInGroup.length > group.maxSelect) {
          return jsonError(
            `"${group.name}" เลือกได้สูงสุด ${group.maxSelect} รายการ`,
          );
        }
      }

      const optionsPrice = chosen.reduce(
        (sum, o) => sum.add(o.priceDelta),
        new Prisma.Decimal(0),
      );
      orderItems.push({
        branchMenuItemId: item.branchMenuItemId,
        itemName: menu.name,
        quantity: item.quantity,
        unitPrice: menu.price,
        optionsText: chosen.map((o) => o.name).join(", ") || null,
        optionsPrice,
        note: item.note?.trim() || null,
      });
    }

    const priorOrder = await prisma.order.findFirst({
      where: {
        customerId: session.customerId!,
        branchId: body.branchId,
      },
      select: { id: true },
    });
    const isNewCustomer = !priorOrder;

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
            isNewCustomer,
            scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
            note: body.note?.trim() || null,
            paymentMethod: body.paymentMethod,
            deliveryFee,
            status: branch.autoAcceptOrders
              ? OrderStatus.PREPARING
              : OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
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
