import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("phone") ?? "";
    const excludeId = searchParams.get("excludeId");
    const branchId = searchParams.get("branchId");
    const phone = normalizePhone(raw);

    if (phone.length < 9) {
      return jsonOk({
        phone,
        available: null,
        reason: "incomplete",
      });
    }

    // Same phone OK on other branches; block only if already on this branch
    if (branchId) {
      const onBranch = await prisma.staff.findFirst({
        where: {
          phone,
          branchId,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: {
          id: true,
          name: true,
          branch: { select: { name: true } },
        },
      });
      if (onBranch) {
        return jsonOk({
          phone,
          available: false,
          staffId: onBranch.id,
          staffName: onBranch.name,
          branchName: onBranch.branch.name,
          reason: "same_branch",
        });
      }

      const peers = await prisma.staff.findMany({
        where: { phone, NOT: { branchId } },
        select: {
          id: true,
          name: true,
          branch: { select: { id: true, name: true } },
        },
        take: 10,
      });
      return jsonOk({
        phone,
        available: true,
        multiBranch: peers.length > 0,
        otherBranches: peers.map((p) => ({
          staffId: p.id,
          staffName: p.name,
          branchId: p.branch.id,
          branchName: p.branch.name,
        })),
      });
    }

    const existing = await prisma.staff.findMany({
      where: {
        phone,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: {
        id: true,
        name: true,
        branch: { select: { name: true } },
      },
      take: 10,
    });

    if (existing.length === 0) {
      return jsonOk({ phone, available: true });
    }

    return jsonOk({
      phone,
      available: true,
      multiBranch: true,
      otherBranches: existing.map((p) => ({
        staffId: p.id,
        staffName: p.name,
        branchName: p.branch.name,
      })),
      // Legacy fields for old UI
      staffId: existing[0]!.id,
      staffName: existing[0]!.name,
      branchName: existing[0]!.branch.name,
      notice: "เบอร์นี้มีในสาขาอื่นแล้ว — เพิ่มในสาขานี้ได้",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
