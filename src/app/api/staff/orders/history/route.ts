import { OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { orderGrandTotal } from "@/lib/order-totals";

const STATUSES = new Set<string>(Object.values(OrderStatus));
const PAYMENTS = new Set<string>(Object.values(PaymentMethod));
const MAX_ROWS = 200;

/** GET — search orders in a date range (bill / queue / status / payment). */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from")?.trim() ?? "";
    const toParam = searchParams.get("to")?.trim() ?? "";
    if (!isBangkokDateKey(fromParam) || !isBangkokDateKey(toParam)) {
      return jsonError("ช่วงวันที่ไม่ถูกต้อง");
    }
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    const q = searchParams.get("q")?.trim() ?? "";
    const statusRaw = searchParams.get("status")?.trim() ?? "";
    const paymentRaw = searchParams.get("payment")?.trim() ?? "";
    const shiftId = searchParams.get("shiftId")?.trim() || null;

    const status =
      statusRaw && STATUSES.has(statusRaw)
        ? (statusRaw as OrderStatus)
        : null;
    const payment =
      paymentRaw && PAYMENTS.has(paymentRaw)
        ? (paymentRaw as PaymentMethod)
        : null;

    const where: Prisma.OrderWhereInput = {
      branchId: session.branchId,
      queueBusinessDate: {
        gte: queueBusinessDateFromKey(from),
        lte: queueBusinessDateFromKey(to),
      },
    };
    if (shiftId) where.shiftId = shiftId;
    if (status) where.status = status;
    if (payment) where.paymentMethod = payment;
    if (q) {
      const or: Prisma.OrderWhereInput[] = [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
      ];
      if (/^\d{1,6}$/.test(q)) {
        or.push({ queueNumber: Number.parseInt(q, 10) });
      }
      where.OR = or;
    }

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        queueNumber: true,
        status: true,
        paymentMethod: true,
        customerName: true,
        createdAt: true,
        deliveryFee: true,
        discountAmount: true,
        items: {
          select: { quantity: true, unitPrice: true, optionsPrice: true },
        },
        shift: { select: { roundNumber: true, calendarDate: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS + 1,
    });

    const truncated = orders.length > MAX_ROWS;
    const rows = truncated ? orders.slice(0, MAX_ROWS) : orders;

    return jsonOk({
      from,
      to,
      truncated,
      orders: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        queueNumber: o.queueNumber,
        status: o.status,
        paymentMethod: o.paymentMethod,
        customerName: o.customerName,
        createdAt: o.createdAt.toISOString(),
        itemCount: o.items.reduce((n, it) => n + it.quantity, 0),
        total: orderGrandTotal(
          o.items.map((i) => ({
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            optionsPrice: Number(i.optionsPrice),
          })),
          Number(o.deliveryFee),
          Number(o.discountAmount),
        ),
        shiftRound: o.shift?.roundNumber ?? null,
        calendarDate: o.shift?.calendarDate
          ? o.shift.calendarDate.toISOString().slice(0, 10)
          : null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
