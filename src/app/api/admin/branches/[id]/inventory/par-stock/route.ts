import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  analyzeBranchParStock,
  loadBranchParStockRows,
  setManualParStockMany,
} from "@/lib/inventory/inventory-par-stock";
import { parseInventoryAnalysisRange } from "@/lib/inventory/inventory-date";
import { parseSkewerParPolicyFromSearchParams, skewerParPolicyFromBody } from "@/lib/inventory/inventory-par-policy";
import { bangkokDateKey } from "@/lib/constants";
import { PAR_STOCK_LABEL, PAR_STOCK_SHORT_LABEL } from "@/lib/inventory/inventory-par-labels";

type Params = { params: Promise<{ id: string }> };

function parseRangeFromUrl(searchParams: URLSearchParams) {
  return parseInventoryAnalysisRange(
    searchParams.get("from"),
    searchParams.get("to"),
    bangkokDateKey(),
  );
}

const patchItemSchema = z.object({
  menuItemId: z.string().min(1),
  parStock: z.number().int().min(0),
});

const patchSchema = z
  .object({
    menuItemId: z.string().min(1).optional(),
    parStock: z.number().int().min(0).optional(),
    items: z.array(patchItemSchema).min(1).max(500).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    parGrades: z.string().optional(),
    maxA: z.number().int().min(0).max(200).optional(),
    maxB: z.number().int().min(0).max(200).optional(),
    maxC: z.number().int().min(0).max(200).optional(),
    branchParMin: z.number().int().min(0).max(5000).optional(),
    branchParMax: z.number().int().min(0).max(5000).optional(),
    holdDays: z.number().int().min(1).max(7).optional(),
  })
  .refine(
    (body) =>
      (body.items != null && body.items.length > 0) ||
      (body.menuItemId != null && body.parStock != null),
    { message: `ต้องระบุรายการ${PAR_STOCK_SHORT_LABEL}ที่จะบันทึก` },
  );

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, kind: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (branch.kind === "WAREHOUSE") {
      return jsonError("สาขาคลังกลางไม่มีเมนูขาย");
    }

    const { searchParams } = new URL(request.url);
    const range = parseRangeFromUrl(searchParams);
    if (!range) return jsonError("รูปแบบวันที่ไม่ถูกต้อง");

    const skewerPolicy = parseSkewerParPolicyFromSearchParams(searchParams);
    const result = await loadBranchParStockRows(branchId, range, { skewerPolicy });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = patchSchema.parse(await request.json());

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

    const items =
      body.items ??
      (body.menuItemId != null && body.parStock != null
        ? [{ menuItemId: body.menuItemId, parStock: body.parStock }]
        : []);

    const { updated } = await setManualParStockMany({
      branchId,
      items,
      adminId: session.adminId,
    });

    await logAdminActivity(session, {
      action: "branch.update",
      summary:
        items.length === 1
          ? `ตั้ง${PAR_STOCK_LABEL} ${items[0]!.parStock} สาขา ${branch.name}`
          : `บันทึก${PAR_STOCK_LABEL} ${updated} เมนู สาขา ${branch.name}`,
      branchId: branch.id,
      branchName: branch.name,
      entityType: items.length === 1 ? "menu_item" : "branch",
      entityId: items.length === 1 ? items[0]!.menuItemId : branch.id,
      metadata: { items, updated, source: "MANUAL" },
    });

    const result = await loadBranchParStockRows(branchId, range, { skewerPolicy });
    return jsonOk({ ...result, updated });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_PAR") {
        return jsonError(`${PAR_STOCK_LABEL}ต้องเป็นจำนวนเต็ม ≥ 0`);
      }
      if (error.message === "MENU_NOT_FOUND") {
        return jsonError("ไม่พบเมนูในสาขานี้");
      }
      if (error.message === "STOCK_MUTATION_FORBIDDEN") {
        return jsonError("ไม่สามารถบันทึกได้ เพราะสต็อกเปลี่ยนระหว่างบันทึก กรุณาลองใหม่");
      }
    }
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = z
      .object({
        action: z.literal("analyze"),
        from: z.string().optional(),
        to: z.string().optional(),
        coverageDays: z.number().int().min(1).max(30).optional(),
        safetyPct: z.number().int().min(0).max(100).optional(),
        parGrades: z.string().optional(),
        maxA: z.number().int().min(0).max(200).optional(),
        maxB: z.number().int().min(0).max(200).optional(),
        maxC: z.number().int().min(0).max(200).optional(),
        branchParMin: z.number().int().min(0).max(5000).optional(),
        branchParMax: z.number().int().min(0).max(5000).optional(),
        holdDays: z.number().int().min(1).max(7).optional(),
      })
      .parse(await request.json());

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

    const analyzed = await analyzeBranchParStock({
      branchId,
      from: range.from,
      to: range.to,
      coverageDays: body.coverageDays,
      safetyPct: body.safetyPct,
      skewerPolicy,
    });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `วิเคราะห์${PAR_STOCK_LABEL} ${analyzed.updated} เมนู สาขา ${branch.name}`,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "branch",
      entityId: branch.id,
      metadata: analyzed,
    });

    const result = await loadBranchParStockRows(branchId, range, { skewerPolicy });
    return jsonOk({ ...result, analyzed });
  } catch (error) {
    return handleApiError(error);
  }
}
