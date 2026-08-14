import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  isTaximailConfigured,
  taximailSendOtp,
} from "@/lib/taximail";
import { OTP_PURPOSES } from "@/lib/otp-challenge";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import {
  filterStaffLoginMemberships,
  staffLoginSelect,
} from "@/lib/staff-login";
import { STAFF_LOGIN_UNREGISTERED } from "@/lib/staff-session-limits";

const RESEND_COOLDOWN_MS = 60_000;
const OTP_TTL_MS = 5 * 60_000;

const schema = z.object({
  phone: z.string().min(9),
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
    if (phone.length < 9) {
      return jsonError("เบอร์โทรไม่ถูกต้อง");
    }

    let pendingName: string | null = null;
    if (body.purpose === "staff") {
      const memberships = await prisma.staff.findMany({
        where: { phone },
        select: staffLoginSelect,
        orderBy: { createdAt: "asc" },
      });
      if (memberships.length === 0) {
        return jsonError("เบอร์นี้ยังไม่ได้ลงทะเบียน", 404, {
          reason: STAFF_LOGIN_UNREGISTERED,
        });
      }
      const filtered = filterStaffLoginMemberships(memberships);
      if (filtered.ok.length === 0) {
        return jsonError(
          filtered.blockedReason ?? "ไม่พบเบอร์โทรนี้ในระบบ",
          401,
        );
      }
    } else {
      const existing = await prisma.customer.findUnique({ where: { phone } });
      if (!existing && !body.name) {
        return jsonOk({ needsName: true });
      }
      pendingName = body.name ?? existing?.name ?? null;
    }

    const recent = await prisma.customerOtpChallenge.findFirst({
      where: {
        phone,
        purpose: body.purpose,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
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

    const sent = await taximailSendOtp(phone);
    const challenge = await prisma.customerOtpChallenge.create({
      data: {
        phone,
        purpose: body.purpose,
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
