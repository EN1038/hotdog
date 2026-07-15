import { z } from "zod";
import {
  requireBrandAccess,
  requirePlatformAdmin,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { hashAndSealPassword, decryptAdminPassword } from "@/lib/admin-password";
import { logAdminActivity } from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(6).max(128).optional(),
  role: z.enum(["OWNER", "MANAGER"]).optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params;
    const session = await requireBrandAccess(brandId);
    const isPlatform = Boolean(session.isPlatformAdmin);

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, name: true, code: true },
    });
    if (!brand) return jsonError("ไม่พบแบรนด์", 404);

    const members = await prisma.brandMember.findMany({
      where: { brandId },
      include: {
        admin: {
          select: {
            id: true,
            username: true,
            isPlatformAdmin: true,
            createdAt: true,
            ...(isPlatform ? { passwordEnc: true } : {}),
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const items = members
      .filter((m) => !m.admin.isPlatformAdmin)
      .map((m) => {
        const recovered = isPlatform
          ? decryptAdminPassword(
              "passwordEnc" in m.admin
                ? (m.admin.passwordEnc as string | null)
                : null,
            )
          : null;
        return {
          membershipId: m.id,
          role: m.role,
          adminId: m.admin.id,
          username: m.admin.username,
          createdAt: m.admin.createdAt,
          ...(isPlatform
            ? {
                password: recovered,
                passwordRecoverable: Boolean(recovered),
              }
            : {}),
        };
      });

    return jsonOk({
      brand,
      canManage: isPlatform,
      members: items,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id: brandId } = await params;
    const body = createSchema.parse(await request.json());
    const username = body.username.trim().toLowerCase();

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, name: true, code: true },
    });
    if (!brand) return jsonError("ไม่พบแบรนด์", 404);

    const existingUser = await prisma.admin.findUnique({ where: { username } });
    if (existingUser) {
      if (existingUser.isPlatformAdmin) {
        return jsonError("ไม่สามารถผูกบัญชีแพลตฟอร์มเข้าแบรนด์ได้");
      }
      const already = await prisma.brandMember.findUnique({
        where: {
          adminId_brandId: { adminId: existingUser.id, brandId },
        },
      });
      if (already) return jsonError("ไอดีนี้เป็นผู้ดูแลแบรนด์นี้อยู่แล้ว");

      await prisma.brandMember.create({
        data: {
          adminId: existingUser.id,
          brandId,
          role: body.role ?? "OWNER",
        },
      });

      await logAdminActivity(session, {
        action: "brand.admin.link",
        summary: `ผูกผู้ดูแล ${username} เข้าแบรนด์ ${brand.name}`,
        brandId: brand.id,
        brandName: brand.name,
        entityType: "admin",
        entityId: existingUser.id,
        entityName: username,
      });

      return jsonOk({ ok: true, adminId: existingUser.id, linked: true }, 201);
    }

    if (!body.password) {
      return jsonError("กรุณากำหนดรหัสผ่านสำหรับผู้ดูแลใหม่");
    }

    const { passwordHash, passwordEnc } = await hashAndSealPassword(
      body.password,
    );
    const created = await prisma.$transaction(async (tx) => {
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
          brandId,
          role: body.role ?? "OWNER",
        },
      });
      return admin;
    });

    await logAdminActivity(session, {
      action: "brand.admin.create",
      summary: `เพิ่มผู้ดูแล ${username} ให้แบรนด์ ${brand.name}`,
      brandId: brand.id,
      brandName: brand.name,
      entityType: "admin",
      entityId: created.id,
      entityName: username,
    });

    return jsonOk(
      { ok: true, adminId: created.id, username, password: body.password },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
