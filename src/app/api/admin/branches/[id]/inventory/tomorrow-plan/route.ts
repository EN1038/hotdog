import { z } from "zod";
import { NextResponse } from "next/server";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import {
  loadBranchTomorrowPlan,
  saveConfirmedTomorrowPlan,
} from "@/lib/inventory/inventory-tomorrow-plan";
import { exportTomorrowPlanCsv } from "@/lib/inventory/inventory-tomorrow-plan-shared";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        confirmedQty: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(500),
});

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);
    await ensureProdSchemaCompat();

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, kind: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (branch.kind === "WAREHOUSE") {
      return jsonError("สาขาคลังกลางไม่มีเมนูขาย");
    }

    const result = await loadBranchTomorrowPlan(branchId);

    const { searchParams } = new URL(request.url);
    const refillOnly = searchParams.get("refillOnly") !== "0";

    if (searchParams.get("format") === "csv") {
      const items = refillOnly
        ? result.items.filter(
            (row) => (row.confirmedQty ?? row.suggestedRefill) > 0,
          )
        : result.items;
      const csv = exportTomorrowPlanCsv(result.branchName, {
        tomorrowDate: result.tomorrowDate,
        todayDate: result.todayDate,
        items: items.map((row) => ({
          productCode: row.productCode,
          name: row.name,
          category: row.category,
          salesGradeLabel: row.salesGradeLabel,
          totalSold: row.totalSold,
          sharePct: row.sharePct,
          parStock: row.parStock,
          availableStock: row.availableStock,
          belowParQty: row.belowParQty,
          parComparison: row.parComparison,
          tomorrowTarget: row.tomorrowTarget,
          suggestedRefill: row.suggestedRefill,
          forecastQty: row.forecastQty,
          confirmedQty: row.confirmedQty ?? row.suggestedRefill,
        })),
      });
      const filename = `tomorrow-plan_${result.branchName}_${result.tomorrowDate}.csv`;
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

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    await ensureProdSchemaCompat();
    const body = patchSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, kind: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (branch.kind === "WAREHOUSE") {
      return jsonError("สาขาคลังกลางไม่มีเมนูขาย");
    }

    const { saved, planDate } = await saveConfirmedTomorrowPlan({
      branchId,
      adminId: session.adminId,
      items: body.items,
    });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `ยืนยันส่งผลิต ${saved} รายการ สาขา ${branch.name} (${planDate})`,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "branch",
      entityId: branch.id,
      metadata: { saved, planDate },
    });

    const result = await loadBranchTomorrowPlan(branchId);
    return jsonOk({ ...result, saved });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "EMPTY") {
        return jsonError("ต้องระบุรายการที่จะยืนยัน");
      }
      if (error.message === "INVALID_QTY") {
        return jsonError("จำนวนส่งผลิตต้องเป็นจำนวนเต็ม ≥ 0");
      }
      if (error.message === "MENU_NOT_FOUND") {
        return jsonError("ไม่พบเมนูในสาขานี้");
      }
      if (error.message === "SCHEMA_NOT_READY") {
        return jsonError(
          "โครงสร้างแผนผลิตยังไม่พร้อม — รีเฟรชหน้าแล้วลองยืนยันอีกครั้ง",
          503,
        );
      }
    }
    return handleApiError(error);
  }
}
