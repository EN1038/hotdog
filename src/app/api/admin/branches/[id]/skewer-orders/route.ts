import { BranchOperatingMode, SkewerOrderStatus } from "@prisma/client";
import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { requestedDateToKey, resolveSkewerQtyUnit } from "@/lib/skewer-order";
import {
  notifyCustomerSkewerOrderCancelled,
  notifyCustomerSkewerOrderConfirmed,
} from "@/lib/skewer-order-sms";
import { logAdminActivity } from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

const skewerItemInclude = {
  orderBy: { itemName: "asc" as const },
  include: {
    branchMenuItem: { select: { quantityUnit: true } },
  },
};

function serializeItem(item: {
  id: string;
  itemName: string;
  requestedQuantity: number;
  confirmedQuantity: number | null;
  branchMenuItemId?: string | null;
  branchMenuItem?: { quantityUnit: string | null } | null;
}) {
  return {
    id: item.id,
    itemName: item.itemName,
    requestedQuantity: item.requestedQuantity,
    confirmedQuantity: item.confirmedQuantity,
    quantityUnit: resolveSkewerQtyUnit({
      quantityUnit: item.branchMenuItem?.quantityUnit,
    }),
  };
}

function serialize(order: {
  requestedDate: Date;
  items?: Array<{
    id: string;
    itemName: string;
    requestedQuantity: number;
    confirmedQuantity: number | null;
    branchMenuItem?: { quantityUnit: string | null } | null;
  }>;
  [key: string]: unknown;
}) {
  const { items, ...rest } = order;
  return {
    ...rest,
    requestedDate: requestedDateToKey(order.requestedDate),
    ...(items
      ? { items: items.map((item) => serializeItem(item)) }
      : {}),
  };
}

export async function GET(request: Request, { params }: Params) {
  try {
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

    return jsonOk({
      pendingCount,
      orders: orders.map(serialize),
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
]);

export async function PATCH(request: Request, { params }: Params) {
  try {
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
      if (existing.status === SkewerOrderStatus.CONFIRMED) {
        return jsonError("ออเดอร์ยืนยันแล้ว ยกเลิกไม่ได้จากหน้านี้");
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

    // confirm
    const existing = await prisma.skewerOrder.findFirst({
      where: { id: body.orderId, branchId },
      include: { items: true },
    });
    if (!existing) return jsonError("ไม่พบออเดอร์", 404);
    if (existing.status !== SkewerOrderStatus.PENDING_CONFIRM) {
      return jsonError("ออเดอร์นี้ยืนยันหรือยกเลิกไปแล้ว");
    }

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
      for (const line of body.items) {
        await tx.skewerOrderItem.update({
          where: { id: line.id },
          data: { confirmedQuantity: line.confirmedQuantity },
        });
      }
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
    });

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
