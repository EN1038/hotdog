import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireBbqWeighBranch } from "@/lib/bbq-branch";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";
import { sessionGrandTotal } from "@/lib/table-session-totals";

type Params = { params: Promise<{ id: string }> };

const openSchema = z.object({
  tableId: z.string().min(1),
  note: z.string().max(500).optional().nullable(),
});

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);
    const gate = await requireBbqWeighBranch(branchId);
    if ("error" in gate && gate.error) return gate.error;

    const status = new URL(request.url).searchParams.get("status");
    const whereStatus =
      status === "CLOSED"
        ? ("CLOSED" as const)
        : status === "OPEN"
          ? ("OPEN" as const)
          : undefined;

    const sessions = await prisma.tableSession.findMany({
      where: {
        branchId,
        ...(whereStatus ? { status: whereStatus } : {}),
      },
      include: {
        table: { select: { id: true, name: true, token: true } },
        lines: { orderBy: { createdAt: "asc" } },
        closedByAdmin: { select: { id: true, username: true } },
      },
      orderBy: { openedAt: "desc" },
      take: whereStatus === "CLOSED" ? 100 : 50,
    });

    return jsonOk(
      sessions.map((s) => {
        const lines = s.lines.map((l) => ({
          ...l,
          weightKg: l.weightKg != null ? Number(l.weightKg) : null,
          unitPrice: Number(l.unitPrice),
          lineTotal: Number(l.lineTotal),
        }));
        const itemsTotal = sessionGrandTotal(lines, 0);
        const discount = Number(s.discountAmount);
        return {
          ...s,
          discountAmount: discount,
          closedTotal:
            s.closedTotal != null ? Number(s.closedTotal) : null,
          lines,
          runningTotal: sessionGrandTotal(lines, discount),
          itemsTotal,
        };
      }),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session: adminSession } = await requireBranchAccess(branchId);
    const gate = await requireBbqWeighBranch(branchId);
    if ("error" in gate && gate.error) return gate.error;

    const body = openSchema.parse(await request.json());
    const table = await prisma.diningTable.findFirst({
      where: { id: body.tableId, branchId, isActive: true },
    });
    if (!table) return jsonError("ไม่พบโต๊ะ หรือโต๊ะถูกปิดใช้งาน", 404);

    const existingOpen = await prisma.tableSession.findFirst({
      where: { tableId: table.id, status: "OPEN" },
    });
    if (existingOpen) {
      return jsonError("โต๊ะนี้มีบิลเปิดอยู่แล้ว", 409);
    }

    const created = await prisma.tableSession.create({
      data: {
        branchId,
        tableId: table.id,
        note: body.note?.trim() || null,
      },
      include: {
        table: { select: { id: true, name: true, token: true } },
        lines: true,
      },
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(adminSession, {
      action: "bbq.session.open",
      summary: `เปิดบิลโต๊ะ ${table.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "table_session",
      entityId: created.id,
      entityName: table.name,
    });

    return jsonOk(
      {
        ...created,
        discountAmount: Number(created.discountAmount),
        closedTotal: null,
        lines: [],
        runningTotal: 0,
        itemsTotal: 0,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
