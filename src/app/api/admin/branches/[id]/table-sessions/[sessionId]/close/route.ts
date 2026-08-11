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

type Params = { params: Promise<{ id: string; sessionId: string }> };

const closeSchema = z.object({
  paymentMethod: z.enum(["CASH", "TRANSFER"]),
  discountAmount: z.number().min(0).optional(),
  note: z.string().max(500).optional().nullable(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId, sessionId } = await params;
    const { session: adminSession } = await requireBranchAccess(branchId);
    const gate = await requireBbqWeighBranch(branchId);
    if ("error" in gate && gate.error) return gate.error;

    const open = await prisma.tableSession.findFirst({
      where: { id: sessionId, branchId, status: "OPEN" },
      include: {
        table: { select: { name: true } },
        lines: true,
      },
    });
    if (!open) return jsonError("ไม่พบบิลเปิด", 404);

    const body = closeSchema.parse(await request.json());
    const discount =
      body.discountAmount !== undefined
        ? body.discountAmount
        : Number(open.discountAmount);
    const closedTotal = sessionGrandTotal(
      open.lines.map((l) => ({ lineTotal: l.lineTotal })),
      discount,
    );

    const closed = await prisma.tableSession.update({
      where: { id: sessionId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        paymentMethod: body.paymentMethod,
        discountAmount: discount,
        closedTotal,
        note: body.note !== undefined ? body.note?.trim() || null : open.note,
        closedByAdminId: adminSession.adminId,
      },
      include: {
        table: { select: { id: true, name: true, token: true } },
        lines: { orderBy: { createdAt: "asc" } },
        closedByAdmin: { select: { id: true, username: true } },
      },
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(adminSession, {
      action: "bbq.session.close",
      summary: `ปิดบิลโต๊ะ ${open.table.name} · ฿${closedTotal.toLocaleString("th-TH")}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "table_session",
      entityId: sessionId,
      entityName: open.table.name,
      metadata: {
        paymentMethod: body.paymentMethod,
        closedTotal,
      },
    });

    return jsonOk({
      ...closed,
      discountAmount: Number(closed.discountAmount),
      closedTotal: Number(closed.closedTotal),
      lines: closed.lines.map((l) => ({
        ...l,
        weightKg: l.weightKg != null ? Number(l.weightKg) : null,
        unitPrice: Number(l.unitPrice),
        lineTotal: Number(l.lineTotal),
      })),
      runningTotal: closedTotal,
      itemsTotal: sessionGrandTotal(
        closed.lines.map((l) => ({ lineTotal: l.lineTotal })),
        0,
      ),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
