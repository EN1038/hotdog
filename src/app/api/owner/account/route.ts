import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

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
