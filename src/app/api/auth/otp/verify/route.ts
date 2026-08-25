import { z } from "zod";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { completeCustomerLogin } from "@/lib/customer-login";
import { isTaximailConfigured } from "@/lib/taximail";
import {
  consumeOtpChallenge,
  OTP_PURPOSES,
} from "@/lib/otp-challenge";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

const schema = z.object({
  phone: z.string().min(9),
  otpCode: z.string().trim().min(4).max(8),
  challengeId: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  purpose: z.enum(OTP_PURPOSES).default("customer"),
});

export async function POST(request: Request) {
  try {
    await ensureProdSchemaCompat();
    if (!isTaximailConfigured()) {
      return jsonError("ยังไม่ได้ตั้งค่า Taximail OTP", 503);
    }

    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    const consumed = await consumeOtpChallenge({
      phone,
      challengeId: body.challengeId,
      otpCode: body.otpCode,
      purpose: body.purpose,
    });
    if (!consumed.ok) {
      return jsonError(consumed.message, consumed.status);
    }

    if (body.purpose === "staff") {
      return jsonOk({ ok: true, purpose: "staff" as const });
    }

    const name = body.name ?? consumed.pendingName;
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
