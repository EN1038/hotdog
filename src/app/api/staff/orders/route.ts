import {
  BranchOperatingMode,
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
import { getCalendarDayState } from "@/lib/operating-day";
import {
  getActiveShift,
  requireActiveShift,
  serializeShift,
  shiftCalendarDateKey,
  ShiftGateError,
} from "@/lib/branch-shift";
import {
  computeLineGiftQuantity,
  optionGroupDetailInclude,
  resolveOrderItemOptionsFromPrisma,
} from "@/lib/menu-option-groups";
import { formatOrderItemOptionsText } from "@/lib/order-item-display";
import {
  fulfillmentToChannel,
  isChannelSellEnabled,
  resolveSellPrice,
} from "@/lib/menu-pricing";
import { createOrderWithDailyQueue } from "@/lib/order-queue";
import { deductStockForOrder, deductBranchMenuStockForOrder, deductBranchNonMenuStockForOrder, StockError } from "@/lib/stock";
import { isMenuItemSoldOut, isPromoMenuItem } from "@/lib/staff-key-order";
import {
  getBranchServiceStatus,
  type BranchHoursFields,
} from "@/lib/branch-hours";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";
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
  salesChannel: z
    .enum(["STOREFRONT", "FACEBOOK", "APP_DELIVERY", "OTHER"])
    .default("STOREFRONT"),
  cupSizeOz: z.union([z.literal(22), z.literal(32)]).optional(),
  cupCount: z.number().int().min(1).max(99).optional(),
  bagCount: z.number().int().min(1).max(99).optional(),
  consumables: z
    .array(
      z.object({
        branchNonMenuItemId: z.string().min(1),
        quantity: z.number().int().positive().max(99),
      }),
    )
    .max(50)
    .optional(),
  items: z.array(orderItemSchema).min(1),
  /** Skip queue — mark COMPLETED immediately (walk-in / instant mode) */
  completeImmediately: z.boolean().optional(),
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
        address: true,
        isOpen: true,
        allowAdvanceOrder: true,
        storefrontHours: true,
        deliveryHours: true,
        opensAt: true,
        closesAt: true,
      },
    });
    if (!branchForDay) return jsonError("ไม่พบสาขา", 404);

    const dayState = getCalendarDayState();
    const activeShift = await getActiveShift(session.branchId);

    const activeShiftDateKey = activeShift ? shiftCalendarDateKey(activeShift) : null;
    const currentRoundKey = activeShiftDateKey ?? dayState.operatingDay;

    const viewDateKey =
      dateParam && isBangkokDateKey(dateParam)
        ? dateParam
        : currentRoundKey;

    const isToday = viewDateKey === currentRoundKey;
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
        consumableLines: true,
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });

    // ออเดอร์รอรับที่ค้างข้ามวัน — ต้องโชว์ให้ร้านเคลียร์ได้ (แบดจ์นับทั้งหมด)
    let mergedOrders = orders;
    let pendingWaitingCount = 0;
    let waitingExtraForStats: typeof statsOrders = [];
    if (isToday) {
      const waitingExtra = await prisma.order.findMany({
        where: {
          branchId: session.branchId,
          status: OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
          NOT: { queueBusinessDate: businessDate },
        },
        include: {
          customer: true,
          deliveryLocation: true,
          items: { include: { branchMenuItem: true } },
          consumableLines: true,
        },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
      if (waitingExtra.length > 0) {
        const seen = new Set(orders.map((o) => o.id));
        mergedOrders = [
          ...waitingExtra.filter((o) => !seen.has(o.id)),
          ...orders,
        ];
        waitingExtraForStats = waitingExtra.map((o) => ({
          status: o.status,
          awaitingPhotoKey: o.awaitingPhotoKey,
          deliveryFee: o.deliveryFee,
          discountAmount: o.discountAmount,
          items: o.items.map((it) => ({
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            optionsPrice: it.optionsPrice,
          })),
        }));
      }
      pendingWaitingCount = await prisma.order.count({
        where: {
          branchId: session.branchId,
          status: OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
        },
      });
    } else {
      pendingWaitingCount = orders.filter(
        (o) => o.status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
      ).length;
    }

    const dayStats = computeStaffDayStats([
      ...statsOrders,
      ...waitingExtraForStats,
    ]);

    const canToggleStore =
      session.staffRoles.includes("SELLER") ||
      session.staffRoles.includes("BOTH");
    const canSell = Boolean(activeShift);

    return jsonOk({
      orders: mergedOrders,
      pendingWaitingCount,
      viewDate: viewDateKey,
      isToday,
      operatingDay: currentRoundKey,
      entryLocked: !canSell,
      canEnter: canSell && isToday,
      canSell,
      activeShift: activeShift ? serializeShift(activeShift) : null,
      tone: canSell ? "ok" : "locked",
      dayStats,
      roles: session.staffRoles,
      branchName: session.branchName,
      branchAddress: branchForDay.address,
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
    await assertBrandWriteAllowedByBranchId(session.branchId);
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
      select: {
        id: true,
        address: true,
        autoAcceptOrders: true,
        name: true,
        operatingMode: true,
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา");
    if (branch.operatingMode === BranchOperatingMode.SKEWER) {
      return jsonError(
        "สาขานี้เป็นโหมดเสียบไม้ — ใช้แดชบอร์ดแอดมินยืนยันออเดอร์ลูกค้าแทนการคีย์ออเดอร์",
      );
    }
    if (branch.operatingMode === BranchOperatingMode.BBQ_WEIGH) {
      return jsonError(
        "สาขานี้เป็นโหมดหมูกระทะ — ใช้บิลโต๊ะ / จุดชั่งในแอดมินแทนการคีย์ออเดอร์คิว",
      );
    }

    let activeShift;
    try {
      activeShift = await requireActiveShift(session.branchId);
    } catch (e) {
      if (e instanceof ShiftGateError) {
        return jsonError(e.message, e.status);
      }
      throw e;
    }

    const dayState = getCalendarDayState();
    const shiftDateKey = shiftCalendarDateKey(activeShift);

    const requestedIds = body.items.map((i) => i.branchMenuItemId);
    const [orderableMenus, anyMenus] = await Promise.all([
      prisma.branchMenuItem.findMany({
        where: {
          branchId: session.branchId,
          isHidden: false,
          id: { in: requestedIds },
        },
        include: {
          stock: true,
          category: { select: { stockExempt: true } },
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

      const optionGroups = orderable.optionGroupLinks.map((l) => ({
        mode: l.group.mode,
      }));
      const stockQuantity = orderable.stock?.quantity ?? null;
      const menuLike = {
        isOutOfStock: orderable.isOutOfStock,
        stockQuantity,
        optionGroups,
        category: orderable.category,
      };

      if (isMenuItemSoldOut(menuLike)) {
        unavailableItems.push({
          branchMenuItemId: orderable.id,
          name: orderable.name,
          reason: "หมดชั่วคราว",
        });
        continue;
      }

      // Qty guard when stock is tracked (promo packs skip pack-level qty).
      if (
        !isPromoMenuItem(menuLike) &&
        !orderable.category?.stockExempt &&
        stockQuantity != null &&
        item.quantity > stockQuantity
      ) {
        unavailableItems.push({
          branchMenuItemId: orderable.id,
          name: orderable.name,
          reason: `สต๊อกไม่พอ (เหลือ ${stockQuantity})`,
        });
      }
    }

    if (unavailableItems.length > 0) {
      const detail = unavailableItems
        .map((u) => `${u.name}: ${u.reason}`)
        .join(" · ");
      return jsonError(`มีรายการที่ไม่สามารถสั่งได้ — ${detail}`, 400, {
        unavailableItems,
      });
    }

    const consumableRequests = body.consumables ?? [];
    const consumableIds = [
      ...new Set(consumableRequests.map((c) => c.branchNonMenuItemId)),
    ];
    const consumableItems =
      consumableIds.length > 0
        ? await prisma.branchNonMenuItem.findMany({
            where: {
              id: { in: consumableIds },
              branchId: session.branchId,
              stockType: "CONSUMABLE",
            },
          })
        : [];
    const consumableMap = new Map(consumableItems.map((i) => [i.id, i]));
    const resolvedConsumables: Array<{
      branchNonMenuItemId: string;
      itemName: string;
      unit: string;
      quantity: number;
    }> = [];
    for (const req of consumableRequests) {
      const item = consumableMap.get(req.branchNonMenuItemId);
      if (!item) {
        return jsonError("มีสินค้าสิ้นเปลืองที่ไม่ถูกต้อง");
      }
      if (item.quantity < req.quantity) {
        return jsonError(
          `สต๊อกไม่พอ: ${item.name} (เหลือ ${item.quantity} ต้องการ ${req.quantity})`,
        );
      }
      resolvedConsumables.push({
        branchNonMenuItemId: item.id,
        itemName: item.name,
        unit: item.unit || "ใบ",
        quantity: req.quantity,
      });
    }

    if (body.salesChannel === "STOREFRONT") {
      const keyOrderInStock = await prisma.branchNonMenuItem.count({
        where: {
          branchId: session.branchId,
          stockType: "CONSUMABLE",
          showOnKeyOrder: true,
          quantity: { gt: 0 },
        },
      });
      if (keyOrderInStock > 0) {
        const totalQty = resolvedConsumables.reduce(
          (s, c) => s + c.quantity,
          0,
        );
        if (totalQty < 1) {
          return jsonError("กรุณาเลือกสินค้าสิ้นเปลืองอย่างน้อย 1 รายการ");
        }
      }
      for (const req of consumableRequests) {
        const item = consumableMap.get(req.branchNonMenuItemId);
        if (item && !item.showOnKeyOrder) {
          return jsonError(
            `รายการ “${item.name}” ยังไม่ได้เปิดให้เลือกตอนคีย์ออเดอร์`,
          );
        }
      }
    }

    const cupLines = resolvedConsumables.filter((c) => /แก้ว/i.test(c.itemName));
    const bagLines = resolvedConsumables.filter((c) => /ถุง/i.test(c.itemName));
    const derivedCupCount =
      cupLines.reduce((s, c) => s + c.quantity, 0) ||
      resolvedConsumables.reduce((s, c) => s + c.quantity, 0) ||
      null;
    const derivedBagCount =
      bagLines.reduce((s, c) => s + c.quantity, 0) || derivedCupCount;
    const primaryCup = [...cupLines].sort((a, b) => b.quantity - a.quantity)[0];
    const derivedCupSizeOz = (() => {
      const m = primaryCup?.itemName.match(/(\d+)\s*ออน/i);
      if (!m) return body.cupSizeOz ?? null;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : body.cupSizeOz ?? null;
    })();

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
        optionsText: formatOrderItemOptionsText(chosen),
        optionsPrice,
        giftQuantity: computeLineGiftQuantity(
          groups,
          item.optionIds,
          item.quantity,
        ),
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
              shiftId: activeShift.id,
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
              salesChannel: body.salesChannel,
              cupSizeOz: derivedCupSizeOz,
              cupCount: derivedCupCount,
              bagCount: derivedBagCount,
              deliveryFee: new Prisma.Decimal(deliveryFee),
              discountAmount: new Prisma.Decimal(0),
              promoSummary: null,
              createdByStaffId: session.staffId,
              status: body.completeImmediately
                ? OrderStatus.COMPLETED
                : branch.autoAcceptOrders
                  ? OrderStatus.PREPARING
                  : OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
              items: {
                create: orderItems,
              },
              consumableLines:
                resolvedConsumables.length > 0
                  ? {
                      create: resolvedConsumables.map((c) => ({
                        branchNonMenuItemId: c.branchNonMenuItemId,
                        itemName: c.itemName,
                        unit: c.unit,
                        quantity: c.quantity,
                      })),
                    }
                  : undefined,
            },
            include: {
              branch: true,
              deliveryLocation: true,
              items: true,
              consumableLines: true,
              customer: true,
            },
          }),
          { queueBusinessDate: queueBusinessDateFromKey(shiftDateKey) },
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

    const shouldDeductStock =
      order.status === OrderStatus.PREPARING ||
      order.status === OrderStatus.COMPLETED;

    if (shouldDeductStock) {
      try {
        await deductStockForOrder(order.id);
        await deductBranchMenuStockForOrder({
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: session.branchId,
          staffId: session.staffId,
          lines: body.items.map((i) => ({
            branchMenuItemId: i.branchMenuItemId,
            quantity: i.quantity,
            optionIds: i.optionIds,
          })),
        });
        await deductBranchNonMenuStockForOrder({
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: session.branchId,
          staffId: session.staffId,
          lines: resolvedConsumables.map((c) => ({
            branchNonMenuItemId: c.branchNonMenuItemId,
            quantity: c.quantity,
          })),
        });
      } catch (e) {
        if (e instanceof StockError) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CANCELLED,
              cancelledAt: new Date(),
              cancelReason: `สต๊อกไม่พอ: ${e.message}`,
            },
          });
          return jsonError(e.message, e.status);
        }
        throw e;
      }
    }

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
        queueTicketCopies: session.brand.queueTicketCopies,
        operatingDay: dayState.operatingDay,
        brandName: session.brand.name,
        branchName: session.branchName,
        branchAddress: branch.address,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
