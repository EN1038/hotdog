import {
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import {
  CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH,
  generateOrderNumber,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getBranchServiceStatus, isSameBangkokDay } from "@/lib/branch-hours";
import {
  fulfillmentToChannel,
  isChannelSellEnabled,
  resolveSellPrice,
} from "@/lib/menu-pricing";
import { notifyStaffNewOrder } from "@/lib/line";
import { createOrderWithDailyQueue } from "@/lib/order-queue";
import {
  optionGroupDetailInclude,
  resolveOrderItemOptionsFromPrisma,
} from "@/lib/menu-option-groups";

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
  deliveryLatitude: z.number().finite().optional(),
  deliveryLongitude: z.number().finite().optional(),
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
      // Delivery has no scheduled-time picker — only allow when open now.
      if (body.fulfillmentType === "DELIVERY") {
        return jsonError(
          "ยังไม่ถึงเวลาเปิดจัดส่ง กรุณารอถึงเวลาเปิด หรือเปลี่ยนเป็นรับที่ร้าน",
        );
      }
      if (!body.scheduledAt) {
        return jsonError(
          "ยังไม่ถึงเวลาเปิด กรุณาเลือกเวลารับสินค้าล่วงหน้าของวันนี้",
        );
      }
      const scheduled = new Date(body.scheduledAt);
      if (Number.isNaN(scheduled.getTime())) {
        return jsonError("เวลานัดรับไม่ถูกต้อง");
      }
      if (!isSameBangkokDay(scheduled, new Date())) {
        return jsonError("สั่งล่วงหน้าได้เฉพาะภายในวันนี้เท่านั้น");
      }
      if (scheduled.getTime() <= Date.now()) {
        return jsonError("เวลานัดรับต้องเป็นเวลาหลังจากนี้");
      }
    }

    const requestedIds = body.items.map((i) => i.branchMenuItemId);
    const [orderableMenus, anyMenus] = await Promise.all([
      prisma.branchMenuItem.findMany({
        where: {
          branchId: body.branchId,
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
      }),
      prisma.branchMenuItem.findMany({
        where: { id: { in: requestedIds } },
        select: {
          id: true,
          name: true,
          branchId: true,
          isHidden: true,
          isOutOfStock: true,
          sellDelivery: true,
          sellPickup: true,
          sellStorefront: true,
        },
      }),
    ]);

    const itemMap = new Map(orderableMenus.map((bm) => [bm.id, bm]));
    const anyMap = new Map(anyMenus.map((bm) => [bm.id, bm]));
    const channel = fulfillmentToChannel(body.fulfillmentType);
    const unavailableItems: {
      branchMenuItemId: string;
      name: string;
      reason: string;
    }[] = [];

    for (const item of body.items) {
      const orderable = itemMap.get(item.branchMenuItemId);
      const any = anyMap.get(item.branchMenuItemId);
      if (!orderable) {
        unavailableItems.push({
          branchMenuItemId: item.branchMenuItemId,
          name: any?.name?.trim() || "รายการที่ไม่รู้จัก",
          reason:
            !any
              ? "ถูกลบออกจากระบบแล้ว"
              : any.branchId !== body.branchId
                ? "ไม่ใช่เมนูของสาขานี้"
                : any.isHidden
                  ? "ถูกซ่อน / ไม่พร้อมขาย"
                  : "ไม่สามารถสั่งได้ในสาขานี้",
        });
        continue;
      }
      if (!isChannelSellEnabled(orderable, channel)) {
        unavailableItems.push({
          branchMenuItemId: orderable.id,
          name: orderable.name,
          reason: "ไม่จำหน่ายในช่องทางที่เลือก",
        });
        continue;
      }
      if (orderable.isOutOfStock) {
        unavailableItems.push({
          branchMenuItemId: orderable.id,
          name: orderable.name,
          reason: "หมดชั่วคราว",
        });
      }
    }

    if (unavailableItems.length > 0) {
      return jsonError("มีรายการที่ไม่สามารถสั่งได้", 400, {
        unavailableItems,
      });
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
      const detail = body.addressDetail?.trim() ?? "";
      if (!detail) {
        return jsonError("กรุณาระบุพื้นที่จัดส่งและที่อยู่");
      }
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
        order = await createOrderWithDailyQueue(
          body.branchId,
          (queue) => ({
            data: {
              orderNumber,
              queueNumber: queue.queueNumber,
              queueBusinessDate: queue.queueBusinessDate,
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
              customerName: body.customerName,
              customerPhone: session.customerPhone ?? "",
              isNewCustomer,
              scheduledAt: body.scheduledAt
                ? new Date(body.scheduledAt)
                : null,
              note: body.note?.trim() || null,
              paymentMethod: body.paymentMethod,
              deliveryFee: new Prisma.Decimal(deliveryFee),
              discountAmount: new Prisma.Decimal(0),
              promoSummary: null,
              status: branch.autoAcceptOrders
                ? OrderStatus.PREPARING
                : OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
              items: {
                create: orderItems,
              },
            },
            include: {
              branch: true,
              deliveryLocation: true,
              items: true,
            },
          }),
          { cutoffTime: branch.businessDayCutoffTime },
        );
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

    void notifyStaffNewOrder({
      id: order.id,
      orderNumber: order.orderNumber,
      queueNumber: order.queueNumber,
      branchId: order.branchId,
      fulfillmentType: order.fulfillmentType,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,
    });

    return jsonOk(order, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
