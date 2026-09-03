import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { normalizePhone } from "@/lib/constants";
import { logAdminActivity } from "@/lib/admin-activity";

const patchSchema = z.object({
  username: z.string().trim().min(3).max(64).optional(),
  phone: z.string().nullable().optional(),
});

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session.adminId) {
      return jsonError("ไม่พบบัญชี", 404);
    }

    const admin = await prisma.admin.findUnique({
      where: { id: session.adminId },
      select: {
        id: true,
        username: true,
        phone: true,
        isPlatformAdmin: true,
      },
    });
    if (!admin || admin.isPlatformAdmin) {
      return jsonError("ไม่พบบัญชีเจ้าของ", 404);
    }

    return jsonOk({
      adminId: admin.id,
      username: admin.username,
      phone: admin.phone,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin();
    if (!session.adminId) {
      return jsonError("ไม่พบบัญชี", 404);
    }

    const body = patchSchema.parse(await request.json());
    if (body.username === undefined && body.phone === undefined) {
      return jsonError("ไม่มีข้อมูลที่จะบันทึก");
    }

    const admin = await prisma.admin.findUnique({
      where: { id: session.adminId },
      select: {
        id: true,
        username: true,
        phone: true,
        isPlatformAdmin: true,
      },
    });
    if (!admin || admin.isPlatformAdmin) {
      return jsonError("ไม่พบบัญชีเจ้าของ", 404);
    }

    const data: {
      username?: string;
      phone?: string | null;
    } = {};

    if (body.username !== undefined) {
      const username = body.username.trim().toLowerCase();
      if (username.length < 3) {
        return jsonError("ชื่อเข้าสู่ระบบสั้นเกินไป");
      }
      const dup = await prisma.admin.findFirst({
        where: { username, NOT: { id: admin.id } },
      });
      if (dup) return jsonError("ชื่อเข้าสู่ระบบนี้ถูกใช้แล้ว");
      data.username = username;
    }

    if (body.phone !== undefined) {
      if (body.phone === null || !body.phone.trim()) {
        data.phone = null;
      } else {
        const phone = normalizePhone(body.phone);
        if (phone.length < 9) {
          return jsonError("กรุณากรอกเบอร์โทรให้ครบ");
        }
        data.phone = phone;
      }
    }

    const updated = await prisma.admin.update({
      where: { id: admin.id },
      data,
      select: { id: true, username: true, phone: true },
    });

    await logAdminActivity(session, {
      action: "brand.account.update",
      summary: `เจ้าของแก้ไขบัญชีตัวเอง (${updated.username})`,
      entityType: "admin",
      entityId: updated.id,
      entityName: updated.username,
      metadata: {
        changedUsername: body.username !== undefined,
        changedPhone: body.phone !== undefined,
      },
    });

    return jsonOk({
      adminId: updated.id,
      username: updated.username,
      phone: updated.phone,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
