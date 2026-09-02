import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError } from "@/lib/api";
import { normalizePhone } from "@/lib/constants";
import { attachSessionCookie } from "@/lib/auth";
import { consumeOtpChallenge } from "@/lib/otp-challenge";
import {
  OWNER_REGISTER_IMPORT_OPTIONS,
  OWNER_REGISTER_TRIAL_DAYS,
  OWNER_SHOP_CATEGORY_IDS,
  categoryAllowsMasterImport,
} from "@/lib/owner-register-shared";
import { createOwnerRegistration } from "@/lib/owner-register-setup";
import { findExistingStaffBrandsForPhone } from "@/lib/owner-register-staff-check";

const importIds = OWNER_REGISTER_IMPORT_OPTIONS.map((o) => o.id) as [
  "none",
  "menu",
  "full",
];

const schema = z.object({
  phone: z.string().min(9),
  challengeId: z.string().min(1),
  otpCode: z.string().min(4).max(8),
  shopName: z.string().trim().min(2, "กรุณากรอกชื่อร้าน").max(80),
  shopCategory: z.enum(OWNER_SHOP_CATEGORY_IDS),
  importMaster: z.enum(importIds).optional().default("none"),
  /** Required when phone is already staff on another brand. */
  acknowledgeExistingStaff: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    if (phone.length < 9) {
      return jsonError("เบอร์โทรไม่ถูกต้อง");
    }

    const dup = await prisma.admin.findFirst({
      where: {
        isPlatformAdmin: false,
        OR: [{ phone }, { username: phone }],
      },
      select: { id: true },
    });
    if (dup) {
      return jsonError("เบอร์นี้สมัครแล้ว — กรุณาเข้าสู่ระบบ", 409, {
        redirect: "/owner/login",
      });
    }

    const existingStaffBrands = await findExistingStaffBrandsForPhone(phone);
    if (existingStaffBrands.length > 0 && !body.acknowledgeExistingStaff) {
      const brandNames = existingStaffBrands.map((b) => b.brandName).join(", ");
      return jsonError(
        `เบอร์นี้เป็นพนักงานของ ${brandNames} อยู่แล้ว — ยืนยันเพื่อเปิดร้านใหม่แยกจากร้านเดิม`,
        409,
        {
          code: "EXISTING_STAFF",
          existingStaffBrands,
        },
      );
    }

    const otp = await consumeOtpChallenge({
      phone,
      challengeId: body.challengeId,
      otpCode: body.otpCode.trim(),
      purpose: "owner_register",
    });
    if (!otp.ok) {
      return jsonError(otp.message, otp.status);
    }

    let importMaster = body.importMaster;
    if (!categoryAllowsMasterImport(body.shopCategory)) {
      importMaster = "none";
    }

    const result = await createOwnerRegistration({
      phone,
      shopName: body.shopName,
      shopCategory: body.shopCategory,
      importMaster,
    });

    const importRequested =
      importMaster !== "none" && categoryAllowsMasterImport(body.shopCategory);
    const importWarning =
      importRequested && !result.importSummary
        ? "ไม่พบต้นแบบหมาล่าไวไวในระบบ — กรุณาติดต่อทีมงานหรือตั้งค่า OWNER_REGISTER_MENU_TEMPLATE_BRANCH_ID"
        : null;

    const res = NextResponse.json({
      ok: true,
      shopName: result.brandName,
      brandCode: result.brandCode,
      trialDays: OWNER_REGISTER_TRIAL_DAYS,
      trialEndsAt: result.trialEndsAt.toISOString(),
      branchId: result.branchId,
      importSummary: result.importSummary,
      importWarning,
      redirect: "/owner/welcome",
    });

    await attachSessionCookie(res, {
      type: "admin",
      adminId: result.adminId,
      username: phone,
      isPlatformAdmin: false,
      brandIds: [result.brandId],
    });

    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
