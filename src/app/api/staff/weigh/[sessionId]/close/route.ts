import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireBbqWeighBranch } from "@/lib/bbq-branch";
import { sessionGrandTotal } from "@/lib/table-session-totals";

type Params = { params: Promise<{ sessionId: string }> };

const closeSchema = z.object({
  paymentMethod: z.enum(["CASH", "TRANSFER"]),
  discountAmount: z.number().min(0).optional(),
  note: z.string().max(500).optional().nullable(),
});

/** POST — close staff weigh bill */
export async function POST(request: Request, { params }: Params) {
  try {
    const { sessionId } = await params;
    const session = await requireStaff();
    const gate = await requireBbqWeighBranch(session.branchId);
    if ("error" in gate && gate.error) return gate.error;

    const open = await prisma.tableSession.findFirst({
      where: {
        id: sessionId,
        branchId: session.branchId,
        status: "OPEN",
      },
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
      },
      include: {
        table: { select: { id: true, name: true, token: true } },
        lines: { orderBy: { createdAt: "asc" } },
      },
    });

    const lines = closed.lines.map((l) => ({
      ...l,
      weightKg: l.weightKg != null ? Number(l.weightKg) : null,
      unitPrice: Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
    }));

    return jsonOk({
      ...closed,
      discountAmount: Number(closed.discountAmount),
      closedTotal: Number(closed.closedTotal),
      lines,
      runningTotal: closedTotal,
      itemsTotal: sessionGrandTotal(lines, 0),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
