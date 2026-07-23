import { OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getOperatingRoundStatus } from "@/lib/operating-day";
import { createOrderWithDailyQueue } from "@/lib/order-queue";

const schema = z.object({
  photoUrl: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine(
      (v) => v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/"),
      "รูปไม่ถูกต้อง",
    ),
  note: z.string().trim().max(300).optional(),
});

function walkInPhone(branchId: string) {
  return `walkin:${branchId}`;
}

/** Open a queue slot with a reference photo; items keyed later. */
export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    const body = schema.parse(await request.json());

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

    const phone = walkInPhone(session.branchId);
    const customer = await prisma.customer.upsert({
      where: { phone },
      create: { phone, name: "Walk-in" },
      update: {},
    });

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
              customerId: customer.id,
              branchId: session.branchId,
              fulfillmentType: "PICKUP",
              customerName: "Walk-in",
              customerPhone: phone,
              isNewCustomer: false,
              note: body.note?.trim() || "เปิดคิวจากรูป — รอคีย์รายการ",
              paymentMethod: PaymentMethod.CASH,
              deliveryFee: new Prisma.Decimal(0),
              discountAmount: new Prisma.Decimal(0),
              promoSummary: null,
              createdByStaffId: session.staffId,
              photoUrl: body.photoUrl,
              awaitingPhotoKey: true,
              status: OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
            },
            include: {
              branch: true,
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

    return jsonOk(order, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
