import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireBbqWeighBranch } from "@/lib/bbq-branch";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);
    const gate = await requireBbqWeighBranch(branchId);
    if ("error" in gate && gate.error) return gate.error;

    const tables = await prisma.diningTable.findMany({
      where: { branchId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        sessions: {
          where: { status: "OPEN" },
          select: { id: true, openedAt: true },
          take: 1,
        },
      },
    });

    return jsonOk(
      tables.map((t) => ({
        ...t,
        openSession: t.sessions[0] ?? null,
        sessions: undefined,
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const gate = await requireBbqWeighBranch(branchId);
    if ("error" in gate && gate.error) return gate.error;

    const body = createSchema.parse(await request.json());
    const maxSort = await prisma.diningTable.aggregate({
      where: { branchId },
      _max: { sortOrder: true },
    });

    const table = await prisma.diningTable.create({
      data: {
        branchId,
        name: body.name.trim(),
        sortOrder: body.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
      },
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "bbq.table.create",
      summary: `เพิ่มโต๊ะ ${table.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "dining_table",
      entityId: table.id,
      entityName: table.name,
    });

    return jsonOk(table, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
