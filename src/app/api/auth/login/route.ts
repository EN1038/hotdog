import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { attachSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { completeCustomerLogin } from "@/lib/customer-login";
import { isTaximailConfigured } from "@/lib/taximail";
import {
  consumeOtpChallenge,
  markStaffPhoneVerified,
} from "@/lib/otp-challenge";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import { clearOwnerStashCookie } from "@/lib/owner-staff-bridge";
import {
  issueStaffAuthSession,
  staffDeviceSlotAvailable,
  STAFF_LOGIN_DEVICE_LIMIT,
  STAFF_LOGIN_UNREGISTERED,
  STAFF_MAX_DEVICES,
  staffDeviceIdPattern,
} from "@/lib/staff-auth-session";
import {
  filterStaffLoginMemberships,
  staffBranchChoices,
  staffLoginBrandPayload,
  staffLoginSelect,
  staffUiRoles,
  toAppStaffRoles,
} from "@/lib/staff-login";

const customerSchema = z.object({
  phone: z.string().min(9),
  name: z.string().trim().min(1, "กรุณากรอกชื่อ").optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "admin") {
      const adminBody = z
        .object({
          username: z.string().min(1).optional(),
          password: z.string().min(1).optional(),
          phone: z.string().min(9).optional(),
          challengeId: z.string().min(1).optional(),
          otpCode: z.string().trim().min(4).max(8).optional(),
        })
        .parse(body);

      // Owner OTP login
      if (adminBody.challengeId && adminBody.otpCode && adminBody.phone) {
        await ensureProdSchemaCompat();
        if (!isTaximailConfigured()) {
          return jsonError("ยังไม่ได้ตั้งค่า Taximail OTP", 503);
        }
        const phone = normalizePhone(adminBody.phone);
        const otp = await consumeOtpChallenge({
          phone,
          challengeId: adminBody.challengeId,
          otpCode: adminBody.otpCode,
          purpose: "owner",
        });
        if (!otp.ok) return jsonError(otp.message, otp.status);

        const admin = await prisma.admin.findFirst({
          where: {
            isPlatformAdmin: false,
            OR: [{ phone }, { username: phone }],
          },
          select: {
            id: true,
            username: true,
            isPlatformAdmin: true,
            brandMembers: { select: { brandId: true } },
          },
        });
        if (!admin || admin.brandMembers.length === 0) {
          return jsonError("ไม่พบบัญชีเจ้าของร้าน", 404);
        }
        const brandIds = admin.brandMembers.map((m) => m.brandId);
        const res = NextResponse.json({
          ok: true,
          isPlatformAdmin: false,
          brandIds,
        });
        await attachSessionCookie(res, {
          type: "admin",
          adminId: admin.id,
          username: admin.username,
          isPlatformAdmin: false,
          brandIds,
        });
        clearOwnerStashCookie(res);
        return res;
      }

      const loginId = (adminBody.username ?? adminBody.phone ?? "").trim();
      const password = adminBody.password ?? "";
      if (!loginId || !password) {
        return jsonError("กรุณากรอกเบอร์/ไอดีและรหัสผ่าน");
      }
      const phoneGuess = normalizePhone(loginId);
      const admin = await prisma.admin.findFirst({
        where: {
          OR: [
            { username: loginId.toLowerCase() },
            ...(phoneGuess.length >= 9
              ? [{ phone: phoneGuess }, { username: phoneGuess }]
              : []),
          ],
        },
        select: {
          id: true,
          username: true,
          passwordHash: true,
          isPlatformAdmin: true,
          brandMembers: { select: { brandId: true } },
        },
      });
      if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
        return jsonError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401);
      }
      const brandIds = admin.brandMembers.map((m) => m.brandId);
      let isPlatformAdmin = admin.isPlatformAdmin;
      // Bootstrap: before any BrandMember rows exist, treat legacy admins as platform
      if (!isPlatformAdmin && brandIds.length === 0) {
        const memberCount = await prisma.brandMember.count();
        if (memberCount === 0) {
          isPlatformAdmin = true;
        } else {
          return jsonError("บัญชีนี้ยังไม่ได้ผูกกับแบรนด์ใด", 403);
        }
      }
      const res = NextResponse.json({
        ok: true,
        isPlatformAdmin,
        brandIds,
      });
      await attachSessionCookie(res, {
        type: "admin",
        adminId: admin.id,
        username: admin.username,
        isPlatformAdmin,
        brandIds,
      });
      if (!isPlatformAdmin) {
        clearOwnerStashCookie(res);
      }
      return res;
    }

    if (type === "staff") {
      await ensureProdSchemaCompat();
      const staffBody = z
        .object({
          phone: z.string().min(9),
          deviceId: z.string().trim().regex(staffDeviceIdPattern),
          branchId: z.string().min(1).optional(),
          challengeId: z.string().min(1).optional(),
          otpCode: z.string().trim().min(4).max(8).optional(),
        })
        .parse(body);
      const normalized = normalizePhone(staffBody.phone);
      const memberships = await prisma.staff.findMany({
        where: { phone: normalized },
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
        return jsonError(filtered.blockedReason ?? "ไม่พบเบอร์โทรนี้ในระบบ", 401);
      }

      const slot = await staffDeviceSlotAvailable(
        normalized,
        staffBody.deviceId,
      );
      if (!slot.ok) {
        return jsonError(
          `เข้าใช้งานครบ ${STAFF_MAX_DEVICES} เครื่องแล้ว`,
          403,
          {
            reason: STAFF_LOGIN_DEVICE_LIMIT,
            maxDevices: STAFF_MAX_DEVICES,
          },
        );
      }

      const phoneVerified = filtered.ok.some((s) => s.phoneVerifiedAt);
      if (isTaximailConfigured() && !phoneVerified) {
        if (!staffBody.challengeId || !staffBody.otpCode) {
          return jsonOk({ ok: true, needsOtp: true });
        }
        const consumed = await consumeOtpChallenge({
          phone: normalized,
          challengeId: staffBody.challengeId,
          otpCode: staffBody.otpCode,
          purpose: "staff",
        });
        if (!consumed.ok) {
          return jsonError(consumed.message, consumed.status);
        }
        await markStaffPhoneVerified(normalized);
      }

      let staff = filtered.ok[0]!;
      if (filtered.ok.length > 1) {
        if (!staffBody.branchId) {
          return jsonOk({
            ok: true,
            needsBranchSelect: true,
            branches: staffBranchChoices(filtered.ok),
          });
        }
        const picked = filtered.ok.find((s) => s.branchId === staffBody.branchId);
        if (!picked) {
          return jsonError("ไม่พบสาขาที่เลือกสำหรับเบอร์นี้", 400);
        }
        staff = picked;
      } else if (
        staffBody.branchId &&
        staff.branchId !== staffBody.branchId
      ) {
        return jsonError("ไม่พบสาขาที่เลือกสำหรับเบอร์นี้", 400);
      }

      const roles = staffUiRoles(staff.roles.map((r) => r.role));
      if (roles.length === 0) {
        return jsonError("ไม่พบสิทธิ์การใช้งาน", 401);
      }
      if (!staff.branch) {
        return jsonError("พนักงานยังไม่ได้ผูกสาขา", 403);
      }
      const issued = await issueStaffAuthSession({
        phone: normalized,
        deviceId: staffBody.deviceId,
        userAgent: request.headers.get("user-agent"),
      });
      const brand = staff.branch.brand;
      const res = NextResponse.json({
        ok: true,
        branchId: staff.branchId,
        branchName: staff.branch.name,
        roles: [...roles],
        brand: staffLoginBrandPayload(brand),
      });
      await attachSessionCookie(res, {
        type: "staff",
        staffPhone: normalized,
        branchId: staff.branchId,
        staffRoles: toAppStaffRoles(roles),
        branchName: staff.branch.name,
        jti: issued.tokenJti,
        deviceId: issued.deviceId,
      });
      return res;
    }

    if (type === "customer") {
      if (isTaximailConfigured()) {
        return jsonError("กรุณายืนยันด้วยรหัส OTP ที่ส่งไปยังเบอร์โทร", 400);
      }
      const { phone, name } = customerSchema.parse(body);
      const normalized = normalizePhone(phone);
      const result = await completeCustomerLogin({
        phone: normalized,
        name,
      });
      if (result.needsName) {
        return jsonOk({ needsName: true });
      }
      return jsonOk({ ok: true, name: result.name, phone: result.phone });
    }

    return jsonError("ประเภทการเข้าสู่ระบบไม่ถูกต้อง");
  } catch (error) {
    console.error(
      "[auth/login]",
      error instanceof Error ? error.message : error,
    );
    return handleApiError(error);
  }
}
