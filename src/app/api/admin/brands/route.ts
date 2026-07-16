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
  adminUsername: z
    .string()
    .trim()
    .min(3, "ต้องมีอย่างน้อย 3 ตัวอักษร")
    .optional(),
  adminPassword: z.string().min(6, "ต้องมีอย่างน้อย 6 ตัวอักษร").optional(),
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
        _count: { select: { branches: true, members: true } },
        members: {
          include: {
            admin: { select: { id: true, username: true, isPlatformAdmin: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk(brands);
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

    if (!body.adminUsername || !body.adminPassword) {
      return jsonError("กรุณากำหนดไอดีและรหัสผ่านสำหรับผู้ดูแลแบรนด์");
    }

    const username = body.adminUsername.trim().toLowerCase();
    const dupAdmin = await prisma.admin.findUnique({ where: { username } });
    if (dupAdmin) return jsonError("ไอดีผู้ใช้ซ้ำ กรุณาใช้ชื่ออื่น");

    const { passwordHash, passwordEnc } = await hashAndSealPassword(
      body.adminPassword,
    );

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
          contactPhone: body.contactPhone?.replace(/\D/g, "").trim() || null,
          color: normalizeColor(body.color),
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
          brandId: created.id,
          role: "OWNER",
        },
      });

      return created;
    });

    await logAdminActivity(session, {
      action: "brand.create",
      summary: `สร้างแบรนด์ ${brand.name} (/ ${brand.code}) · ผู้ดูแล ${username}`,
      brandId: brand.id,
      brandName: brand.name,
      entityType: "brand",
      entityId: brand.id,
      entityName: brand.name,
      metadata: { code: brand.code, adminUsername: username },
    });

    return jsonOk(
      {
        ...brand,
        createdAdminUsername: username,
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
