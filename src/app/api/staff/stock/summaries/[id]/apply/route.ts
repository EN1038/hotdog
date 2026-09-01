import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";
import { resolveStaffStockConvertActor } from "@/lib/stock-count-convert-auth";
import { convertStockCountSummary } from "@/lib/stock-count-convert";

const bodySchema = z.object({
  action: z.enum(["apply", "reject"]).default("apply"),
  note: z.string().trim().max(300).nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

/** POST — เจ้าของ/ผู้จัดการ Convert หรือปฏิเสธสรุปยอดจากหน้าร้าน */
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();
    await assertBrandWriteAllowedByBranchId(session.branchId);
    const { id: countId } = await params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    if (!session.staffPhone) {
      return jsonError("ไม่พบเบอร์พนักงาน", 401);
    }

    const staffRow = await prisma.staff.findFirst({
      where: {
        phone: session.staffPhone,
        branchId: session.branchId,
        isActive: true,
      },
      select: { id: true },
    });

    const actor = await resolveStaffStockConvertActor({
      branchId: session.branchId,
      staffPhone: session.staffPhone,
      staffId: staffRow?.id ?? null,
    });
    if (!actor) {
      return jsonError(
        "เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่ Convert / ปฏิเสธได้",
        403,
      );
    }

    const result = await convertStockCountSummary({
      branchId: session.branchId,
      countId,
      action: body.action,
      note: body.note,
      actor,
    });

    if (!result.ok) {
      return jsonError(result.error);
    }

    return jsonOk({
      ok: true,
      status: result.status,
      adjustedItemCount: result.adjustedItemCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
