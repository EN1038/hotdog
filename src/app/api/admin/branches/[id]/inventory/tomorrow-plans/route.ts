import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import { listTomorrowPlans } from "@/lib/inventory/inventory-tomorrow-plan-records";

type Params = { params: Promise<{ id: string }> };

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

    const { searchParams } = new URL(request.url);
    const parsed = z
      .object({
        q: z.string().optional(),
        status: z.enum(["ALL", "CONFIRMED", "CANCELLED"]).optional(),
      })
      .parse({
        q: searchParams.get("q") ?? undefined,
        status: searchParams.get("status") ?? undefined,
      });

    const result = await listTomorrowPlans({
      branchId,
      q: parsed.q,
      status: parsed.status,
    });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
