import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { attachSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { completeCustomerLogin } from "@/lib/customer-login";
import { isTaximailConfigured } from "@/lib/taximail";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import {
  filterStaffLoginMemberships,
  staffBranchChoices,
  staffLoginBrandPayload,
  staffLoginSelect,
  staffUiRoles,
  toAppStaffRoles,
} from "@/lib/staff-login";

const adminSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

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
      const { username, password } = adminSchema.parse(body);
      const admin = await prisma.admin.findUnique({
        where: { username },
        select: {
          id: true,
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
        username,
        isPlatformAdmin,
        brandIds,
      });
      return res;
    }

    if (type === "staff") {
      await ensureProdSchemaCompat();
      const staffBody = z
        .object({
          phone: z.string().min(9),
          branchId: z.string().min(1).optional(),
        })
        .parse(body);
      const normalized = normalizePhone(staffBody.phone);
      const memberships = await prisma.staff.findMany({
        where: { phone: normalized },
        select: staffLoginSelect,
        orderBy: { createdAt: "asc" },
      });

      const filtered = filterStaffLoginMemberships(memberships);
      if (filtered.ok.length === 0) {
        return jsonError(filtered.blockedReason ?? "ไม่พบเบอร์โทรนี้ในระบบ", 401);
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
