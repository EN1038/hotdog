import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  applyRecommendedParStock,
  loadBranchParStockRows,
} from "@/lib/inventory/inventory-par-stock";
import { skewerParPolicyFromBody } from "@/lib/inventory/inventory-par-policy";
import { parseInventoryAnalysisRange } from "@/lib/inventory/inventory-date";
import { bangkokDateKey } from "@/lib/constants";
import { PAR_STOCK_LABEL } from "@/lib/inventory/inventory-par-labels";

type Params = { params: Promise<{ id: string }> };

const applySchema = z.object({
  menuItemIds: z.array(z.string().min(1)),
  from: z.string().optional(),
  to: z.string().optional(),
  parGrades: z.string().optional(),
  maxA: z.number().int().min(0).max(200).optional(),
  maxB: z.number().int().min(0).max(200).optional(),
  maxC: z.number().int().min(0).max(200).optional(),
  branchParMin: z.number().int().min(0).max(5000).optional(),
  branchParMax: z.number().int().min(0).max(5000).optional(),
  holdDays: z.number().int().min(1).max(7).optional(),
  zeroIneligible: z.boolean().optional(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = applySchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, kind: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (branch.kind === "WAREHOUSE") {
      return jsonError("สาขาคลังกลางไม่มีเมนูขาย");
    }

    const range = parseInventoryAnalysisRange(
      body.from,
      body.to,
      bangkokDateKey(),
    );
    if (!range) return jsonError("รูปแบบวันที่ไม่ถูกต้อง");

    const skewerPolicy = skewerParPolicyFromBody(body);

    const { applied } = await applyRecommendedParStock({
      branchId,
      menuItemIds: body.menuItemIds,
      adminId: session.adminId,
      range,
      skewerPolicy,
      zeroIneligible: body.zeroIneligible ?? true,
    });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `ใช้${PAR_STOCK_LABEL}ที่แนะนำ ${applied} เมนู สาขา ${branch.name}`,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "branch",
      entityId: branch.id,
      metadata: { menuItemIds: body.menuItemIds, applied },
    });

    const result = await loadBranchParStockRows(branchId, range, { skewerPolicy });
    return jsonOk({ ...result, applied });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith("NO_RECOMMENDATION")) {
        return jsonError("มีรายการที่ยังไม่มีค่าแนะนำ — กด「วิเคราะห์ใหม่」ก่อน");
      }
      if (error.message === "EMPTY_SELECTION") {
        return jsonError("ยังไม่ได้เลือกรายการ");
      }
      if (
        error.message.includes("expired transaction") ||
        error.message.includes("Transaction API error")
      ) {
        return jsonError(
          "บันทึกใช้เวลานานเกินไป กรุณาลองเลือกน้อยลงหรือลองอีกครั้ง",
          408,
        );
      }
    }
    return handleApiError(error);
  }
}
