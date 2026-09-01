import { BranchOperatingMode, Prisma, SkewerOrderStatus } from "@prisma/client";
import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import {
  requestedDateToKey,
  resolveSkewerMenuImageUrl,
  resolveSkewerMenuUnitPrice,
  resolveSkewerOrderItemFields,
  resolveSkewerQtyUnit,
} from "@/lib/skewer-order";
import {
  notifyCustomerSkewerOrderCancelled,
  notifyCustomerSkewerOrderConfirmed,
} from "@/lib/skewer-order-sms";
import { logAdminActivity } from "@/lib/admin-activity";
import { skewerOrderPublicSharePath } from "@/lib/skewer-order-public-share";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import {
  loadLatestRepeatCustomerUnitPrices,
  lookupRepeatSkewerUnitPrice,
} from "@/lib/skewer-order-repeat-pricing";
import { validateOrderDiscount } from "@/lib/order-discount";

type Params = { params: Promise<{ id: string }> };

const SKEWER_ORDER_TX = { maxWait: 10_000, timeout: 20_000 } as const;

type PricingLine = { id: string; unitPriceBaht: number };

function validatePricingLines(
  existingItems: Array<{ id: string }>,
  lines: PricingLine[],
): string | null {
  if (lines.length !== existingItems.length) {
    return "กรุณาระบุราคาครบทุกรายการ";
  }
  const existingById = new Map(existingItems.map((i) => [i.id, i]));
  for (const line of lines) {
    if (!existingById.has(line.id)) {
      return "รายการไม่ตรงกับออเดอร์";
    }
  }
  return null;
}

async function applySkewerOrderItemPricing(
  tx: Prisma.TransactionClient,
  lines: PricingLine[],
) {
  await Promise.all(
    lines.map((line) =>
      tx.skewerOrderItem.update({
        where: { id: line.id },
        data: { unitPriceBaht: line.unitPriceBaht },
      }),
    ),
  );
}

function resolveShippingCostBaht(value: number | null | undefined) {
  return value != null && value >= 0 ? value : null;
}

function pricingLinesSubtotal(
  existingItems: Array<{
    id: string;
    confirmedQuantity: number | null;
    requestedQuantity: number;
  }>,
  pricingLines: PricingLine[],
): number {
  const priceById = new Map(pricingLines.map((l) => [l.id, l.unitPriceBaht]));
  let sum = 0;
  for (const item of existingItems) {
    const qty = item.confirmedQuantity ?? item.requestedQuantity;
    if (qty <= 0) continue;
    sum += qty * (priceById.get(item.id) ?? 0);
  }
  return Math.round(sum * 100) / 100;
}

function resolveSkewerOrderDiscount(input: {
  itemsSubtotal: number;
  shippingCostBaht: number | null;
  discountAmount?: number;
  discountReason?: string | null;
  discountReasonNote?: string | null;
}) {
  return validateOrderDiscount({
    itemsSubtotal: input.itemsSubtotal,
    deliveryFee: input.shippingCostBaht ?? 0,
    discountAmount: input.discountAmount ?? 0,
    discountReason: input.discountReason,
    discountReasonNote: input.discountReasonNote,
  });
}

const skewerItemInclude = {
  orderBy: { itemName: "asc" as const },
  include: {
    branchMenuItem: {
      select: {
        quantityUnit: true,
        sticksPerUnit: true,
        countsAsSticks: true,
        imageUrl: true,
        skewerImageUrl: true,
        price: true,
        storefrontPrice: true,
        pickupPrice: true,
        category: { select: { skewerCategoryRole: true } },
      },
    },
  },
};

