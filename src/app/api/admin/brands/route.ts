import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import {
  getAccessibleBrandIds,
  requirePlatformAdmin,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { DEFAULT_BRAND_COLOR, parseHexColor } from "@/lib/color";
import { logAdminActivity } from "@/lib/admin-activity";
import { hashAndSealPassword } from "@/lib/admin-password";
import {
  applyPlanPreset,
  NEW_BRAND_DEFAULTS,
  trialEndsAtFromNow,
} from "@/lib/brand-plan";
import { normalizePhone } from "@/lib/constants";

const brandSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "ต้องมีอย่างน้อย 2 ตัวอักษร")
    .regex(
      /^[a-z0-9-]+$/,
      "ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น (ห้ามภาษาไทยหรือช่องว่าง)",
    ),
  name: z.string().trim().min(1, "กรุณากรอกชื่อแบรนด์"),
  nameTh: z.string().nullable().optional(),
  nameEn: z.string().nullable().optional(),
  siteTitle: z.string().nullable().optional(),
  siteDescription: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  color: z.string().optional(),
  /** Preferred: owner phone (normalized). Becomes login id. */
  adminPhone: z.string().trim().min(9).optional(),
  adminUsername: z
    .string()
    .trim()
    .min(3, "ต้องมีอย่างน้อย 3 ตัวอักษร")
    .optional(),
  adminPassword: z.string().min(6, "ต้องมีอย่างน้อย 6 ตัวอักษร").optional(),
  status: z.enum(["TRIAL", "ACTIVE", "PAUSED", "EXPIRED"]).optional(),
  plan: z.enum(["RETAIL", "WEIGH_TABLE", "MALA", "MULTI"]).optional(),
  applyPlanPreset: z.boolean().optional(),
  maxBranches: z.number().int().min(1).max(200).optional(),
  maxStaff: z.number().int().min(1).max(500).optional(),
  stockEnabled: z.boolean().optional(),
  kitchenEnabled: z.boolean().optional(),
  bbqEnabled: z.boolean().optional(),
  skewerEnabled: z.boolean().optional(),
  serviceStartsAt: z.string().datetime().nullable().optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
});

function normalizeColor(input: string | undefined) {
  const parsed = parseHexColor(input ?? DEFAULT_BRAND_COLOR);
  return parsed?.hex ?? DEFAULT_BRAND_COLOR;
}

