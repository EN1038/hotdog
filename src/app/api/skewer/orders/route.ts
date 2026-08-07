import { BranchOperatingMode, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import {
  nextSkewerOrderNumber,
  parseRequestedDateKey,
  requestedDateToKey,
  SKEWER_MIN_QTY_PER_ITEM,
} from "@/lib/skewer-order";

const itemSchema = z.object({
  branchMenuItemId: z.string().min(1),
  quantity: z.number().int().min(SKEWER_MIN_QTY_PER_ITEM),
});

const createSchema = z.object({
  branchId: z.string().min(1),
  requestedDate: z.string().min(1),
  addressText: z.string().trim().min(5).max(500),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  note: z.string().trim().max(300).optional(),
  items: z.array(itemSchema).min(1),
});

function serializeSkewerOrder(
  order: {
    id: string;
    orderNumber: string;
    branchId: string;
    customerPhone: string;
    customerName: string;
    requestedDate: Date;
    addressText: string;
    latitude: number | null;
    longitude: number | null;
    note: string | null;
    status: string;
    adminNote: string | null;
    confirmedAt: Date | null;
    cancelReason: string | null;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    branch?: { id: string; name: string; code: string | null } | null;
    items: {
      id: string;
      branchMenuItemId: string | null;
      itemName: string;
      requestedQuantity: number;
      confirmedQuantity: number | null;
    }[];
  },
) {
  return {
    ...order,
    requestedDate: requestedDateToKey(order.requestedDate),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireCustomer();
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const date = searchParams.get("date");

    let requestedDateFilter: Date | undefined;
    if (date) {
      if (!isBangkokDateKey(date)) {
        return jsonError("รูปแบบวันที่ไม่ถูกต้อง");
      }
      requestedDateFilter = queueBusinessDateFromKey(date);
    }

    const orders = await prisma.skewerOrder.findMany({
      where: {
        customerId: session.customerId!,
        ...(branchId ? { branchId } : {}),
        ...(requestedDateFilter
          ? { requestedDate: requestedDateFilter }
          : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        items: { orderBy: { itemName: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return jsonOk(orders.map(serializeSkewerOrder));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCustomer();
    const body = createSchema.parse(await request.json());

    const requestedDate = parseRequestedDateKey(body.requestedDate);
    if (!requestedDate) {
      return jsonError("วันที่ต้องการไม่ถูกต้อง");
    }

    const branch = await prisma.branch.findUnique({
      where: { id: body.branchId },
      select: {
        id: true,
        isOpen: true,
        isHidden: true,
        operatingMode: true,
      },
    });
    if (!branch || branch.isHidden) {
      return jsonError("ไม่พบสาขา", 404);
    }
    if (branch.operatingMode !== BranchOperatingMode.SKEWER) {
      return jsonError("สาขานี้ไม่รับสั่งเสียบไม้");
    }
    if (!branch.isOpen) {
      return jsonError("สาขายังไม่เปิดรับออเดอร์");
    }

    const menuIds = [...new Set(body.items.map((i) => i.branchMenuItemId))];
    const menuItems = await prisma.branchMenuItem.findMany({
      where: {
        branchId: body.branchId,
        id: { in: menuIds },
        isHidden: false,
      },
      select: { id: true, name: true },
    });
    if (menuItems.length !== menuIds.length) {
      return jsonError("มีเมนูที่ไม่พร้อมสั่ง");
    }
    const menuById = new Map(menuItems.map((m) => [m.id, m]));

    const lat = body.latitude ?? null;
    const lng = body.longitude ?? null;
    if ((lat == null) !== (lng == null)) {
      return jsonError("พิกัดแผนที่ไม่ครบ");
    }

    const customer = await prisma.customer.findUnique({
      where: { id: session.customerId! },
      select: { id: true, phone: true, name: true },
    });
    if (!customer) return jsonError("ไม่พบข้อมูลลูกค้า", 401);

    let created;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const orderNumber = nextSkewerOrderNumber();
      try {
        created = await prisma.skewerOrder.create({
          data: {
            orderNumber,
            branchId: body.branchId,
            customerId: customer.id,
            customerPhone: customer.phone,
            customerName: customer.name?.trim() || session.customerName || "",
            requestedDate,
            addressText: body.addressText.trim(),
            latitude: lat,
            longitude: lng,
            note: body.note?.trim() || null,
            items: {
              create: body.items.map((item) => ({
                branchMenuItemId: item.branchMenuItemId,
                itemName: menuById.get(item.branchMenuItemId)!.name,
                requestedQuantity: item.quantity,
              })),
            },
          },
          include: {
            branch: { select: { id: true, name: true, code: true } },
            items: { orderBy: { itemName: "asc" } },
          },
        });
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue;
        }
        throw err;
      }
    }

    if (!created) {
      return jsonError("สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่", 500);
    }

    return jsonOk(serializeSkewerOrder(created), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
