import { NextResponse } from "next/server";
import { z } from "zod";
import { attachSessionCookie, requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  filterStaffLoginMemberships,
  staffBranchChoices,
  staffLoginBrandPayload,
  staffLoginSelect,
  staffUiRoles,
  toAppStaffRoles,
} from "@/lib/staff-login";

const bodySchema = z.object({
  branchId: z.string().min(1),
});

/** GET — branches this staff phone can work at */
export async function GET() {
  try {
    const session = await requireStaff();
    const memberships = await prisma.staff.findMany({
      where: { phone: session.staffPhone, isActive: true },
      select: staffLoginSelect,
      orderBy: { createdAt: "asc" },
    });
    const filtered = filterStaffLoginMemberships(memberships);
    return jsonOk({
      currentBranchId: session.branchId,
      branches: staffBranchChoices(filtered.ok),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — switch active branch (same phone) */
export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    const { branchId } = bodySchema.parse(await request.json());

    const memberships = await prisma.staff.findMany({
      where: { phone: session.staffPhone },
      select: staffLoginSelect,
    });
    const filtered = filterStaffLoginMemberships(memberships);
    const staff = filtered.ok.find((s) => s.branchId === branchId);
    if (!staff?.branch) {
      return jsonError("ไม่มีสิทธิ์เข้าสาขานี้", 403);
    }

    const roles = staffUiRoles(staff.roles.map((r) => r.role));
    if (roles.length === 0) {
      return jsonError("ไม่พบสิทธิ์การใช้งาน", 401);
    }

    const res = NextResponse.json({
      ok: true,
      branchId: staff.branchId,
      branchName: staff.branch.name,
      roles: [...roles],
      brand: staffLoginBrandPayload(staff.branch.brand),
    });
    await attachSessionCookie(res, {
      type: "staff",
      staffPhone: session.staffPhone,
      branchId: staff.branchId,
      staffRoles: toAppStaffRoles(roles),
      branchName: staff.branch.name,
    });
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
