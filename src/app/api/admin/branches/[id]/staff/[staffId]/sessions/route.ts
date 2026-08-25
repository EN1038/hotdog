import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";
import { STAFF_REVOKE_SESSIONS_ACTION } from "@/lib/admin-activity-shared";
import { revokeStaffAuthSessionsForPhone } from "@/lib/staff-auth-session";

type Params = { params: Promise<{ id: string; staffId: string }> };

/** DELETE — revoke every live login slot for this staff phone. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id: branchId, staffId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const existing = await prisma.staff.findFirst({
      where: { id: staffId, branchId },
      select: { id: true, phone: true, name: true },
    });
    if (!existing) return jsonError("ไม่พบพนักงาน", 404);

    await revokeStaffAuthSessionsForPhone(existing.phone);

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: STAFF_REVOKE_SESSIONS_ACTION,
      summary: `ปลดเครื่องเข้าใช้งาน ${existing.name || existing.phone}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId: ctx?.id ?? branchId,
      branchName: ctx?.name ?? null,
      entityType: "staff",
      entityId: existing.id,
      entityName: existing.name || existing.phone,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
