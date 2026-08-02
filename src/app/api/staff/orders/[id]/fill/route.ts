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
import { deductStockForOrder, deductBranchMenuStockForOrder, deductBranchNonMenuStockForOrder, StockError } from "@/lib/stock";
import { isMenuItemSoldOut, isPromoMenuItem } from "@/lib/staff-key-order";

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
        stock: true,
        category: { select: { stockExempt: true } },
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
      const menuLike = {
        isOutOfStock: menu.isOutOfStock,
        stockQuantity: menu.stock?.quantity ?? null,
        optionGroups: menu.optionGroupLinks.map((l) => ({ mode: l.group.mode })),
        category: menu.category,
      };
      if (isMenuItemSoldOut(menuLike)) {
        return jsonError(`“${menu.name}” หมดชั่วคราว`);
      }
      if (
        !isPromoMenuItem(menuLike) &&
        !menu.category?.stockExempt &&
        menu.stock?.quantity != null &&
        item.quantity > menu.stock.quantity
      ) {
        return jsonError(
          `“${menu.name}” สต๊อกไม่พอ (เหลือ ${menu.stock.quantity})`,
        );
      }
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
      if (!item) return jsonError("มีสินค้าสิ้นเปลืองที่ไม่ถูกต้อง");
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
      const keyOrderCount = await prisma.branchNonMenuItem.count({
        where: {
          branchId: session.branchId,
          stockType: "CONSUMABLE",
          showOnKeyOrder: true,
        },
      });
      if (keyOrderCount > 0) {
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
      if (!m) return null;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : null;
    })();

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
      await tx.orderConsumableLine.deleteMany({ where: { orderId: id } });
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
          cupSizeOz: derivedCupSizeOz,
          cupCount: derivedCupCount,
          bagCount: derivedBagCount,
          deliveryFee,
          status: nextStatus,
          items: { create: orderItems },
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
          items: true,
          consumableLines: true,
          branch: true,
          deliveryLocation: true,
          customer: true,
        },
      });
    });

    if (nextStatus === OrderStatus.PREPARING) {
      try {
        await deductStockForOrder(updated.id);
        await deductBranchMenuStockForOrder({
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          branchId: session.branchId,
          staffId: session.staffId,
          lines: body.items.map((i) => ({
            branchMenuItemId: i.branchMenuItemId,
            quantity: i.quantity,
            optionIds: i.optionIds,
          })),
        });
        await deductBranchNonMenuStockForOrder({
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          branchId: session.branchId,
          staffId: session.staffId,
          lines: resolvedConsumables.map((c) => ({
            branchNonMenuItemId: c.branchNonMenuItemId,
            quantity: c.quantity,
          })),
        });
      } catch (e) {
        if (e instanceof StockError) {
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

    return jsonOk({
      ...updated,
      totalAmount,
      brandName: session.brand.name,
      branchName: session.branchName,
      branchAddress: updated.branch?.address ?? "",
    });
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
