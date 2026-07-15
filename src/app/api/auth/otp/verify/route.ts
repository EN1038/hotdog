import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { completeCustomerLogin } from "@/lib/customer-login";
import {
  isTaximailConfigured,
  taximailVerifyOtp,
} from "@/lib/taximail";

const schema = z.object({
  phone: z.string().min(9),
  otpCode: z.string().trim().min(4).max(8),
  challengeId: z.string().min(1),
  name: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    if (!isTaximailConfigured()) {
      return jsonError("ยังไม่ได้ตั้งค่า Taximail OTP", 503);
    }

    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    const challenge = await prisma.customerOtpChallenge.findUnique({
      where: { id: body.challengeId },
    });

    if (!challenge || challenge.phone !== phone) {
      return jsonError("ไม่พบคำขอรหัส OTP", 400);
    }
    if (challenge.consumedAt) {
      return jsonError("รหัสนี้ถูกใช้แล้ว กรุณาขอรหัสใหม่");
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      return jsonError("รหัสหมดอายุ กรุณาขอรหัสใหม่");
    }

    const valid = await taximailVerifyOtp(challenge.messageId, body.otpCode);
    if (!valid) {
      return jsonError("รหัส OTP ไม่ถูกต้อง", 401);
    }

    await prisma.customerOtpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    const name = body.name ?? challenge.pendingName;
    const result = await completeCustomerLogin({ phone, name });
    if (result.needsName) {
      return jsonOk({ needsName: true });
    }

    return jsonOk({
      ok: true,
      phone: result.phone,
      name: result.name,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
