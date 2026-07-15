import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { hashAndSealPassword } from "@/lib/admin-password";
import { logAdminActivity } from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string; adminId: string }> };

const patchSchema = z.object({
  username: z.string().trim().min(3).max(64).optional(),
  password: z.string().min(6).max(128).optional(),
  role: z.enum(["OWNER", "MANAGER"]).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id: brandId, adminId } = await params;
    const body = patchSchema.parse(await request.json());

    if (!body.username && !body.password && !body.role) {
      return jsonError("ไม่มีข้อมูลที่จะแก้ไข");
    }

    const membership = await prisma.brandMember.findUnique({
      where: { adminId_brandId: { adminId, brandId } },
      include: {
        admin: true,
        brand: { select: { id: true, name: true, code: true } },
      },
    });
    if (!membership) return jsonError("ไม่พบผู้ดูแลในแบรนด์นี้", 404);
    if (membership.admin.isPlatformAdmin) {
      return jsonError("แก้ไขบัญชีแพลตฟอร์มจากหน้านี้ไม่ได้");
    }

    if (body.username) {
      const username = body.username.trim().toLowerCase();
      const dup = await prisma.admin.findFirst({
        where: { username, NOT: { id: adminId } },
      });
      if (dup) return jsonError("ไอดีผู้ใช้ซ้ำ");
      await prisma.admin.update({
        where: { id: adminId },
        data: { username },
      });
    }

    if (body.password) {
      const sealed = await hashAndSealPassword(body.password);
      await prisma.admin.update({
        where: { id: adminId },
        data: sealed,
      });
    }

    if (body.role) {
      await prisma.brandMember.update({
        where: { id: membership.id },
        data: { role: body.role },
      });
    }

    const updated = await prisma.admin.findUniqueOrThrow({
      where: { id: adminId },
      select: { id: true, username: true },
    });

    await logAdminActivity(session, {
      action: "brand.admin.update",
      summary: `แก้ไขผู้ดูแล ${updated.username} ของแบรนด์ ${membership.brand.name}`,
      brandId: membership.brand.id,
      brandName: membership.brand.name,
      entityType: "admin",
      entityId: updated.id,
      entityName: updated.username,
      metadata: {
        usernameChanged: Boolean(body.username),
        passwordChanged: Boolean(body.password),
        role: body.role,
      },
    });

    return jsonOk({
      ok: true,
      adminId: updated.id,
      username: updated.username,
      password: body.password ?? undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id: brandId, adminId } = await params;

    const membership = await prisma.brandMember.findUnique({
      where: { adminId_brandId: { adminId, brandId } },
      include: {
        admin: true,
        brand: { select: { id: true, name: true, code: true } },
      },
    });
    if (!membership) return jsonError("ไม่พบผู้ดูแลในแบรนด์นี้", 404);
    if (membership.admin.isPlatformAdmin) {
      return jsonError("ลบบัญชีแพลตฟอร์มจากหน้านี้ไม่ได้");
    }

    const otherCount = await prisma.brandMember.count({
      where: { brandId, NOT: { id: membership.id } },
    });
    if (otherCount === 0) {
      return jsonError("ลบไม่ได้ — แบรนด์ต้องมีผู้ดูแลอย่างน้อย 1 บัญชี");
    }

    await prisma.brandMember.delete({ where: { id: membership.id } });

    const remainingMemberships = await prisma.brandMember.count({
      where: { adminId },
    });
    if (remainingMemberships === 0) {
      await prisma.admin.delete({ where: { id: adminId } });
    }

    await logAdminActivity(session, {
      action: "brand.admin.remove",
      summary: `ถอดผู้ดูแล ${membership.admin.username} ออกจากแบรนด์ ${membership.brand.name}`,
      brandId: membership.brand.id,
      brandName: membership.brand.name,
      entityType: "admin",
      entityId: adminId,
      entityName: membership.admin.username,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
