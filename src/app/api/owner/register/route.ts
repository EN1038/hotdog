import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError } from "@/lib/api";
import { hashAndSealPassword } from "@/lib/admin-password";
import { NEW_BRAND_DEFAULTS, trialEndsAtFromNow } from "@/lib/brand-plan";
import { slugifyCode, withUniqueSuffix } from "@/lib/slug";
import { attachSessionCookie } from "@/lib/auth";
import { DEFAULT_BRAND_COLOR } from "@/lib/color";
import { normalizePhone } from "@/lib/constants";

const schema = z.object({
  shopName: z.string().trim().min(2, "กรุณากรอกชื่อร้าน"),
  phone: z.string().optional(),
  username: z
    .string()
    .trim()
    .min(3, "ไอดีต้องมีอย่างน้อย 3 ตัวอักษร"),
  password: z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"),
});

async function uniqueBrandCode(shopName: string): Promise<string> {
  const base = slugifyCode(shopName) || "shop";
  const existing = await prisma.brand.findMany({ select: { code: true } });
  const taken = new Set(existing.map((b) => b.code));
  return withUniqueSuffix(base, taken);
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const username = body.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return jsonError("ไอดีใช้ได้เฉพาะ a-z, 0-9, จุด, - และ _");
    }

    const dupAdmin = await prisma.admin.findUnique({ where: { username } });
    if (dupAdmin) return jsonError("ไอดีนี้มีคนใช้แล้ว กรุณาใช้ชื่ออื่น");

    const phone = body.phone ? normalizePhone(body.phone) : "";
    const code = await uniqueBrandCode(body.shopName);
    const { passwordHash, passwordEnc } = await hashAndSealPassword(
      body.password,
    );

    const result = await prisma.$transaction(async (tx) => {
      const brand = await tx.brand.create({
        data: {
          code,
          name: body.shopName.trim(),
          contactPhone: phone || null,
          color: DEFAULT_BRAND_COLOR,
          status: NEW_BRAND_DEFAULTS.status,
          plan: NEW_BRAND_DEFAULTS.plan,
          maxBranches: NEW_BRAND_DEFAULTS.maxBranches,
          maxStaff: NEW_BRAND_DEFAULTS.maxStaff,
          stockEnabled: NEW_BRAND_DEFAULTS.stockEnabled,
          kitchenEnabled: NEW_BRAND_DEFAULTS.kitchenEnabled,
          bbqEnabled: NEW_BRAND_DEFAULTS.bbqEnabled,
          skewerEnabled: NEW_BRAND_DEFAULTS.skewerEnabled,
          trialEndsAt: trialEndsAtFromNow(),
        },
      });

      const admin = await tx.admin.create({
        data: {
          username,
          passwordHash,
          passwordEnc,
          isPlatformAdmin: false,
        },
      });

      await tx.brandMember.create({
        data: {
          adminId: admin.id,
          brandId: brand.id,
          role: "OWNER",
        },
      });

      await tx.brand.update({
        where: { id: brand.id },
        data: { primaryAdminId: admin.id },
      });

      await tx.branch.create({
        data: {
          brandId: brand.id,
          code: "main",
          name: "สาขาหลัก",
          phone: phone || null,
          isOpen: false,
        },
      });

      return { brand, admin };
    });

    const res = NextResponse.json({
      ok: true,
      shopName: result.brand.name,
      username,
      trialDays: NEW_BRAND_DEFAULTS.trialDays,
    });
    await attachSessionCookie(res, {
      type: "admin",
      adminId: result.admin.id,
      username,
      isPlatformAdmin: false,
      brandIds: [result.brand.id],
    });
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
