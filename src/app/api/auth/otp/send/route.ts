import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  isTaximailConfigured,
  taximailSendOtp,
} from "@/lib/taximail";

const RESEND_COOLDOWN_MS = 60_000;
const OTP_TTL_MS = 5 * 60_000;

const schema = z.object({
  phone: z.string().min(9),
  name: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    if (!isTaximailConfigured()) {
      return jsonError("ยังไม่ได้ตั้งค่า Taximail OTP", 503);
    }

    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    if (phone.length < 9) {
      return jsonError("เบอร์โทรไม่ถูกต้อง");
    }

    const existing = await prisma.customer.findUnique({ where: { phone } });
    if (!existing && !body.name) {
      return jsonOk({ needsName: true });
    }

    const recent = await prisma.customerOtpChallenge.findFirst({
      where: { phone, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
      orderBy: { createdAt: "desc" },
    });
    if (recent && !recent.consumedAt) {
      const waitSec = Math.ceil(
        (recent.createdAt.getTime() + RESEND_COOLDOWN_MS - Date.now()) / 1000,
      );
      return jsonError(
        `ส่งรหัสไปแล้ว กรุณารอ ${Math.max(waitSec, 1)} วินาทีก่อนขอใหม่`,
        429,
      );
    }

    const pendingName = body.name ?? existing?.name ?? null;
    const sent = await taximailSendOtp(phone);
    const challenge = await prisma.customerOtpChallenge.create({
      data: {
        phone,
        messageId: sent.messageId,
        otpRefNo: sent.otpRefNo,
        pendingName,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    return jsonOk({
      ok: true,
      challengeId: challenge.id,
      otpRefNo: challenge.otpRefNo,
      expiresIn: Math.floor(OTP_TTL_MS / 1000),
      resendIn: Math.floor(RESEND_COOLDOWN_MS / 1000),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
