import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { bangkokDateKey } from "@/lib/constants";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  applyBranchInitialStockIn,
  exportStockRecommendationsCsv,
  loadBranchStockRecommendations,
  parseStockRecommendRange,
} from "@/lib/stock-recommendation";

type Params = { params: Promise<{ id: string }> };

const applySchema = z.object({
  action: z.literal("apply_initial"),
  note: z.string().trim().max(300).optional(),
  lines: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, kind: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (branch.kind === "WAREHOUSE") {
      return jsonError("สาขาคลังกลางไม่มีเมนูขาย");
    }

    const { searchParams } = new URL(request.url);
    const range = parseStockRecommendRange(
      searchParams.get("from"),
      searchParams.get("to"),
      bangkokDateKey(),
    );
    if (!range) return jsonError("รูปแบบวันที่ไม่ถูกต้อง");

    const coverDaysRaw = Number.parseInt(
      searchParams.get("coverDays") ?? "",
      10,
    );
    const coverDays =
      Number.isFinite(coverDaysRaw) && coverDaysRaw >= 1 && coverDaysRaw <= 30
        ? coverDaysRaw
        : undefined;

    const result = await loadBranchStockRecommendations({
      branchId,
      from: range.from,
      to: range.to,
      coverDays,
    });

    if (searchParams.get("format") === "csv") {
      const csv = exportStockRecommendationsCsv(branch.name, result);
      const filename = `stock-recommend_${branch.name}_${range.from}_${range.to}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        },
      });
    }

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

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

    const batchId = `init_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const { applied } = await applyBranchInitialStockIn({
      branchId,
      lines: body.lines,
      note: body.note,
      batchId,
    });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `เติมสต๊อกแนะนำ ${applied} รายการ สาขา ${branch.name}`,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "branch",
      entityId: branch.id,
      entityName: branch.name,
    });

    return jsonOk({ ok: true, applied, batchId });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith("MENU_NOT_FOUND")) {
        return jsonError("มีรายการเมนูที่ไม่ตรงกับสาขา");
      }
      if (error.message === "INVALID_QTY") {
        return jsonError("จำนวนรับเข้าไม่ถูกต้อง");
      }
    }
    return handleApiError(error);
  }
}
