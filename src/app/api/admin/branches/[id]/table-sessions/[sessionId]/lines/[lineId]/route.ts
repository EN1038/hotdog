import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireBbqWeighBranch } from "@/lib/bbq-branch";
import { sessionGrandTotal } from "@/lib/table-session-totals";

type Params = {
  params: Promise<{ id: string; sessionId: string; lineId: string }>;
};

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id: branchId, sessionId, lineId } = await params;
    await requireBranchAccess(branchId);
    const gate = await requireBbqWeighBranch(branchId);
    if ("error" in gate && gate.error) return gate.error;

    const open = await prisma.tableSession.findFirst({
      where: { id: sessionId, branchId, status: "OPEN" },
    });
    if (!open) return jsonError("ไม่พบบิลเปิด", 404);

    const line = await prisma.tableSessionLine.findFirst({
      where: { id: lineId, sessionId },
    });
    if (!line) return jsonError("ไม่พบรายการ", 404);

    await prisma.tableSessionLine.delete({ where: { id: lineId } });

    const refreshed = await prisma.tableSession.findFirst({
      where: { id: sessionId, branchId },
      include: {
        table: { select: { id: true, name: true, token: true } },
        lines: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!refreshed) return jsonError("ไม่พบบิล", 404);

    const lines = refreshed.lines.map((l) => ({
      ...l,
      weightKg: l.weightKg != null ? Number(l.weightKg) : null,
      unitPrice: Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
    }));
    const discount = Number(refreshed.discountAmount);

    return jsonOk({
      ...refreshed,
      discountAmount: discount,
      closedTotal: null,
      lines,
      runningTotal: sessionGrandTotal(lines, discount),
      itemsTotal: sessionGrandTotal(lines, 0),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
