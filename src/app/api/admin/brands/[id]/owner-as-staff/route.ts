import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { ensureOwnerStaffOnBranches } from "@/lib/owner-staff-bridge";
import { resolveOwnerPhoneForBrand } from "@/lib/brand-primary-owner";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** empty / omitted = every branch of this brand */
  branchIds: z.array(z.string().min(1)).optional(),
});

/**
 * เพิ่มเบอร์เจ้าของหลักเป็นพนักงานสาขา (คนขาย + คนส่ง)
 * — แม่ค้าคนเดียวใช้เบอร์เดียวทั้ง /owner และ /staff
 * — ที่นั่งเจ้าของไม่นับโควต้าแพ็กเกจ
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params;
    const session = await requireBrandAccess(brandId);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const owner = await resolveOwnerPhoneForBrand(brandId);
    if (!owner) {
      return jsonError(
        "ยังไม่มีเบอร์เจ้าของหลัก — ตั้งเบอร์ในบัญชีเจ้าของหรือเบอร์ติดต่อแบรนด์ก่อน",
      );
    }

    const branches = await prisma.branch.findMany({
      where: {
        brandId,
        ...(body.branchIds?.length
          ? { id: { in: body.branchIds } }
          : undefined),
      },
      select: { id: true, name: true, kind: true },
    });
    if (branches.length === 0) {
      return jsonError("ไม่พบสาขาที่จะเพิ่มพนักงาน");
    }

    const before = await prisma.staff.findMany({
      where: {
        phone: owner.phone,
        branchId: { in: branches.map((b) => b.id) },
      },
      select: { branchId: true, isActive: true },
    });
    const beforeByBranch = new Map(before.map((s) => [s.branchId, s]));

    await ensureOwnerStaffOnBranches({
      brandId,
      phone: owner.phone,
      name: owner.name,
      branchIds: branches.map((b) => b.id),
    });

    const created: string[] = [];
    const skipped: string[] = [];
    const reactivated: string[] = [];
    for (const branch of branches) {
      const prev = beforeByBranch.get(branch.id);
      if (!prev) created.push(branch.name);
      else if (!prev.isActive) reactivated.push(branch.name);
      else skipped.push(branch.name);
    }

    await logAdminActivity(session, {
      action: "brand.owner_as_staff",
      summary: `เพิ่มเจ้าของเป็นพนักงาน (${owner.phone}) · สร้าง ${created.length} · เปิดใช้/เติมสิทธิ์ ${reactivated.length}`,
      brandId,
      entityType: "brand",
      entityId: brandId,
      metadata: {
        phone: owner.phone,
        created,
        reactivated,
        skipped,
      },
    });

    return jsonOk({
      phone: owner.phone,
      created,
      reactivated,
      skipped,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
