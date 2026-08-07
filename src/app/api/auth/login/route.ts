import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { attachSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { StaffRole } from "@prisma/client";
import { completeCustomerLogin } from "@/lib/customer-login";
import { isTaximailConfigured } from "@/lib/taximail";

const adminSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const staffSchema = z.object({
  phone: z.string().min(9),
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
      const { phone } = staffSchema.parse(body);
      const normalized = normalizePhone(phone);
      // Critical for prod: use select only — `include: { branch }` pulls every
      // Branch scalar (e.g. isTest). If migrate not deployed, Prisma crashes
      // on login and Cloudflare returns 504 (works locally with full schema).
      const staff = await prisma.staff.findUnique({
        where: { phone: normalized },
        select: {
          id: true,
          phone: true,
          isActive: true,
          branchId: true,
          roles: { select: { role: true } },
          branch: {
            select: {
              id: true,
              name: true,
              brand: {
                select: {
                  code: true,
                  name: true,
                  nameTh: true,
                  nameEn: true,
                  color: true,
                  siteTitle: true,
                  siteDescription: true,
                },
              },
            },
          },
        },
      });
      if (!staff || !staff.isActive) {
        return jsonError("ไม่พบเบอร์โทรนี้ในระบบ", 401);
      }

      const dbRoles = new Set(staff.roles.map((r) => r.role));
      const roles =
        dbRoles.has(StaffRole.SELLER) && dbRoles.has(StaffRole.DELIVERY)
          ? (["BOTH"] as const)
          : dbRoles.has(StaffRole.SELLER)
            ? (["SELLER"] as const)
            : dbRoles.has(StaffRole.DELIVERY)
              ? (["DELIVERY"] as const)
              : ([] as const);

      if (roles.length === 0) {
        return jsonError("ไม่พบสิทธิ์การใช้งาน", 401);
      }
      if (!staff.branch) {
        return jsonError("พนักงานยังไม่ได้ผูกสาขา", 403);
      }
      const brand = staff.branch.brand;
      const res = NextResponse.json({
        ok: true,
        branchName: staff.branch.name,
        roles: [...roles],
        brand: brand
          ? {
              code: brand.code,
              name: brand.name,
              nameTh: brand.nameTh,
              nameEn: brand.nameEn,
              // Logo loads later via /api/staff/branding (avoid huge payload / OOM)
              logoUrl: null as string | null,
              color: brand.color,
              siteTitle: brand.siteTitle,
              siteDescription: brand.siteDescription,
            }
          : null,
      });
      await attachSessionCookie(res, {
        type: "staff",
        staffPhone: normalized,
        branchId: staff.branchId,
        staffRoles: [...roles],
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
