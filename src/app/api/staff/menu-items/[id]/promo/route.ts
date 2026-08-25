import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { bangkokDateKey, startOfBangkokDayFromKey } from "@/lib/constants";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set"),
    /** PERCENT 20 = ลด 20%, AMOUNT = ลดเป็นบาท */
    promoType: z.enum(["PERCENT", "AMOUNT"]),
    promoValue: z.number().positive().max(100_000),
    /** Hours from now; default end of today Bangkok */
    hours: z.number().int().min(1).max(24 * 14).optional(),
    note: z.string().trim().max(120).optional(),
  }),
  z.object({
    action: z.literal("clear"),
  }),
]);

type Params = { params: Promise<{ id: string }> };

/** POST — staff quick promo on a menu item (aging / fresh clear-out) */
export async function POST(request: Request, { params }: Params) {
  try {
    const { ensureProdSchemaCompat } = await import("@/lib/schema-compat");
    void ensureProdSchemaCompat();

    const session = await requireStaff();
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    const item = await prisma.branchMenuItem.findFirst({
      where: { id, branchId: session.branchId },
      select: { id: true, name: true, price: true },
    });
    if (!item) return jsonError("ไม่พบเมนู", 404);

    if (body.action === "clear") {
      await prisma.branchMenuItem.update({
        where: { id: item.id },
        data: {
          promoEnabled: false,
          promoType: null,
          promoValue: null,
          promoContinuous: false,
          promoStartsAt: null,
          promoEndsAt: null,
        },
      });
      return jsonOk({ ok: true, cleared: true });
    }

    if (body.promoType === "PERCENT" && body.promoValue > 90) {
      return jsonError("ลดเปอร์เซ็นต์สูงสุด 90%");
    }

    const now = new Date();
    const hours = body.hours ?? Math.max(
      1,
      Math.ceil(
        (startOfBangkokDayFromKey(bangkokDateKey()).getTime() +
          24 * 60 * 60 * 1000 -
          now.getTime()) /
          (60 * 60 * 1000),
      ),
    );
    const endsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);

    await prisma.branchMenuItem.update({
      where: { id: item.id },
      data: {
        promoEnabled: true,
        promoType: body.promoType,
        promoValue: body.promoValue,
        promoContinuous: false,
        promoStartsAt: now,
        promoEndsAt: endsAt,
      },
    });

    return jsonOk({
      ok: true,
      menuItemId: item.id,
      name: item.name,
      promoType: body.promoType,
      promoValue: body.promoValue,
      promoEndsAt: endsAt.toISOString(),
      note: body.note ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
