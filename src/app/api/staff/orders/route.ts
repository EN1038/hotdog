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
  generateOrderNumber,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getOperatingRoundStatus,
} from "@/lib/operating-day";
import {
  optionGroupDetailInclude,
  resolveOrderItemOptionsFromPrisma,
} from "@/lib/menu-option-groups";
import {
  fulfillmentToChannel,
  isChannelSellEnabled,
  resolveSellPrice,
} from "@/lib/menu-pricing";
import { createOrderWithDailyQueue } from "@/lib/order-queue";
import {
  getBranchServiceStatus,
  type BranchHoursFields,
} from "@/lib/branch-hours";
import {
  isCancelledStatus,
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";

type OrderWithItems = {
  status: OrderStatus;
  awaitingPhotoKey?: boolean;
  deliveryFee: unknown;
  discountAmount: unknown;
  items: Array<{
    quantity: number;
    unitPrice: unknown;
    optionsPrice: unknown;
  }>;
};

function computeStaffDayStats(orders: OrderWithItems[]) {
  let cancelledOrders = 0;
  let acceptedOrders = 0;
  let awaitingPhotoKeyOrders = 0;
  let revenueBaht = 0;
  for (const o of orders) {
    if (o.awaitingPhotoKey && !isCancelledStatus(o.status)) {
      awaitingPhotoKeyOrders += 1;
    }
    if (isCancelledStatus(o.status)) {
      cancelledOrders += 1;
      continue;
    }
    if (
      o.status !== OrderStatus.WAITING_FOR_STORE_ACCEPTANCE &&
      !o.awaitingPhotoKey
    ) {
      acceptedOrders += 1;
    }
    if (isOrderCountableRevenue(o)) {
      revenueBaht += orderGrandTotal(
        o.items.map((i) => ({
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          optionsPrice: Number(i.optionsPrice),
        })),
        Number(o.deliveryFee),
        Number(o.discountAmount),
      );
    }
  }
  return {
    totalOrders: orders.length,
    cancelledOrders,
    acceptedOrders,
    awaitingPhotoKeyOrders,
    revenueBaht,
  };
}

function branchStatusSummary(branch: BranchHoursFields) {
  const pickup = getBranchServiceStatus(branch, "PICKUP");
  const delivery = getBranchServiceStatus(branch, "DELIVERY");
  return {
    isOpen: branch.isOpen,
    pickup: {
      openNow: pickup.openNow,
      acceptingOrders: pickup.acceptingOrders,
      reason: pickup.reason,
    },
    delivery: {
      openNow: delivery.openNow,
      acceptingOrders: delivery.acceptingOrders,
      reason: delivery.reason,
    },
  };
}

const orderItemSchema = z.object({
  branchMenuItemId: z.string(),
  quantity: z.number().int().positive(),
  optionIds: z.array(z.string()).default([]),
  note: z.string().max(200).optional(),
});

const createStaffOrderSchema = z.object({
  fulfillmentType: z.nativeEnum(FulfillmentType),
  deliveryLocationId: z.string().optional(),
  addressDetail: z.string().optional(),
  deliveryLatitude: z.number().finite().optional(),
  deliveryLongitude: z.number().finite().optional(),
  scheduledAt: z.string().datetime().optional(),
  note: z.string().max(300).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  items: z.array(orderItemSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    const branchForDay = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        latitude: true,
        longitude: true,
        isOpen: true,
        allowAdvanceOrder: true,
        storefrontHours: true,
        deliveryHours: true,
        opensAt: true,
        closesAt: true,
        businessDayCutoffTime: true,
        lateEntryUntilTime: true,
      },
    });
    if (!branchForDay) return jsonError("ไม่พบสาขา", 404);

    const dayState = getOperatingRoundStatus(branchForDay);
    const viewDateKey =
      dateParam && isBangkokDateKey(dateParam)
        ? dateParam
        : dayState.operatingDay;
    const isToday = viewDateKey === dayState.operatingDay;
    const businessDate = queueBusinessDateFromKey(viewDateKey);

    const statsOrders = await prisma.order.findMany({
      where: {
        branchId: session.branchId,
        queueBusinessDate: businessDate,
      },
      select: {
        status: true,
        awaitingPhotoKey: true,
        deliveryFee: true,
        discountAmount: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            optionsPrice: true,
          },
        },
      },
    });
    const dayStats = computeStaffDayStats(statsOrders);

    const where: Prisma.OrderWhereInput = {
      branchId: session.branchId,
      queueBusinessDate: businessDate,
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

    const canToggleStore =
      session.staffRoles.includes("SELLER") ||
      session.staffRoles.includes("BOTH");

    return jsonOk({
      orders,
      viewDate: viewDateKey,
      isToday,
      operatingDay: dayState.operatingDay,
      entryLocked: dayState.entryLocked,
      canEnter: dayState.canEnter && isToday,
      businessDayCutoffTime: dayState.cutoffTime,
      lateEntryUntilTime: dayState.lateEntryUntilTime,
      entryDeadlineHm: dayState.entryDeadlineHm,
      minutesRemaining: dayState.minutesRemaining,
      tone: dayState.tone,
      dayStats,
      roles: session.staffRoles,
      branchName: session.branchName,
      brand: session.brand,
      autoAcceptOrders: session.autoAcceptOrders ?? false,
      branchStatus: branchStatusSummary(branchForDay),
      canToggleStore,
      branchPin:
        branchForDay.latitude != null &&
        branchForDay.longitude != null &&
        Number.isFinite(branchForDay.latitude) &&
        Number.isFinite(branchForDay.longitude)
          ? {
              latitude: branchForDay.latitude,
              longitude: branchForDay.longitude,
            }
          : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    const body = createStaffOrderSchema.parse(await request.json());

    if (body.paymentMethod === PaymentMethod.CARD) {
      return jsonError("รองรับเฉพาะเงินสดและโอนเท่านั้น");
    }

    if (body.fulfillmentType === "DELIVERY") {
      if (!body.deliveryLocationId || !body.addressDetail?.trim()) {
        return jsonError("กรุณาระบุพื้นที่จัดส่งและที่อยู่");
      }
    }

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
    });
    if (!branch) return jsonError("ไม่พบสาขา");

    const dayState = getOperatingRoundStatus(branch);
    if (dayState.entryLocked) {
      return jsonError(
        dayState.lateEntryUntilTime
          ? `ปิดรอบคีย์ออเดอร์แล้ว (คีย์ได้ถึง ${dayState.lateEntryUntilTime} น.) — รอบใหม่เริ่ม ${dayState.cutoffTime} น.`
          : `ปิดรอบคีย์ออเดอร์แล้ว — รอบใหม่เริ่ม ${dayState.cutoffTime} น.`,
      );
    }

    const requestedIds = body.items.map((i) => i.branchMenuItemId);
    const [orderableMenus, anyMenus] = await Promise.all([
      prisma.branchMenuItem.findMany({
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
              : any.branchId !== session.branchId
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
        where: {
          id: body.deliveryLocationId,
          branchId: session.branchId,
        },
      });
      if (!location) {
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

    const customerName = session.staffDisplayName;
    const customerPhone = session.staffPhone;

    const staffCustomer = await prisma.customer.upsert({
      where: { phone: customerPhone },
      create: {
        phone: customerPhone,
        name: customerName,
      },
      update: {
        name: customerName,
      },
    });

    const priorOrder = await prisma.order.findFirst({
      where: {
        customerId: staffCustomer.id,
        branchId: session.branchId,
      },
      select: { id: true },
    });
    const isNewCustomer = !priorOrder;

    let order = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const orderNumber = generateOrderNumber();
      try {
        order = await createOrderWithDailyQueue(
          session.branchId,
          (queue) => ({
            data: {
              orderNumber,
              queueNumber: queue.queueNumber,
              queueBusinessDate: queue.queueBusinessDate,
              customerId: staffCustomer.id,
              branchId: session.branchId,
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
              customerName,
              customerPhone,
              isNewCustomer,
              scheduledAt: body.scheduledAt
                ? new Date(body.scheduledAt)
                : null,
              note: body.note?.trim() || null,
              paymentMethod: body.paymentMethod,
              deliveryFee: new Prisma.Decimal(deliveryFee),
              discountAmount: new Prisma.Decimal(0),
              promoSummary: null,
              createdByStaffId: session.staffId,
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
              customer: true,
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

    const totalAmount = orderGrandTotal(
      orderItems.map((item) => ({
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        optionsPrice: Number(item.optionsPrice),
      })),
      Number(deliveryFee),
      0,
    );

    return jsonOk(
      {
        ...order,
        totalAmount,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

