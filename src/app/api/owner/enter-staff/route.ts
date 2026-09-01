import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, attachSessionCookie } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { isTestBranch } from "@/lib/branch-test";
import { markStaffPhoneVerified } from "@/lib/otp-challenge";
import {
  issueStaffAuthSession,
  claimStaffDeviceSlotForOwner,
  staffDeviceIdPattern,
} from "@/lib/staff-auth-session";
import {
  staffUiRoles,
  toAppStaffRoles,
} from "@/lib/staff-login";
import {
  attachOwnerStashCookie,
  ensureOwnerStaffOnBranches,
  readSessionCookieToken,
  resolveOwnerPhoneForBrand,
} from "@/lib/owner-staff-bridge";

const bodySchema = z.object({
  deviceId: z.string().trim().regex(staffDeviceIdPattern),
  branchId: z.string().min(1).optional(),
  brandId: z.string().min(1).optional(),
});

/**
 * แม่ค้าคนเดียว: จากเซสชันเจ้าของ → เข้าโหมดขายหน้าร้านทันที
 * (stash เซสชัน admin ไว้ แล้วออก cookie staff)
 */
export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    if (session.isPlatformAdmin) {
      return jsonError("บัญชีแพลตฟอร์มใช้หน้าแอดมินแทน", 403);
    }

    const accessible = getAccessibleBrandIds(session);
    const brandIds = accessible ?? [];
    if (brandIds.length === 0) {
      return jsonError("บัญชีนี้ยังไม่ได้ผูกกับร้าน", 403);
    }

    const body = bodySchema.parse(await request.json());
    const brandId =
      body.brandId && brandIds.includes(body.brandId)
        ? body.brandId
        : brandIds[0]!;

    const owner = await resolveOwnerPhoneForBrand(brandId);
    if (!owner) {
      return jsonError(
        "ยังไม่มีเบอร์เจ้าของ — ตั้งเบอร์ในบัญชีหรือเบอร์ติดต่อร้านก่อน",
        400,
      );
    }
    if (owner.adminId !== session.adminId) {
      return jsonError(
        "โหมดขายด่วนใช้ได้กับเจ้าของหลัก — หรือล็อกอินหน้าพนักงานตามปกติ",
        403,
      );
    }

    const branches = await prisma.branch.findMany({
      where: { brandId },
      select: {
        id: true,
        name: true,
        kind: true,
        isHidden: true,
        isOpen: true,
        code: true,
        isTest: true,
      },
      orderBy: { name: "asc" },
    });

    const sellBranches = branches.filter(
      (b) =>
        !b.isHidden &&
        b.kind !== "WAREHOUSE" &&
        !isTestBranch(b),
    );
    const pool = sellBranches.length > 0 ? sellBranches : branches.filter(
      (b) => !b.isHidden && b.kind !== "WAREHOUSE",
    );

    if (pool.length === 0) {
      return jsonError("ยังไม่มีสาขาสำหรับขายหน้าร้าน", 400);
    }

    if (!body.branchId && pool.length > 1) {
      return jsonOk({
        ok: true,
        needsBranchSelect: true,
        branches: pool.map((b) => ({
          branchId: b.id,
          branchName: b.name,
          isOpen: b.isOpen,
        })),
      });
    }

    const branchId =
      body.branchId && pool.some((b) => b.id === body.branchId)
        ? body.branchId
        : pool[0]!.id;

    await ensureOwnerStaffOnBranches({
      brandId,
      phone: owner.phone,
      name: owner.name,
      branchIds: [branchId],
    });

    const staff = await prisma.staff.findFirst({
      where: {
        phone: owner.phone,
        branchId,
        isActive: true,
      },
      include: {
        roles: true,
        branch: { select: { name: true } },
      },
    });
    if (!staff?.branch) {
      return jsonError("สร้างบัญชีพนักงานไม่สำเร็จ", 500);
    }

    const roles = staffUiRoles(staff.roles.map((r) => r.role));
    if (roles.length === 0) {
      return jsonError("ไม่มีสิทธิ์ขายหน้าร้าน", 403);
    }

    await claimStaffDeviceSlotForOwner(owner.phone, body.deviceId);

    await markStaffPhoneVerified(owner.phone).catch(() => null);

    const adminToken = await readSessionCookieToken();
    if (!adminToken) {
      return jsonError("ไม่พบเซสชันเจ้าของร้าน", 401);
    }

    const issued = await issueStaffAuthSession({
      phone: owner.phone,
      deviceId: body.deviceId,
      userAgent: request.headers.get("user-agent"),
    });

    const res = NextResponse.json({
      ok: true,
      branchId: staff.branchId,
      branchName: staff.branch.name,
      roles: [...roles],
    });

    attachOwnerStashCookie(res, adminToken);
    await attachSessionCookie(res, {
      type: "staff",
      staffPhone: owner.phone,
      branchId: staff.branchId,
      staffRoles: toAppStaffRoles(roles),
      branchName: staff.branch.name,
      jti: issued.tokenJti,
      deviceId: issued.deviceId,
    });

    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