function serializeItem(
  item: {
  id: string;
  itemName: string;
  requestedQuantity: number;
  confirmedQuantity: number | null;
  unitPriceBaht?: { toString(): string } | number | string | null;
  quantityUnit?: string | null;
  sticksPerUnit?: number | null;
  countsAsSticks?: boolean | null;
  skewerCategoryRole?: string | null;
  branchMenuItemId?: string | null;
  branchMenuItem?: {
    quantityUnit: string | null;
    sticksPerUnit: number;
    countsAsSticks: boolean;
    imageUrl: string | null;
    skewerImageUrl: string | null;
    price?: { toString(): string } | number | string | null;
    storefrontPrice?: { toString(): string } | number | string | null;
    pickupPrice?: { toString(): string } | number | string | null;
    category?: { skewerCategoryRole: string } | null;
  } | null;
  },
  opts?: {
    customerId?: string;
    repeatPrices?: Map<string, number>;
  },
) {
  const unitFields = resolveSkewerOrderItemFields(item);
  const unitPriceRaw =
    item.unitPriceBaht != null && item.unitPriceBaht !== ""
      ? Number(item.unitPriceBaht)
      : null;
  const menuDefaultUnitPriceBaht = item.branchMenuItem
    ? resolveSkewerMenuUnitPrice(item.branchMenuItem)
    : null;
  const repeatRaw =
    opts?.customerId && opts.repeatPrices
      ? lookupRepeatSkewerUnitPrice(
          opts.repeatPrices,
          opts.customerId,
          item.branchMenuItemId ?? null,
          item.itemName,
        )
      : null;
  return {
    id: item.id,
    itemName: item.itemName,
    requestedQuantity: item.requestedQuantity,
    confirmedQuantity: item.confirmedQuantity,
    unitPriceBaht:
      unitPriceRaw != null && Number.isFinite(unitPriceRaw) ? unitPriceRaw : null,
    menuDefaultUnitPriceBaht,
    repeatCustomerUnitPriceBaht: repeatRaw,
    quantityUnit: resolveSkewerQtyUnit({ quantityUnit: unitFields.quantityUnit }),
    sticksPerUnit: unitFields.sticksPerUnit,
    countsAsSticks: unitFields.countsAsSticks,
    skewerCategoryRole: unitFields.skewerCategoryRole,
    imageUrl: resolveSkewerMenuImageUrl({
      imageUrl: item.branchMenuItem?.imageUrl,
      skewerImageUrl: item.branchMenuItem?.skewerImageUrl,
    }),
  };
}

function serialize(
  order: {
  requestedDate: Date;
  customerId?: string;
  publicShareToken?: string | null;
  shippingCostBaht?: { toString(): string } | number | string | null;
  discountAmount?: { toString(): string } | number | string | null;
  discountReason?: string | null;
  discountReasonNote?: string | null;
  deliveredAt?: Date | null;
  deliveredOn?: Date | null;
  deliveryInfo?: string | null;
  items?: Array<{
    id: string;
    itemName: string;
    requestedQuantity: number;
    confirmedQuantity: number | null;
    branchMenuItemId?: string | null;
    unitPriceBaht?: { toString(): string } | number | string | null;
    branchMenuItem?: {
      quantityUnit: string | null;
      sticksPerUnit: number;
      countsAsSticks: boolean;
      imageUrl: string | null;
      skewerImageUrl: string | null;
      price?: { toString(): string } | number | string | null;
      storefrontPrice?: { toString(): string } | number | string | null;
      pickupPrice?: { toString(): string } | number | string | null;
    } | null;
  }>;
  [key: string]: unknown;
  },
  repeatPrices?: Map<string, number>,
) {
  const { items, publicShareToken, shippingCostBaht, discountAmount, discountReason, discountReasonNote, ...rest } = order;
  const shippingRaw =
    shippingCostBaht != null && shippingCostBaht !== ""
      ? Number(shippingCostBaht)
      : null;
  const discountRaw =
    discountAmount != null && discountAmount !== ""
      ? Number(discountAmount)
      : 0;
  const itemOpts = order.customerId
    ? { customerId: order.customerId, repeatPrices }
    : undefined;
  return {
    ...rest,
    requestedDate: requestedDateToKey(order.requestedDate),
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    deliveredOn: order.deliveredOn
      ? requestedDateToKey(order.deliveredOn)
      : null,
    deliveryInfo: order.deliveryInfo ?? null,
    shippingCostBaht:
      shippingRaw != null && Number.isFinite(shippingRaw) ? shippingRaw : null,
    discountAmount:
      Number.isFinite(discountRaw) && discountRaw > 0 ? discountRaw : 0,
    discountReason: discountReason ?? null,
    discountReasonNote: discountReasonNote ?? null,
    publicSharePath: publicShareToken
      ? skewerOrderPublicSharePath(publicShareToken)
      : null,
    ...(items
      ? {
          items: items.map((item) =>
            serializeItem(item, itemOpts),
          ),
        }
      : {}),
  };
}

