import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { normalizePhone, formatThaiPhone } from "@/lib/constants";
import { consumeOtpChallenge } from "@/lib/otp-challenge";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

const schema = z.object({
  phone: z.string().min(9),
  challengeId: z.string().min(1),
  otpCode: z.string().min(4),
});

async function resolveOwnerBrandId(session: Awaited<ReturnType<typeof requireAdmin>>) {
  const ids = getAccessibleBrandIds(session);
  if (ids === null || ids.length === 0) return null;
  return ids[0] ?? null;
}

export async function POST(request: Request) {
  try {
    await ensureProdSchemaCompat();
    const session = await requireAdmin();
    const brandId = await resolveOwnerBrandId(session);
    if (!brandId) {
      return jsonError("ไม่พบแบรนด์ที่เข้าถึงได้", 404);
    }

    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    const verified = await consumeOtpChallenge({
      phone,
      challengeId: body.challengeId,
      otpCode: body.otpCode.trim(),
      purpose: "owner_alert_sms",
    });
    if (!verified.ok) {
      return jsonError(verified.message, verified.status);
    }

    const branches = await prisma.branch.findMany({
      where: { brandId, isHidden: false, kind: { not: "WAREHOUSE" } },
      select: { id: true, operatingMode: true },
    });

    await prisma.$transaction(async (tx) => {
      for (const branch of branches) {
        await tx.branch.update({
          where: { id: branch.id },
          data: {
            alertSmsPhone: phone,
            smsNotifyNewOrder: branch.operatingMode !== "SKEWER",
            smsNotifySkewerOrder: true,
          },
        });
      }
      await tx.brand.update({
        where: { id: brandId },
        data: {
          lineNotifyNewOrder: false,
          lineNotifySkewerOrder: false,
          lineNotifyDailySummary: false,
        },
      });
    });

    return jsonOk({
      ok: true,
      phone,
      phoneLabel: formatThaiPhone(phone),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
