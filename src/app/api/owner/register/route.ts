import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError } from "@/lib/api";
import { normalizePhone } from "@/lib/constants";
import { attachSessionCookie } from "@/lib/auth";
import { consumeOtpChallenge } from "@/lib/otp-challenge";
import { getDefaultTrialDays } from "@/lib/brand-plan-catalog";
import { createOwnerRegistration } from "@/lib/owner-register-setup";
import { OWNER_REGISTER_IMPORT_OPTIONS } from "@/lib/owner-register-shared";
import {
  categoryAllowsMasterImportFrom,
  resolveOwnerRegisterCategory,
} from "@/lib/owner-register-category";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

const importIds = OWNER_REGISTER_IMPORT_OPTIONS.map((o) => o.id) as [
  "full",
  "none",
];

const schema = z.object({
  phone: z.string().min(9),
  challengeId: z.string().min(1),
  otpCode: z.string().min(4).max(8),
  shopName: z.string().trim().min(2, "กรุณากรอกชื่อร้าน").max(80),
  shopCategory: z.string().trim().min(2).max(64),
  importMaster: z.enum(importIds).optional().default("none"),
});

export async function POST(request: Request) {
  try {
    await ensureProdSchemaCompat();
    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    if (phone.length < 9) {
      return jsonError("เบอร์โทรไม่ถูกต้อง");
    }

    const category = await resolveOwnerRegisterCategory(body.shopCategory);
    if (!category) {
      return jsonError("ประเภทร้านไม่ถูกต้องหรือปิดใช้งานแล้ว", 400);
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
    if (!categoryAllowsMasterImportFrom(category)) {
      importMaster = "none";
    }

    const result = await createOwnerRegistration({
      phone,
      shopName: body.shopName,
      shopCategory: body.shopCategory,
      importMaster,
      category,
    });

    const importRequested =
      importMaster !== "none" && categoryAllowsMasterImportFrom(category);
    const importWarning =
      importRequested && !result.importSummary
        ? "ไม่พบต้นแบบหมาล่าไวไวในระบบ — กรุณาติดต่อทีมงานหรือตั้งค่า OWNER_REGISTER_MENU_TEMPLATE_BRANCH_ID"
        : null;

    const trialDays = await getDefaultTrialDays();

    const res = NextResponse.json({
      ok: true,
      shopName: result.brandName,
      brandCode: result.brandCode,
      trialDays,
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
