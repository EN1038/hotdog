import { randomInt } from "crypto";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { ADMIN_LINE_LINK_CODE_TTL_MS } from "@/lib/line";
import { logAdminActivity } from "@/lib/admin-activity";

async function getSelfAdmin(adminId: string) {
  return prisma.admin.findUnique({
    where: { id: adminId },
    select: {
      id: true,
      username: true,
      lineUserId: true,
      lineNotifyEnabled: true,
      lineNotifyDailySummary: true,
      lineLinkCode: true,
      lineLinkCodeExpiresAt: true,
      brandMembers: {
        where: { role: { in: ["OWNER", "MANAGER"] } },
        select: {
          role: true,
          brand: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session.adminId) return jsonError("ไม่มีสิทธิ์", 403);

    const admin = await getSelfAdmin(session.adminId);
    if (!admin) return jsonError("ไม่พบผู้ใช้", 404);

    const now = new Date();
    const codeActive =
      Boolean(admin.lineLinkCode) &&
      admin.lineLinkCodeExpiresAt != null &&
      admin.lineLinkCodeExpiresAt.getTime() > now.getTime();

    return jsonOk({
      username: admin.username,
      linked: Boolean(admin.lineUserId),
      lineNotifyEnabled: admin.lineNotifyEnabled,
      lineNotifyDailySummary: admin.lineNotifyDailySummary,
      canReceiveDailySummary: admin.brandMembers.length > 0,
      brands: admin.brandMembers.map((m) => ({
        id: m.brand.id,
        name: m.brand.name,
        role: m.role,
      })),
      activeCode: codeActive ? admin.lineLinkCode : null,
      codeExpiresAt: codeActive
        ? admin.lineLinkCodeExpiresAt?.toISOString() ?? null
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Issue a fresh 6-digit one-time LINE link code for the logged-in admin. */
export async function POST() {
  try {
    const session = await requireAdmin();
    if (!session.adminId) return jsonError("ไม่มีสิทธิ์", 403);

    const admin = await getSelfAdmin(session.adminId);
    if (!admin) return jsonError("ไม่พบผู้ใช้", 404);
    if (admin.brandMembers.length === 0) {
      return jsonError(
        "ต้องเป็นเจ้าของหรือผู้จัดการแบรนด์จึงจะเชื่อม LINE สำหรับสรุปรอบขายได้",
        403,
      );
    }

    let code = "";
    for (let i = 0; i < 12; i += 1) {
      const candidate = String(randomInt(100000, 1000000));
      const clash = await prisma.admin.findFirst({
        where: {
          lineLinkCode: candidate,
          lineLinkCodeExpiresAt: { gt: new Date() },
          NOT: { id: admin.id },
        },
        select: { id: true },
      });
      if (!clash) {
        code = candidate;
        break;
      }
    }
    if (!code) return jsonError("สร้างรหัสไม่สำเร็จ กรุณาลองใหม่");

    const expiresAt = new Date(Date.now() + ADMIN_LINE_LINK_CODE_TTL_MS);
    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        lineLinkCode: code,
        lineLinkCodeExpiresAt: expiresAt,
      },
    });

    await logAdminActivity(session, {
      action: "line.link_code.create",
      summary: "สร้างรหัสเชื่อม LINE สำหรับแอดมิน",
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    return jsonOk({
      code,
      expiresAt: expiresAt.toISOString(),
      ttlSeconds: Math.floor(ADMIN_LINE_LINK_CODE_TTL_MS / 1000),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Unlink LINE from this admin account. */
export async function DELETE() {
  try {
    const session = await requireAdmin();
    if (!session.adminId) return jsonError("ไม่มีสิทธิ์", 403);

    await prisma.admin.update({
      where: { id: session.adminId },
      data: {
        lineUserId: null,
        lineLinkCode: null,
        lineLinkCodeExpiresAt: null,
      },
    });

    await logAdminActivity(session, {
      action: "line.unlink",
      summary: "ยกเลิกการเชื่อม LINE ของแอดมิน",
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
