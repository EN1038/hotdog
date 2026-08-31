import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import {
  deleteTomorrowPlan,
  getTomorrowPlanDetail,
  updateTomorrowPlan,
} from "@/lib/inventory/inventory-tomorrow-plan-records";
import { BranchTomorrowPlanStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string; planId: string }> };

async function loadStoreBranch(branchId: string) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, kind: true },
  });
  if (!branch) return { error: jsonError("ไม่พบสาขา", 404) };
  if (branch.kind === "WAREHOUSE") {
    return { error: jsonError("สาขาคลังกลางไม่มีเมนูขาย") };
  }
  return { branch };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId, planId } = await params;
    await requireBranchAccess(branchId);
    await ensureProdSchemaCompat();
    const loaded = await loadStoreBranch(branchId);
    if ("error" in loaded && loaded.error) return loaded.error;

    const planDate =
      new URL(request.url).searchParams.get("planDate") ?? undefined;
    const detail = await getTomorrowPlanDetail({
      branchId,
      planId,
      planDate: planDate || undefined,
    });
    return jsonOk(detail);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError("ไม่พบแผนผลิต", 404);
    }
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  status: z.nativeEnum(BranchTomorrowPlanStatus).optional(),
  note: z.string().max(500).nullable().optional(),
  items: z
    .array(
      z.object({
        lineId: z.string().min(1),
        confirmedQty: z.number().int().min(0),
      }),
    )
    .max(500)
    .optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId, planId } = await params;
    const { session } = await requireBranchAccess(branchId);
    await ensureProdSchemaCompat();
    const loaded = await loadStoreBranch(branchId);
    if ("error" in loaded && loaded.error) return loaded.error;
    const branch = loaded.branch!;

    const body = patchSchema.parse(await request.json());
    const detail = await updateTomorrowPlan({
      branchId,
      planId,
      adminId: session.adminId,
      status: body.status,
      note: body.note,
      items: body.items,
    });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `แก้ไขแผนผลิต-เติม ${detail.planDate} สาขา ${branch.name}`,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "tomorrow_plan",
      entityId: planId,
      metadata: { status: body.status, itemCount: body.items?.length },
    });

    return jsonOk(detail);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") return jsonError("ไม่พบแผนผลิต", 404);
      if (error.message === "INVALID_QTY") {
        return jsonError("จำนวนส่งผลิตต้องเป็นจำนวนเต็ม ≥ 0");
      }
      if (error.message === "LINE_NOT_FOUND") {
        return jsonError("ไม่พบรายการในแผนนี้");
      }
    }
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id: branchId, planId } = await params;
    const { session } = await requireBranchAccess(branchId);
    await ensureProdSchemaCompat();
    const loaded = await loadStoreBranch(branchId);
    if ("error" in loaded && loaded.error) return loaded.error;
    const branch = loaded.branch!;

    await deleteTomorrowPlan({ branchId, planId });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `ลบแผนผลิต-เติม สาขา ${branch.name}`,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "tomorrow_plan",
      entityId: planId,
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError("ไม่พบแผนผลิต", 404);
    }
    return handleApiError(error);
  }
}
