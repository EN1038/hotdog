import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import type { SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { normalizePhone } from "@/lib/constants";
import { isTaximailConfigured, taximailSendOtp } from "@/lib/taximail";
import { OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "@/lib/otp-ttl";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

const schema = z.object({
  phone: z.string().min(9),
});

async function resolveOwnerBrandId(session: SessionPayload): Promise<string | null> {
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

    if (!isTaximailConfigured()) {
      return jsonError("ยังไม่ได้ตั้งค่า Taximail OTP", 503);
    }

    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    if (phone.length < 9) {
      return jsonError("เบอร์โทรไม่ถูกต้อง");
    }

    const recent = await prisma.customerOtpChallenge.findFirst({
      where: {
        phone,
        purpose: "owner_alert_sms",
        createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent && !recent.consumedAt) {
      const waitSec = Math.ceil(
        (recent.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS - Date.now()) /
          1000,
      );
      return jsonError(
        `ส่งรหัสไปแล้ว กรุณารอ ${Math.max(waitSec, 1)} วินาทีก่อนขอใหม่`,
        429,
      );
    }

    const sent = await taximailSendOtp(phone);
    const challenge = await prisma.customerOtpChallenge.create({
      data: {
        phone,
        purpose: "owner_alert_sms",
        messageId: sent.messageId,
        otpRefNo: sent.otpRefNo,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    return jsonOk({
      ok: true,
      challengeId: challenge.id,
      otpRefNo: challenge.otpRefNo,
      expiresIn: Math.floor(OTP_TTL_MS / 1000),
      resendIn: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
