import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  isTaximailConfigured,
  taximailSendOtp,
} from "@/lib/taximail";
import { OTP_PURPOSES } from "@/lib/otp-challenge";
import { OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "@/lib/otp-ttl";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import {
  filterStaffLoginMemberships,
  staffLoginSelect,
} from "@/lib/staff-login";
import { STAFF_LOGIN_UNREGISTERED } from "@/lib/staff-session-limits";
import { findExistingStaffBrandsForPhone } from "@/lib/owner-register-staff-check";

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
    let existingStaffBrands:
      | Awaited<ReturnType<typeof findExistingStaffBrandsForPhone>>
      | undefined;
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
    } else if (body.purpose === "owner") {
      const admin = await prisma.admin.findFirst({
        where: {
          isPlatformAdmin: false,
          OR: [{ phone }, { username: phone }],
        },
        select: {
          id: true,
          brandMembers: { select: { brandId: true }, take: 1 },
        },
      });
      if (!admin || admin.brandMembers.length === 0) {
        return jsonError("เบอร์นี้ยังไม่ได้ลงทะเบียนเป็นเจ้าของร้าน", 404);
      }
    } else if (body.purpose === "owner_register") {
      const admin = await prisma.admin.findFirst({
        where: {
          isPlatformAdmin: false,
          OR: [{ phone }, { username: phone }],
        },
        select: { id: true },
      });
      if (admin) {
        return jsonError("เบอร์นี้สมัครแล้ว — กรุณาเข้าสู่ระบบ", 409, {
          redirect: "/owner/login",
        });
      }
      existingStaffBrands = await findExistingStaffBrandsForPhone(phone);
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
        createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent && !recent.consumedAt) {
      const waitSec = Math.ceil(
        (recent.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS - Date.now()) / 1000,
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
      resendIn: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
      ...(existingStaffBrands?.length
        ? { existingStaffBrands }
        : {}),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