export async function GET(request: Request, { params }: Params) {
  try {
    await ensureProdSchemaCompat();
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const statusFilter =
      status &&
      Object.values(SkewerOrderStatus).includes(status as SkewerOrderStatus)
        ? (status as SkewerOrderStatus)
        : undefined;

    let requestedDateFilter: Date | undefined;
    if (date) {
      if (!isBangkokDateKey(date)) {
        return jsonError("รูปแบบวันที่ไม่ถูกต้อง");
      }
      requestedDateFilter = queueBusinessDateFromKey(date);
    }

    const orders = await prisma.skewerOrder.findMany({
      where: {
        branchId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(requestedDateFilter
          ? { requestedDate: requestedDateFilter }
          : {}),
      },
      include: {
        items: skewerItemInclude,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    const pendingCount = await prisma.skewerOrder.count({
      where: { branchId, status: SkewerOrderStatus.PENDING_CONFIRM },
    });

    const repeatPrices = await loadLatestRepeatCustomerUnitPrices(branchId);

    return jsonOk({
      pendingCount,
      orders: orders.map((o) => serialize(o, repeatPrices)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const confirmItemSchema = z.object({
  id: z.string().min(1),
  confirmedQuantity: z.number().int().min(0),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm"),
    orderId: z.string().min(1),
    items: z.array(confirmItemSchema).min(1),
    adminNote: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("cancel"),
    orderId: z.string().min(1),
    cancelReason: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal("deliver"),
    orderId: z.string().min(1),
    deliveredOn: z.string().trim().min(1),
    deliveryInfo: z.string().trim().max(1000).optional(),
    shippingCostBaht: z.number().min(0).max(999_999).optional().nullable(),
    discountAmount: z.number().min(0).max(999_999).optional(),
    discountReason: z.string().trim().max(40).optional().nullable(),
    discountReasonNote: z.string().trim().max(120).optional().nullable(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          unitPriceBaht: z.number().min(0).max(999_999),
        }),
      )
      .optional(),
  }),
  z.object({
    action: z.literal("updatePricing"),
    orderId: z.string().min(1),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          unitPriceBaht: z.number().min(0).max(999_999),
        }),
      )
      .min(1),
    shippingCostBaht: z.number().min(0).max(999_999).optional().nullable(),
    discountAmount: z.number().min(0).max(999_999).optional(),
    discountReason: z.string().trim().max(40).optional().nullable(),
    discountReasonNote: z.string().trim().max(120).optional().nullable(),
  }),
]);

export async function PATCH(request: Request, { params }: Params) {
  try {
    await ensureProdSchemaCompat();
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = patchSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { operatingMode: true, name: true, brandId: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (branch.operatingMode !== BranchOperatingMode.SKEWER) {
      return jsonError("สาขานี้ไม่ใช่โหมดเสียบไม้");
    }

    if (body.action === "cancel") {
      const existing = await prisma.skewerOrder.findFirst({
        where: { id: body.orderId, branchId },
      });
      if (!existing) return jsonError("ไม่พบออเดอร์", 404);
      if (existing.status === SkewerOrderStatus.CANCELLED) {
        return jsonError("ออเดอร์ถูกยกเลิกแล้ว");
      }
      if (existing.status === SkewerOrderStatus.DELIVERED) {
        return jsonError("ออเดอร์ส่งสำเร็จแล้ว ยกเลิกไม่ได้");
      }
      if (
        existing.status === SkewerOrderStatus.CONFIRMED &&
        !body.cancelReason?.trim()
      ) {
        return jsonError("กรุณาระบุเหตุผลการยกเลิก");
      }

      const updated = await prisma.skewerOrder.update({
        where: { id: existing.id },
        data: {
          status: SkewerOrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: body.cancelReason?.trim() || null,
        },
        include: { items: skewerItemInclude },
      });

      await logAdminActivity(session, {
        action: "branch.update",
        summary: `ยกเลิกออเดอร์เสียบไม้ #${updated.orderNumber} สาขา ${branch.name}`,
        branchId,
        branchName: branch.name,
        entityType: "skewer_order",
        entityId: updated.id,
        entityName: updated.orderNumber,
      });

      void notifyCustomerSkewerOrderCancelled(updated, {
        brandId: branch.brandId,
        triggeredByAdminId: session.adminId,
      });

      return jsonOk(serialize(updated));
    }

    if (body.action === "deliver") {
      const existing = await prisma.skewerOrder.findFirst({
        where: { id: body.orderId, branchId },
        include: { items: true },
      });
      if (!existing) return jsonError("ไม่พบออเดอร์", 404);
      if (existing.status !== SkewerOrderStatus.CONFIRMED) {
        return jsonError("บันทึกส่งได้เฉพาะออเดอร์ที่ยืนยันแล้ว");
      }
      if (!isBangkokDateKey(body.deliveredOn)) {
        return jsonError("รูปแบบวันที่ส่งสำเร็จไม่ถูกต้อง");
      }
      if (body.items?.length) {
        const pricingErr = validatePricingLines(existing.items, body.items);
        if (pricingErr) return jsonError(pricingErr);
      }

      const shippingCost = resolveShippingCostBaht(body.shippingCostBaht);
      const pricingLines =
        body.items ??
        existing.items.map((item) => ({
          id: item.id,
          unitPriceBaht: Number(item.unitPriceBaht ?? 0),
        }));
      const itemsSubtotal = pricingLinesSubtotal(existing.items, pricingLines);
      const discountCheck = resolveSkewerOrderDiscount({
        itemsSubtotal,
        shippingCostBaht: shippingCost,
        discountAmount: body.discountAmount,
        discountReason: body.discountReason,
        discountReasonNote: body.discountReasonNote,
      });
      if (!discountCheck.ok) return jsonError(discountCheck.error);

      const updated = await prisma.$transaction(async (tx) => {
        if (body.items?.length) {
          await applySkewerOrderItemPricing(tx, body.items);
        }
        return tx.skewerOrder.update({
          where: { id: existing.id },
          data: {
            status: SkewerOrderStatus.DELIVERED,
            deliveredAt: new Date(),
            deliveredOn: queueBusinessDateFromKey(body.deliveredOn),
            deliveryInfo: body.deliveryInfo?.trim() || null,
            shippingCostBaht: shippingCost,
            discountAmount: new Prisma.Decimal(discountCheck.discountAmount),
            discountReason: discountCheck.discountReason,
            discountReasonNote:
              discountCheck.discountReason === "other"
                ? body.discountReasonNote?.trim() || null
                : null,
          },
          include: { items: skewerItemInclude },
        });
      }, SKEWER_ORDER_TX);

      await logAdminActivity(session, {
        action: "branch.update",
        summary: `บันทึกส่งสำเร็จออเดอร์เสียบไม้ #${updated.orderNumber} สาขา ${branch.name}`,
        branchId,
        branchName: branch.name,
        entityType: "skewer_order",
        entityId: updated.id,
        entityName: updated.orderNumber,
      });

      return jsonOk(serialize(updated));
    }

    if (body.action === "updatePricing") {
      const existing = await prisma.skewerOrder.findFirst({
        where: { id: body.orderId, branchId },
        include: { items: true },
      });
      if (!existing) return jsonError("ไม่พบออเดอร์", 404);
      if (existing.status !== SkewerOrderStatus.CONFIRMED) {
        return jsonError("แก้ราคาได้เฉพาะออเดอร์ที่ยืนยันแล้ว");
      }
      const pricingErr = validatePricingLines(existing.items, body.items);
      if (pricingErr) return jsonError(pricingErr);

      const shippingCost = resolveShippingCostBaht(body.shippingCostBaht);
      const itemsSubtotal = pricingLinesSubtotal(existing.items, body.items);
      const discountCheck = resolveSkewerOrderDiscount({
        itemsSubtotal,
        shippingCostBaht: shippingCost,
        discountAmount: body.discountAmount,
        discountReason: body.discountReason,
        discountReasonNote: body.discountReasonNote,
      });
      if (!discountCheck.ok) return jsonError(discountCheck.error);

      const updated = await prisma.$transaction(async (tx) => {
        await applySkewerOrderItemPricing(tx, body.items);
        return tx.skewerOrder.update({
          where: { id: existing.id },
          data: {
            shippingCostBaht: shippingCost,
            discountAmount: new Prisma.Decimal(discountCheck.discountAmount),
            discountReason: discountCheck.discountReason,
            discountReasonNote:
              discountCheck.discountReason === "other"
                ? body.discountReasonNote?.trim() || null
                : null,
          },
          include: { items: skewerItemInclude },
        });
      }, SKEWER_ORDER_TX);

      await logAdminActivity(session, {
        action: "branch.update",
        summary: `บันทึกราคาออเดอร์เสียบไม้ #${updated.orderNumber} สาขา ${branch.name}`,
        branchId,
        branchName: branch.name,
        entityType: "skewer_order",
        entityId: updated.id,
        entityName: updated.orderNumber,
      });

      return jsonOk(serialize(updated));
    }

    // confirm
    const existing = await prisma.skewerOrder.findFirst({
      where: { id: body.orderId, branchId },
      include: { items: true },
    });
    if (!existing) return jsonError("ไม่พบออเดอร์", 404);
    if (existing.status !== SkewerOrderStatus.PENDING_CONFIRM) {
      return jsonError("ออเดอร์นี้ยืนยันหรือยกเลิกไปแล้ว");
    }

    const menuIds = [
      ...new Set(
        existing.items
          .map((i) => i.branchMenuItemId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const menuRows =
      menuIds.length > 0
        ? await prisma.branchMenuItem.findMany({
            where: { id: { in: menuIds } },
            select: { id: true, price: true, storefrontPrice: true, pickupPrice: true },
          })
        : [];
    const menuPriceById = new Map(
      menuRows.map((m) => [m.id, resolveSkewerMenuUnitPrice(m)]),
    );

    const repeatPrices = await loadLatestRepeatCustomerUnitPrices(branchId);

    const existingById = new Map(existing.items.map((i) => [i.id, i]));
    if (body.items.length !== existing.items.length) {
      return jsonError("กรุณากรอกจำนวนครบทุกรายการ");
    }

    for (const line of body.items) {
      const row = existingById.get(line.id);
      if (!row) return jsonError("รายการไม่ตรงกับออเดอร์");
      if (line.confirmedQuantity > row.requestedQuantity) {
        return jsonError(
          `"${row.itemName}" ยืนยันได้ไม่เกิน ${row.requestedQuantity}`,
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await Promise.all(
        body.items.map((line) => {
          const row = existingById.get(line.id)!;
          const repeatPrice = lookupRepeatSkewerUnitPrice(
            repeatPrices,
            existing.customerId,
            row.branchMenuItemId,
            row.itemName,
          );
          const menuPrice = row.branchMenuItemId
            ? menuPriceById.get(row.branchMenuItemId) ?? 0
            : 0;
          const defaultUnitPrice = repeatPrice ?? menuPrice;
          return tx.skewerOrderItem.update({
            where: { id: line.id },
            data: {
              confirmedQuantity: line.confirmedQuantity,
              unitPriceBaht: defaultUnitPrice,
            },
          });
        }),
      );
      return tx.skewerOrder.update({
        where: { id: existing.id },
        data: {
          status: SkewerOrderStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedByAdminId: session.adminId!,
          adminNote: body.adminNote?.trim() || null,
        },
        include: { items: skewerItemInclude },
      });
    }, SKEWER_ORDER_TX);

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `ยืนยันออเดอร์เสียบไม้ #${updated.orderNumber} สาขา ${branch.name}`,
      branchId,
      branchName: branch.name,
      entityType: "skewer_order",
      entityId: updated.id,
      entityName: updated.orderNumber,
    });

    void notifyCustomerSkewerOrderConfirmed(updated, {
      brandId: branch.brandId,
      triggeredByAdminId: session.adminId,
    });

    return jsonOk(serialize(updated));
  } catch (error) {
    return handleApiError(error);
  }
}