export async function GET() {
  try {
    const session = await requireAdmin();
    const scope = getAccessibleBrandIds(session);
    const brands = await prisma.brand.findMany({
      where: scope === null ? undefined : { id: { in: scope } },
      include: {
        _count: {
          select: {
            branches: { where: { isTest: false, kind: { not: "WAREHOUSE" } } },
            members: true,
          },
        },
        members: {
          include: {
            admin: { select: { id: true, username: true, isPlatformAdmin: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const testBrandIds = new Set(
      (
        await prisma.branch.findMany({
          where: {
            isTest: true,
            brandId: { in: brands.map((b) => b.id) },
          },
          select: { brandId: true },
          distinct: ["brandId"],
        })
      )
        .map((b) => b.brandId)
        .filter((id): id is string => Boolean(id)),
    );
    return jsonOk(
      brands.map((b) => ({
        ...b,
        hasTestBranch: testBrandIds.has(b.id),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    const body = brandSchema.parse(await request.json());
    const existing = await prisma.brand.findUnique({
      where: { code: body.code },
    });
    if (existing) return jsonError("รหัสแบรนด์ซ้ำ");

    const phoneRaw = body.adminPhone?.trim() || body.contactPhone?.trim() || "";
    const phone = phoneRaw ? normalizePhone(phoneRaw) : "";
    const username = phone
      ? phone
      : body.adminUsername?.trim().toLowerCase() || "";
    if (!username || username.length < 3) {
      return jsonError("กรุณาระบุเบอร์โทรเจ้าของร้าน");
    }
    if (phone && phone.length < 9) {
      return jsonError("เบอร์โทรไม่ถูกต้อง");
    }

    const password =
      body.adminPassword?.trim() ||
      (phone.length >= 6 ? phone : "") ||
      "";
    if (password.length < 6) {
      return jsonError("กรุณากำหนดรหัสผ่านอย่างน้อย 6 ตัวอักษร");
    }

    const dupUsername = await prisma.admin.findUnique({ where: { username } });
    if (dupUsername) {
      return jsonError(
        phone
          ? "เบอร์นี้มีบัญชีเจ้าของอยู่แล้ว"
          : "ไอดีผู้ใช้ซ้ำ กรุณาใช้ชื่ออื่น",
      );
    }
    if (phone) {
      const dupPhone = await prisma.admin.findFirst({ where: { phone } });
      if (dupPhone) return jsonError("เบอร์นี้มีบัญชีเจ้าของอยู่แล้ว");
    }

    const { passwordHash, passwordEnc } = await hashAndSealPassword(password);

    const plan = body.plan ?? NEW_BRAND_DEFAULTS.plan;
    const usePreset = body.applyPlanPreset !== false;
    const preset = usePreset ? applyPlanPreset(plan) : null;
    const status = body.status ?? NEW_BRAND_DEFAULTS.status;
    const serviceStartsAt = body.serviceStartsAt
      ? new Date(body.serviceStartsAt)
      : new Date();
    const trialEndsAt =
      body.trialEndsAt !== undefined
        ? body.trialEndsAt
          ? new Date(body.trialEndsAt)
          : null
        : status === "TRIAL"
          ? trialEndsAtFromNow()
          : null;

    const brand = await prisma.$transaction(async (tx) => {
      const created = await tx.brand.create({
        data: {
          code: body.code,
          name: body.name,
          nameTh: body.nameTh?.trim() || null,
          nameEn: body.nameEn?.trim() || null,
          siteTitle: body.siteTitle?.trim() || null,
          siteDescription: body.siteDescription?.trim() || null,
          logoUrl: body.logoUrl ?? null,
          coverImageUrl: body.coverImageUrl ?? null,
          contactPhone: phone || body.contactPhone?.replace(/\D/g, "").trim() || null,
          color: normalizeColor(body.color),
          status,
          plan,
          maxBranches:
            body.maxBranches ??
            preset?.maxBranches ??
            NEW_BRAND_DEFAULTS.maxBranches,
          maxStaff:
            body.maxStaff ?? preset?.maxStaff ?? NEW_BRAND_DEFAULTS.maxStaff,
          stockEnabled:
            body.stockEnabled ??
            preset?.stockEnabled ??
            NEW_BRAND_DEFAULTS.stockEnabled,
          kitchenEnabled:
            body.kitchenEnabled ??
            preset?.kitchenEnabled ??
            NEW_BRAND_DEFAULTS.kitchenEnabled,
          bbqEnabled:
            body.bbqEnabled ??
            preset?.bbqEnabled ??
            NEW_BRAND_DEFAULTS.bbqEnabled,
          skewerEnabled:
            body.skewerEnabled ??
            preset?.skewerEnabled ??
            NEW_BRAND_DEFAULTS.skewerEnabled,
          serviceStartsAt,
          trialEndsAt,
        },
      });

      const admin = await tx.admin.create({
        data: {
          username,
          phone: phone || null,
          passwordHash,
          passwordEnc,
          isPlatformAdmin: false,
        },
      });

      await tx.brandMember.create({
        data: {
          adminId: admin.id,
          brandId: created.id,
          role: "OWNER",
        },
      });

      return tx.brand.update({
        where: { id: created.id },
        data: { primaryAdminId: admin.id },
      });
    });

    await logAdminActivity(session, {
      action: "brand.create",
      summary: `สร้างแบรนด์ ${brand.name} (/ ${brand.code}) · เจ้าของ ${username}`,
      brandId: brand.id,
      brandName: brand.name,
      entityType: "brand",
      entityId: brand.id,
      entityName: brand.name,
      metadata: { code: brand.code, adminUsername: username, phone: phone || null },
    });

    return jsonOk(
      {
        ...brand,
        createdAdminUsername: username,
        createdAdminPhone: phone || null,
        createdAdminPassword: password,
      },
      201,
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError("ข้อมูลซ้ำในระบบ (รหัสแบรนด์หรือไอดีผู้ใช้)", 409);
    }
    return handleApiError(error);
  }
}
